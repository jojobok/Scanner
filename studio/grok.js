"use strict";
// Scanner Studio – working with Grok in the browser, with the user's existing account.
//
// The studio never signs in to Grok, never stores Grok credentials or cookies, and never
// automates grok.com (that would break xAI's terms and need the user's login). Instead:
//   1. "העתק ופתח ב־Grok" copies a ready prompt and opens Grok in a new tab, where the user is
//      already signed in with their own subscription. No paid API is used.
//   2. The user creates the image/video there and saves it to the device.
//   3. "צרף תוצר" brings the file back into the studio, linked to the scene and request.
//
// These are pure functions (no DOM), so they are unit-tested in Node.
(function (root) {
  // Single place to change if xAI moves the page.
  const IMAGINE_URL = "https://grok.com/imagine";

  function rules() {
    const SR = root.StudioRequests || (typeof require === "function" ? require("./requests.js") : null);
    if (!SR) throw new Error("requests.js must be loaded first");
    return SR;
  }

  /** text to paste into Grok Imagine to create a scene image */
  function imagePrompt(opts) {
    const SR = rules();
    const prompt = String((opts && opts.prompt) || "").trim();
    if (!prompt) throw new Error("missing image prompt");
    const parts = [prompt, SR.STYLE_RULES].concat(opts && opts.opening ? [SR.HOOK_RULE] : [], SR.sceneRules(prompt));
    const revision = String((opts && opts.revision) || "").trim();
    if (revision) parts.push("Change only this, keep everything else the same: " + revision);
    return parts.join("\n\n");
  }

  /** text to paste into Grok Imagine when animating the approved image of a scene */
  function videoPrompt(opts) {
    const SR = rules();
    const motion = String((opts && opts.motion) || "").trim() || "Slow cinematic push-in.";
    return [motion, "Vertical 9:16, at most 9 seconds (never longer).", SR.VIDEO_RULES].concat(SR.sceneRules(opts && opts.scenePrompt)).join("\n\n");
  }

  /** which kind of request a chosen file answers: I (image) or V (video); null if neither */
  function fileKind(file) {
    const type = String((file && file.type) || "").toLowerCase();
    if (type.startsWith("image/")) return "I";
    if (type.startsWith("video/")) return "V";
    const name = String((file && file.name) || "").toLowerCase();
    if (/\.(jpe?g|png|webp|heic|heif)$/.test(name)) return "I";
    if (/\.(mp4|mov|m4v|webm)$/.test(name)) return "V";
    return null;
  }

  const MAX_BYTES = { I: 40 * 1024 * 1024, V: 400 * 1024 * 1024 };

  /** checks a file before it is stored; returns an error message in Hebrew, or null */
  function checkFile(file, expected) {
    const kind = fileKind(file);
    if (!kind) return "הקובץ אינו תמונה או סרטון.";
    if (expected && kind !== expected) return expected === "I" ? "יש לבחור קובץ תמונה." : "יש לבחור קובץ סרטון.";
    if (!file.size) return "הקובץ ריק.";
    if (file.size > MAX_BYTES[kind]) return "הקובץ גדול מדי (עד " + Math.round(MAX_BYTES[kind] / 1048576) + "MB).";
    return null;
  }

  const api = { IMAGINE_URL, imagePrompt, videoPrompt, fileKind, checkFile, MAX_BYTES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StudioGrok = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
