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
  function prepare(blob, start) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
      const url = URL.createObjectURL(blob);
      const fail = () => { URL.revokeObjectURL(url); reject(new Error("לא הצלחתי לפתוח את אחד הסרטונים")); };
      v.addEventListener("error", fail, { once: true });
      v.addEventListener("loadeddata", () => {
        v.currentTime = Math.min(start, Math.max(0, (v.duration || 0) - 0.1));
        v.addEventListener("seeked", () => resolve({ v, url }), { once: true });
      }, { once: true });
      v.src = url;
    });
  }
  function release(c) { if (!c) return; try { c.v.pause(); c.v.removeAttribute("src"); c.v.load(); } catch (_) {} URL.revokeObjectURL(c.url); }
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
