"use strict";
// Scanner Studio – Grok Bot request IDs and instruction packages.
//
// The studio never logs in to Grok and never automates grok.com. It prepares a
// request with a unique ID; the user hands it to Grok Bot (their own
// subscription), Grok Bot saves the media to the "Studio-Intake" Google Drive
// folder under that exact filename, and the importer later matches files back
// to scenes by the ID.
//
// ID format: TS-<PROD4>-<NN>-<T>-<REQ3><CHK>
//   PROD4  production code, 4 Crockford base32 chars
//   NN     scene number at request time (informational only)
//   T      I = image, V = video
//   REQ3   random request code, 3 Crockford chars
//   CHK    check character over PROD4 + T + REQ3 (catches typos)
(function (root) {
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U
  const TYPES = { I: 0, V: 1 };
  const ID_RE = /TS-([0-9A-HJKMNP-TV-Z]{4})-(\d{2})-([IV])-([0-9A-HJKMNP-TV-Z]{3})([0-9A-HJKMNP-TV-Z])(?:-([a-z0-9]{1,8}))?/i;

  const DEFAULT_FOLDER = "Studio-Intake";
  const STYLE_RULES =
    "Ultra-realistic professional cinematic biblical scene, vertical 9:16, natural lighting, " +
    "authentic ancient Middle Eastern setting, historically plausible clothing and architecture, " +
    "modest attire, consistent character appearance, realistic anatomy and proportions, detailed " +
    "environment, no modern objects, no text, no logos, no watermarks, no split screen, no collage, " +
    "no fantasy effects.";
  const VIDEO_RULES =
    "Animate only the original image. Keep every person's face, age, beard, hair, clothing and " +
    "colors unchanged. Do not add, remove, duplicate or transform any person or object. Keep " +
    "buildings, tents, landscape and proportions fixed. Independent subtle natural movement, no " +
    "synchronized gestures. No dialogue, no speaking, no lip movement, no text.";

  function randomChars(n, rng) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(ALPHABET[Math.floor(rng() * 32) % 32]);
    return out.join("");
  }

  function defaultRng() {
    if (root.crypto && root.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      return () => (root.crypto.getRandomValues(buf), buf[0] / 4294967296);
    }
    return Math.random;
  }

  function checkChar(prod, type, req) {
    const body = (prod + req).toUpperCase();
    let sum = TYPES[type] * 7;
    for (let i = 0; i < body.length; i++) {
      const v = ALPHABET.indexOf(body[i]);
      if (v < 0) throw new Error("invalid character in ID: " + body[i]);
      sum += (i + 1) * v;
    }
    return ALPHABET[sum % 32];
  }

  function newProductionCode(rng) {
    return randomChars(4, rng || defaultRng());
  }

  function makeRequestId(prod, sceneNumber, type, rng) {
    if (!/^[0-9A-HJKMNP-TV-Z]{4}$/.test(prod)) throw new Error("invalid production code");
    if (!(type in TYPES)) throw new Error("type must be I or V");
    const n = Math.max(1, Math.min(99, Math.floor(sceneNumber)));
    const req = randomChars(3, rng || defaultRng());
    return "TS-" + prod + "-" + String(n).padStart(2, "0") + "-" + type + "-" + req + checkChar(prod, type, req);
  }

  // Finds an ID anywhere in a filename. Returns null when absent or when the
  // check character does not match (such files go to the manual intake box).
  function parseRequestId(filename) {
    const m = ID_RE.exec(String(filename || ""));
    if (!m) return null;
    const prod = m[1].toUpperCase(), type = m[3].toUpperCase(), req = m[4].toUpperCase(), chk = m[5].toUpperCase();
    if (checkChar(prod, type, req) !== chk) return null;
    return {
      id: "TS-" + prod + "-" + m[2] + "-" + type + "-" + req + chk,
      production: prod, scene: parseInt(m[2], 10), type, request: req + chk,
      suffix: m[6] ? m[6].toLowerCase() : null
    };
  }

  function imagePackage(opts) {
    const lines = [
      "Scanner Studio request " + opts.id,
      "Create ONE photorealistic image with Grok Imagine, using my existing subscription.",
      "Format: vertical 9:16.",
      "Save the actual image file (not a link, not a ZIP) to my Google Drive folder \"" + (opts.folder || DEFAULT_FOLDER) + "\".",
      "Exact filename: " + opts.id + ".jpg  (if the real format differs, keep the name and use the correct extension).",
      "Do not add anything to the filename. Do not overwrite, move or delete any existing file.",
      "If anything fails, report the failure instead of claiming success. When done, reply with the saved filename.",
      "",
      "Prompt:",
      String(opts.prompt || "").trim(),
      "",
      STYLE_RULES
    ];
    if (opts.revision && String(opts.revision).trim()) {
      lines.push("", "Revision of " + (opts.previousId || "the previous image") + " – change only this:", String(opts.revision).trim());
    }
    return lines.join("\n");
  }

  function videoPackage(opts) {
    return [
      "Scanner Studio request " + opts.id,
      "Create ONE short video (about 6 seconds) with Grok Imagine, using my existing subscription.",
      "Use the existing approved image " + opts.sourceId + " (in my Google Drive folder \"" + (opts.folder || DEFAULT_FOLDER) + "\") as the first frame.",
      "Format: vertical 9:16, at the highest resolution my plan allows.",
      "Save the actual video file (not a link, not a ZIP) to the same folder.",
      "Exact filename: " + opts.id + ".mp4  (if the real format differs, keep the name and use the correct extension).",
      "Do not add anything to the filename. Do not overwrite, move or delete any existing file.",
      "If anything fails, report the failure instead of claiming success. When done, reply with the saved filename.",
      "",
      "Camera and motion:",
      String(opts.motion || "Slow cinematic push-in.").trim(),
      "",
      VIDEO_RULES
    ].join("\n");
  }

  // Matches an imported file to a scene by the request ID in its name.
  // Returns {sceneIndex, request, parsed} on a certain match, otherwise
  // {reason, parsed?}; anything not certain goes to the manual intake box.
  function matchFile(project, filename, mime) {
    const parsed = parseRequestId(filename);
    if (!parsed) return { reason: "no_id" };
    if (project.code && parsed.production !== project.code) return { reason: "other_production", parsed };
    const kind = String(mime || "").split("/")[0];
    if ((parsed.type === "I" && kind && kind !== "image") || (parsed.type === "V" && kind && kind !== "video")) {
      return { reason: "type_mismatch", parsed };
    }
    const scenes = project.scenes || [];
    for (let i = 0; i < scenes.length; i++) {
      const req = (scenes[i].requests || []).find(r => r.id === parsed.id);
      if (req) return { sceneIndex: i, request: req, parsed };
    }
    return { reason: "unknown_request", parsed };
  }

  const api = { ALPHABET, DEFAULT_FOLDER, STYLE_RULES, VIDEO_RULES, checkChar, newProductionCode,
                makeRequestId, parseRequestId, imagePackage, videoPackage, matchFile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StudioRequests = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
