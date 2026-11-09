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
  // House style (from the production brief): ultra-realistic cinematic biblical realism.
  const STYLE_RULES =
    "Ultra-realistic cinematic biblical realism, as if filmed with a professional cinema camera. " +
    "Vertical 9:16, clear composition for a phone screen, one clear main action. Natural cinematic " +
    "lighting, realistic depth of field and cinema-lens perspective, consistent color grading. " +
    "Natural human skin and realistic facial texture, believable folds in natural linen and wool, " +
    "realistic sand, stone, wood and metal textures. People of ancient Israel and the ancient Near East: " +
    "Middle Eastern features; men with natural full beards and a full cloth head covering draped over " +
    "the head (not a headband), long modest robes with long sleeves; women modestly dressed with their " +
    "hair fully covered. Consistent character appearance. Authentic period settings, tools and objects " +
    "only. Not resembling classical Western religious paintings: no halos, no crosses, no Christian " +
    "iconography. Do not depict God in any form; show divine presence only as soft natural light, " +
    "gentle sun rays, a tall vertical column of cloud or natural controlled fire, never portals, lasers " +
    "or energy beams. No modern objects or clothing (no shirts, trousers, sweaters, watches, glasses, " +
    "modern shoes or tools); no text, no letters, no logos or watermarks, no split screen, no collage. " +
    "Not a cartoon, illustration, digital painting, fantasy or game art; no plastic-looking faces, no " +
    "surreal imagery, no exaggerated artificial lighting, no distorted anatomy or extra limbs.";
  const VIDEO_RULES =
    "Animate only the original image. Keep every person's face, age, beard, hair, head covering, " +
    "clothing and colors unchanged. Do not add, remove, duplicate or transform any person or object. " +
    "Every building, tent and object keeps its position, size, shape, color and number; keep the " +
    "landscape and proportions fixed. Independent subtle natural movement (breathing, a small head " +
    "turn, cloth moving in the wind), no synchronized gestures. Smooth, slow cinematic camera motion " +
    "only. No dialogue, no speaking, no lip movement, no text.";
  // Added only when the prompt mentions them.
  const SCENE_RULES = [
    [/\bmoses\b|משה/i, "Moses: an older man with a full natural beard, a long white linen robe with long " +
      "sleeves to the wrists, and a white tallit with subtle gold stripes over his head and shoulders only, " +
      "never hiding his hands or an important action."],
    [/tabernacle|mishkan|משכן/i, "The Tabernacle (Mishkan) is not a stone building or temple: a rectangular " +
      "structure of wooden frames covered with layered fabrics in tekhelet blue, argaman purple, deep " +
      "crimson and linen; no columns, domes or grand stairs. In the courtyard only the bronze altar and the " +
      "bronze laver; vessels only in their correct area."],
    [/\b(camp|tents?)\b|מחנה|אוהל/i, "Every tent must remain completely fixed in its original position, size, " +
      "shape, color and number."],
  ];
  function sceneRules(text) {
    return SCENE_RULES.filter(([re]) => re.test(String(text || ""))).map(([, rule]) => rule);
  }

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
    ].concat(sceneRules(opts.prompt));
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

  const api = { ALPHABET, DEFAULT_FOLDER, STYLE_RULES, VIDEO_RULES, sceneRules, checkChar, newProductionCode,
                makeRequestId, parseRequestId, imagePackage, videoPackage, matchFile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StudioRequests = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
