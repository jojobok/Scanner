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
test("matchFile assigns by request id and sends anything uncertain to intake", () => {
  const img = "TS-K7QM-02-I-ABC" + SR.checkChar("K7QM", "I", "ABC");
  const vid = "TS-K7QM-02-V-DEF" + SR.checkChar("K7QM", "V", "DEF");
  const project = { code: "K7QM", scenes: [{ requests: [] }, { requests: [{ id: img, type: "I" }, { id: vid, type: "V" }] }] };
  const m = SR.matchFile(project, img + ".jpg", "image/jpeg");
  assert.equal(m.sceneIndex, 1); assert.equal(m.request.id, img);
  assert.equal(SR.matchFile(project, vid + ".mp4", "video/mp4").sceneIndex, 1);
  assert.equal(SR.matchFile(project, "IMG_0001.jpg", "image/jpeg").reason, "no_id");
  assert.equal(SR.matchFile(project, img + ".mp4", "video/mp4").reason, "type_mismatch");
  const other = "TS-ZZZZ-02-I-ABC" + SR.checkChar("ZZZZ", "I", "ABC");
  assert.equal(SR.matchFile(project, other + ".jpg", "image/jpeg").reason, "other_production");
  const unknown = "TS-K7QM-02-I-XYZ" + SR.checkChar("K7QM", "I", "XYZ");
  assert.equal(SR.matchFile(project, unknown + ".jpg", "image/jpeg").reason, "unknown_request");
});

test("house style and scene-specific rules", () => {
  for (const part of ["cinema camera", "head covering", "hair fully covered", "Christian iconography", "Never depict God", "no text", "not like AI art", "anatomically complete", "shallow depth of field", "highest resolution", "Never a black cord", "draped over the head like a hood", "epic golden hour", "rim light"])
    assert.ok(SR.STYLE_RULES.includes(part), part);
  for (const part of ["Animate only the original image", "No morphing", "no lip movement", "slow push-in"])
    assert.ok(SR.VIDEO_RULES.includes(part), part);
  assert.match(SR.sceneRules("Aaron in the Tabernacle courtyard").join(" "), /white turban[\s\S]*bronze laver/);
  assert.match(SR.sceneRules("Stars over the camp at night").join(" "), /stars never appear[\s\S]*|tent must remain/);
  assert.match(SR.sceneRules("עמוד הענן מעל המחנה").join(" "), /pillar of cloud[\s\S]*|tent/);
  assert.match(SR.sceneRules("Craftsmen building with a chisel").join(" "), /bronze chisel/);
  assert.equal(SR.sceneRules("A quiet desert at dawn").length, 0);
  assert.match(SR.sceneRules("Moses raises his staff").join(" "), /white tallit/);
  assert.match(SR.sceneRules("משה עומד ליד המשכן").join(" "), /white tallit[\s\S]*Tabernacle/);
  assert.match(SR.sceneRules("The Israelite camp with tents").join(" "), /tent must remain/);
  const pkg = SR.imagePackage({ id: "TS-K7QM-01-I-ABC" + SR.checkChar("K7QM", "I", "ABC"), prompt: "Moses in the camp" });
  assert.ok(pkg.includes("white tallit") && pkg.includes("tent must remain"));
  assert.ok(!pkg.includes("Opening hook"));
  assert.ok(SR.imagePackage({ id: "TS-K7QM-01-I-ABC" + SR.checkChar("K7QM", "I", "ABC"), prompt: "x", opening: true }).includes("Opening hook"));
});

test("parseScript accepts ChatGPT JSON with iPhone smart quotes and keeps Hebrew gershayim", () => {
  const text = '{“title”:“פרשת תולדות”,“anchor_verse”:”״הַקֹּל קוֹל יַעֲקֹב״ — בראשית כ״ז, כ״ב”,“characters”:[{“name”:“יצחק”,“look”:“white beard”}],' +
    '“shots”:[{“shot_type”:“extreme close-up”,“image_prompt”:“Isaac’s trembling hand”,“motion”:“Slow push-in”,“narration”:“יצחק כבר בירך”,“on_screen_text”:””}]}';
  const s = SR.parseScript(text);
  assert.equal(s.title, "פרשת תולדות"); assert.equal(s.shots.length, 1);
  assert.match(s.anchor_verse, /כ״ז/); assert.equal(s.shots[0].image_prompt, "Isaac’s trembling hand");
  assert.throws(() => SR.parseScript("just some prose"));
});
