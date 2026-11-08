// Tests for studio/grok.js (Grok in the browser with the user's existing account). Run: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const SR = require("../studio/requests.js");
const GB = require("../studio/grok.js");

test("opens Grok on grok.com over https, no API address", () => {
  const u = new URL(GB.IMAGINE_URL);
  assert.equal(u.protocol, "https:");
  assert.equal(u.hostname, "grok.com");
  assert.ok(!/api\./.test(u.hostname));
});

test("image prompt: the scene prompt first, then the studio style rules; nothing about files or Drive", () => {
  const text = GB.imagePrompt({ prompt: "  An oil lamp on a wooden table  " });
  assert.ok(text.startsWith("An oil lamp on a wooden table\n\n"));
  assert.ok(text.includes(SR.STYLE_RULES));
  for (const absent of ["Google Drive", "filename", "Studio-Intake", "TS-"]) assert.ok(!text.includes(absent), absent);
});

test("image prompt carries a revision as 'change only this'", () => {
  const text = GB.imagePrompt({ prompt: "x", revision: "Make the flame smaller" });
  assert.ok(text.endsWith("Change only this, keep everything else the same: Make the flame smaller"));
  assert.ok(!GB.imagePrompt({ prompt: "x", revision: "   " }).includes("Change only"));
});

test("image prompt requires a scene prompt", () => {
  assert.throws(() => GB.imagePrompt({ prompt: "  " }));
});

test("video prompt: motion, format and the continuity rules", () => {
  const text = GB.videoPrompt({ motion: "Slow pull-back." });
  assert.ok(text.startsWith("Slow pull-back."));
  assert.ok(text.includes("9:16") && text.includes(SR.VIDEO_RULES));
  assert.ok(GB.videoPrompt({}).startsWith("Slow cinematic push-in."));
});

test("file kind from type or extension (iPhone photos may be HEIC)", () => {
  assert.equal(GB.fileKind({ type: "image/jpeg", name: "a.jpg" }), "I");
  assert.equal(GB.fileKind({ type: "video/mp4", name: "a.mp4" }), "V");
  assert.equal(GB.fileKind({ type: "", name: "IMG_0001.HEIC" }), "I");
  assert.equal(GB.fileKind({ type: "", name: "clip.MOV" }), "V");
  assert.equal(GB.fileKind({ type: "application/pdf", name: "a.pdf" }), null);
});

test("file checks: wrong kind, empty and too large files are refused with a Hebrew message", () => {
  assert.equal(GB.checkFile({ type: "image/png", name: "a.png", size: 1000 }, "I"), null);
  assert.match(GB.checkFile({ type: "image/png", name: "a.png", size: 1000 }, "V"), /סרטון/);
  assert.match(GB.checkFile({ type: "text/plain", name: "a.txt", size: 10 }, null), /אינו תמונה או סרטון/);
  assert.match(GB.checkFile({ type: "image/png", name: "a.png", size: 0 }, null), /ריק/);
  assert.match(GB.checkFile({ type: "image/png", name: "a.png", size: GB.MAX_BYTES.I + 1 }, null), /גדול מדי/);
});
