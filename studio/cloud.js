"use strict";
// Scanner Studio – talks to the studio's own Worker (same origin, behind Cloudflare Access).
// The Worker queues requests for the user's Grok Bot routine and returns its results.
(function (root) {
  let state = { available: false, bot_last_seen: null };
  async function health() {
    try {
      const r = await fetch("/api/health", { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      state = { available: !!j.ok, bot_last_seen: j.bot_last_seen || null };
    } catch (_) { state = { available: false, bot_last_seen: null }; }
    return state;
  }
  async function errorText(r) { try { return (await r.json()).error || r.status; } catch (_) { return r.status; } }
  async function submit(req, source) {
    if (req.type === "V") {
      if (!source || !source.blob) throw new Error("התמונה המאושרת לא שמורה במכשיר");
      const up = await fetch("/api/source/" + source.id, { method: "PUT", body: source.blob, credentials: "same-origin",
        headers: { "content-type": source.blob.type || "application/octet-stream" } });
      if (!up.ok) throw new Error("העלאת התמונה המאושרת נכשלה: " + await errorText(up));
    }
    const r = await fetch("/api/requests", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: req.id, type: req.type, prompt: req.grok, source_id: source ? source.id : null }) });
    if (!r.ok) throw new Error("השליחה לשרת נכשלה: " + await errorText(r));
    return r.json();
  }
  async function status(id) {
    const r = await fetch("/api/requests/" + id, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  async function file(fid) {
    const r = await fetch("/api/file/" + fid, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error(String(r.status));
    return r.blob();
  }
  root.StudioCloud = { health, submit, status, file, get state() { return state; } };
})(typeof globalThis !== "undefined" ? globalThis : this);
