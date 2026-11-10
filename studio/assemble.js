"use strict";
// Scanner Studio – joins the scene clips into one vertical video, on the device itself.
// Each clip is drawn into a 1080x1920 canvas (cover fit), shortened to `shot` seconds, with a
// soft cross-fade between shots and a fade from/to black; the canvas is recorded with
// MediaRecorder in real time (MP4/H.264 where the browser supports it, otherwise WebM).
// No upload, no server, no extra library. The page must stay open while it records.
(function (root) {
  const DEFAULTS = { width: 1080, height: 1920, shot: 3.8, fade: 0.4, start: 0.3, fps: 30, bitrate: 12e6 };
  const MIMES = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  function pickMime() {
    if (typeof MediaRecorder === "undefined") return null;
    return MIMES.find(m => MediaRecorder.isTypeSupported(m)) || "";
  }
  function supported() {
    return typeof MediaRecorder !== "undefined" && !!document.createElement("canvas").captureStream;
  }
  // iOS Safari does not load a video it was not asked to play: start it muted (allowed without a tap),
  // then pause and seek to the start point. Every wait has a timeout, so a bad clip never hangs the job.
  function prepare(blob, start) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = "auto";
      v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
      v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none";
      document.body.append(v);
      const url = URL.createObjectURL(blob);
      let settled = false;
      const ok = () => { if (settled) return; settled = true; clearTimeout(limit); resolve({ v, url }); };
      const fail = msg => { if (settled) return; settled = true; clearTimeout(limit); release({ v, url }); reject(new Error(msg)); };
      const limit = setTimeout(() => v.readyState >= 2 ? ok() : fail("טעינת אחד הסרטונים ארכה יותר מדי"), 20000);
      v.addEventListener("error", () => fail("לא הצלחתי לפתוח את אחד הסרטונים"), { once: true });
      let ready = false;
      const onReady = () => {
        if (ready) return; ready = true;
        v.pause();
        const target = Math.min(start, Math.max(0, (v.duration || 0) - 0.1));
        if (Math.abs(v.currentTime - target) < 0.05) return ok();
        v.addEventListener("seeked", ok, { once: true });
        v.currentTime = target;
        setTimeout(ok, 1500);
      };
      v.addEventListener("loadeddata", onReady, { once: true });
      v.addEventListener("playing", onReady, { once: true });
      v.src = url; v.load();
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    });
  }
  function release(c) { if (!c) return; try { c.v.pause(); c.v.removeAttribute("src"); c.v.load(); c.v.remove(); } catch (_) {} URL.revokeObjectURL(c.url); }
  function cover(ctx, v, W, H, alpha) {
    const vw = v.videoWidth || W, vh = v.videoHeight || H, r = Math.max(W / vw, H / vh);
    const dw = vw * r, dh = vh * r;
    ctx.globalAlpha = alpha;
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
  }
  // blobs: array of video Blobs in order. Returns {blob, mime, seconds}.
  async function assemble(blobs, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    if (!blobs.length) throw new Error("אין סרטונים להרכבה");
    if (!supported()) throw new Error("הדפדפן הזה לא תומך בהרכבת וידאו");
    const W = o.width, H = o.height, n = blobs.length, total = n * o.shot - (n - 1) * o.fade;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const mime = pickMime();
    const rec = new MediaRecorder(canvas.captureStream(o.fps), Object.assign({ videoBitsPerSecond: o.bitrate }, mime ? { mimeType: mime } : {}));
    const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    if (o.onProgress) o.onProgress(0, 1, n);
    let cur = await prepare(blobs[0], o.start), next = n > 1 ? prepare(blobs[1], o.start) : null, nextClip = null;
    rec.start(1000);
    await cur.v.play().catch(() => {});
    let i = 0, shotStart = performance.now(), t0 = shotStart;
    await new Promise((resolve, reject) => {
      function frame(now) {
        try {
          const t = (now - shotStart) / 1000, all = (now - t0) / 1000;
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
          cover(ctx, cur.v, W, H, 1);
          if (i < n - 1 && t >= o.shot - o.fade) {
            if (nextClip) {
              if (nextClip.v.paused) nextClip.v.play().catch(() => {});
              cover(ctx, nextClip.v, W, H, Math.min(1, (t - (o.shot - o.fade)) / o.fade));
            }
          }
          const black = all < 0.3 ? 1 - all / 0.3 : all > total - 0.5 ? Math.min(1, (all - (total - 0.5)) / 0.5) : 0;
          if (black > 0) { ctx.globalAlpha = black; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
          if (o.onProgress) o.onProgress(Math.min(1, all / total), i + 1, n);
          if (i < n - 1 && t >= o.shot) {
            if (!nextClip) { requestAnimationFrame(frame); return; } // still loading: hold the frame
            release(cur); cur = nextClip; nextClip = null; i++;
            shotStart = now - o.fade * 1000;
            next = i < n - 1 ? prepare(blobs[i + 1], o.start) : null;
            if (next) next.then(c => { nextClip = c; }, reject);
          }
          if (all >= total) { resolve(); return; }
          requestAnimationFrame(frame);
        } catch (err) { reject(err); }
      }
      if (next) next.then(c => { nextClip = c; }, reject);
      requestAnimationFrame(frame);
    });
    release(cur); release(nextClip);
    rec.stop(); await stopped;
    const type = (rec.mimeType || mime || "video/webm").split(";")[0];
    return { blob: new Blob(chunks, { type }), mime: type, seconds: total };
  }
  root.StudioAssemble = { assemble, supported, pickMime, DEFAULTS };
})(typeof globalThis !== "undefined" ? globalThis : this);
