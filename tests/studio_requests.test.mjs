// Tests for studio/requests.js (Grok Bot request IDs and packages). Run: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const SR = createRequire(import.meta.url)("../studio/requests.js");

function seq(values) { let i = 0; return () => values[i++ % values.length]; }

test("request id has the agreed format and parses back", () => {
  const id = SR.makeRequestId("K7QM", 3, "I", seq([0.1, 0.5, 0.9]));
  assert.match(id, /^TS-K7QM-03-I-[0-9A-HJKMNP-TV-Z]{4}$/);
  const p = SR.parseRequestId(id + ".jpg");
  assert.equal(p.id, id);
  assert.equal(p.production, "K7QM");
  assert.equal(p.scene, 3);
  assert.equal(p.type, "I");
  assert.equal(p.suffix, null);
});

test("id is found anywhere in the filename, case-insensitive, with variant suffix", () => {
  const id = SR.makeRequestId("AB12", 7, "V", seq([0.2, 0.3, 0.4]));
  const p = SR.parseRequestId("grok_export " + id.toLowerCase() + "-b.mp4");
  assert.equal(p.id, id);
  assert.equal(p.suffix, "b");
  assert.equal(SR.parseRequestId(id + "-v2.mp4").suffix, "v2");
});

test("a typo in any position is caught by the check character", () => {
  const id = SR.makeRequestId("K7QM", 3, "I", seq([0.1, 0.5, 0.9]));
  const body = id.slice(-4);
  for (let i = 0; i < 3; i++) {
    const other = SR.ALPHABET[(SR.ALPHABET.indexOf(body[i]) + 1) % 32];
    const typo = id.slice(0, -4) + body.slice(0, i) + other + body.slice(i + 1);
    assert.equal(SR.parseRequestId(typo), null, typo);
  }
  assert.equal(SR.parseRequestId(id.replace("-I-", "-V-")), null, "type flip");
});

test("files without a valid id go to manual intake (null)", () => {
  for (const name of ["IMG_1234.jpg", "", null, "TS-TEST-01-I-A7K3.jpg", "TS-K7QM-3-I-ABCD.jpg"]) {
    assert.equal(SR.parseRequestId(name), null, String(name));
  }
});

test("invalid inputs are rejected", () => {
  assert.throws(() => SR.makeRequestId("k7qm", 1, "I"));
  assert.throws(() => SR.makeRequestId("K7QL", 1, "I"));
  assert.throws(() => SR.makeRequestId("K7QM", 1, "X"));
});

test("image package names the folder, exact filename, 9:16 and the prompt", () => {
  const id = "TS-K7QM-03-I-ABC" + SR.checkChar("K7QM", "I", "ABC");
  const text = SR.imagePackage({ id, prompt: "An oil lamp on a wooden table" });
  for (const part of ["Studio-Intake", id + ".jpg", "9:16", "An oil lamp on a wooden table",
                      "Do not overwrite", "no text", "existing subscription"]) {
    assert.ok(text.includes(part), part);
  }
  assert.ok(!text.includes("Revision"));
  const rev = SR.imagePackage({ id, prompt: "x", revision: "Make the flame smaller", previousId: "TS-OLD" });
  assert.ok(rev.includes("Revision of TS-OLD") && rev.includes("Make the flame smaller"));
});

test("video package uses the approved image as first frame and continuity rules", () => {
  const text = SR.videoPackage({ id: "TS-K7QM-03-V-XYZ1", sourceId: "TS-K7QM-03-I-ABC1", motion: "Slow pull-back." });
  for (const part of ["TS-K7QM-03-V-XYZ1.mp4", "TS-K7QM-03-I-ABC1", "first frame", "Animate only the original image",
                      "no lip movement", "Slow pull-back."]) {
    assert.ok(text.includes(part), part);
  }
});
