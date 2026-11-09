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
  // House style – the owner's style guide (studio/STYLE_GUIDE.md), in English for Grok.
  const STYLE_RULES = [
    "Ultra-realistic cinematic biblical realism: it must look like a frame from a high-quality historical Hollywood film shot on a professional cinema camera, not like AI art.",
    "Vertical 9:16, clear composition for a phone screen, one clear subject and one main action. Deliberate professional camera angle, realistic perspective, natural cinematic lighting, real depth of field, consistent color grading.",
    "Natural skin and facial texture, realistic beards and hair, believable folds in linen and wool, realistic sand, stone, wood, leather and metal textures.",
    "People of ancient Israel and the ancient Near East with natural Middle Eastern features. Men: full natural beard, a full cloth head covering wrapped over the head (not a headband), long modest robes with long sleeves. Women: modest biblical dress, long robes, hair fully covered with a cloth head covering. No unnecessary exposed skin, no modern cuts.",
    "Each recurring character keeps exactly the same face, age, beard, hair, head covering, clothes, colors, accessories and build.",
    "Never depict God in any form: no divine figure, no face in the sky, no body, no hand from the sky, no human-shaped light. Divine presence only as soft natural light, sun rays through clouds, a pillar of cloud or natural controlled fire. No portals, energy beams, lasers, sci-fi or exaggerated fantasy effects.",
    "Not in the style of Western religious paintings; no halos, crosses or Christian iconography.",
    "No modern objects, clothing, tools or buildings (no modern shirts or trousers, watches, glasses, modern shoes). no text, no letters, no logos, watermarks or subtitles, no split screen, no collage.",
    "Not a cartoon, illustration, digital painting, fantasy art, game graphics or artificial 3D look; no plastic faces, overly smooth skin or exaggerated lighting; no extra fingers, hands or limbs, no distorted bodies, double faces or unnatural eyes; no objects that appear, grow, melt, inflate or transform by themselves."
  ].join(" ");
  const VIDEO_RULES = [
    "Animate only the original image; do not rebuild the scene. From the first frame to the last keep the same faces, age, beards, head coverings, clothes, colors, builds, objects and background.",
    "Do not add, remove, duplicate or replace any person, animal, object, tent, building, mountain, tree or background detail unless explicitly asked. Every building, tent and object keeps its position, size, shape, color and number; tents never grow, inflate, shrink, open, close, melt, appear, vanish or duplicate. No morphing, no magical construction, no object transformation, no artificial landscape change.",
    "Character motion is subtle and natural: breathing, a small head turn, a change of gaze, cloth or beard moving slightly in the wind, and one clear defined action only. Several people move independently and gently; no synchronized or repeated hand gestures.",
    "No dialogue, no speaking, no lip movement, no text; meaning is carried by gaze, expression, body language and camera.",
    "Camera: professional, slow, smooth and controlled (slow push-in, slow pull-back, dolly, controlled tilt, crane, slow orbit or smooth tracking). No sudden zoom, spinning camera, needless whip pan, heavy shake or music-video motion. Camera motion must not change the structure of the image."
  ].join(" ");
  const HOOK_RULE = "Opening hook: this is the first shot of the film. Make it gripping and dramatic from the first frame, like a Hollywood opening (for example an extreme close-up, a very low or high angle, special light, a meaningful detail revealed before the full scene), never a slow, static or generic establishing shot. The drama must come from the verse or story itself; invent nothing unrelated.";
  // Added only when the scene mentions them.
  const SCENE_RULES = [
    [/\bmoses\b|משה/i, "Moses: an older man with a full natural beard, a long white linen robe with long sleeves to the wrists, and a white tallit with subtle gold stripes resting on his head and shoulders only; it never covers his hands or anything he holds, and when his hands matter both are clearly visible."],
    [/\baaron\b|אהרן|אהרון/i, "Aaron the High Priest: an older man with a full natural beard, period high-priest garments as the scene requires (tunic, robe, ephod, breastplate, golden head plate), and a full white turban covering his hair (not a headband, not partial)."],
    [/tabernacle|mishkan|משכן/i, "The Tabernacle (Mishkan) is a rectangular biblical structure of wooden frames and woven curtains in tekhelet blue, argaman purple, crimson and linen; not a stone temple, no classical columns, domes, palace, grand stairs or temple facade. In the courtyard: the bronze altar and the bronze laver, with the courtyard curtains, posts and bases. Inside, as the scene requires: the golden incense altar, the table and the menorah. Never swap the golden inner vessels with the bronze courtyard vessels."],
    [/\b(camp|tents?)\b|מחנה|אוהל/i, "Every tent must remain completely fixed in its original position, size, shape, color and number. Never add tents to show growth or blessing; show it through a wide shot, depth, perspective, composition and light."],
    [/\b(stars?|night sky|heavens?)\b|כוכב|שמים|שמיים/i, "The sky stays natural and realistic: stars never appear, vanish, multiply, fall, fly, move or form shapes."],
    [/pillar of cloud|cloud pillar|עמוד (ה)?ענן/i, "The pillar of cloud is tall, vertical, continuous, soft and natural; not a mushroom cloud, explosion smoke, eruption or fantasy effect."],
    [/\b(fire|flame|burning|torch)\b|אש|להבה|בוער/i, "Fire is natural and controlled; not lava, a volcano, an explosion, an energy beam or an exaggerated magical effect."],
    [/\b(animals?|birds?|sheep|goats?|cattle|camels?|donkeys?|ram|flock|herd)\b|בעלי חיים|ציפור|צאן|כבש|גמל|חמור|בקר|עדר/i, "Animals stay natural and realistic: no sudden change of size or body, no duplication, no appearing or vanishing mid-shot. A flock of birds flies together in natural continuous motion in one clear direction. Add no birds or animals unless asked."],
    [/\b(tools?|hammer|chisel|axe|build(ing|er)?|craftsm[ae]n|carpent)/i, "Period tools only: wooden mallet, bronze chisel, bronze axe, ancient bow drill, measuring rope, wooden cubit rod, charcoal marks. No modern steel hammer, saw, drill, ruler, pencil or power tool."],
    [/\b(divine|holy|glory|presence)\b|שכינה|כבוד ה|קדוש/i, "Holy light looks natural and cinematic: soft light through clouds, natural sun rays, warm light on the Tabernacle or gentle light on a face; no stage spotlights, lasers, portals, energy beams or sci-fi effects."],
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
    ].concat(opts.opening ? [HOOK_RULE] : [], sceneRules(opts.prompt));
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

  const api = { ALPHABET, DEFAULT_FOLDER, STYLE_RULES, VIDEO_RULES, HOOK_RULE, sceneRules, checkChar, newProductionCode,
                makeRequestId, parseRequestId, imagePackage, videoPackage, matchFile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StudioRequests = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
