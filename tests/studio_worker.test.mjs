// Tests for studio/worker/index.js: auth, queue, upload validation, dedupe. Run: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryKV, accessSetup, JPEG, MP4 } from "./studio_worker_helpers.mjs";
const worker = (await import("../studio/worker/index.js")).default;
const SR = globalThis.StudioRequests;
const { env: base, sign } = await accessSetup();
const mk = () => Object.assign({}, base, { STUDIO: new MemoryKV(), ASSETS: { fetch: () => new Response("asset") } });
const call = (env, path, init = {}) => worker.fetch(new Request("https://studio.test" + path, init), env);
const owner = async (env, path, init = {}) => call(env, path, Object.assign({}, init, { headers: Object.assign({ "Cf-Access-Jwt-Assertion": await sign({}) }, init.headers || {}) }));
const bot = (env, path, init = {}) => call(env, path, Object.assign({}, init, { headers: Object.assign({ Authorization: "Bearer " + base.BOT_TOKEN }, init.headers || {}) }));

test("owner API rejects missing, forged, wrong-audience, wrong-user and expired tokens", async () => {
  const env = mk();
  assert.equal((await call(env, "/api/health")).status, 401);
  for (const claims of [{ aud: ["other"] }, { email: "intruder@example.com" }, { exp: 1 }]) {
    assert.equal((await call(env, "/api/health", { headers: { "Cf-Access-Jwt-Assertion": await sign(claims) } })).status, 401, JSON.stringify(claims));
  }
  const good = await sign({}); const forged = good.slice(0, -4) + (good.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal((await call(env, "/api/health", { headers: { "Cf-Access-Jwt-Assertion": forged } })).status, 401);
  assert.equal((await owner(env, "/api/health")).status, 200);
  const noCfg = Object.assign(mk(), { ACCESS_AUD: "" });
  assert.equal((await owner(noCfg, "/api/health")).status, 401, "fails closed without config");
});

test("bot API needs the bot token", async () => {
  const env = mk();
  assert.equal((await call(env, "/api/bot/next")).status, 401);
  assert.equal((await call(env, "/api/bot/next", { headers: { Authorization: "Bearer wrong" } })).status, 401);
  assert.equal((await bot(Object.assign(mk(), { BOT_TOKEN: "short" }), "/api/bot/next", { headers: { Authorization: "Bearer short" } })).status, 401);
  assert.equal((await bot(env, "/api/bot/next")).status, 200);
});

test("full image cycle: queue, claim once, upload, dedupe, fetch", async () => {
  const env = mk();
  const id = SR.makeRequestId("K7QM", 1, "I");
  const post = body => owner(env, "/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const good = SR.checkChar("K7QM", "I", "AAA"), bad = SR.ALPHABET[(SR.ALPHABET.indexOf(good) + 1) % 32];
  assert.equal((await post({ id: "TS-K7QM-01-I-AAA" + bad, type: "I", prompt: "x" })).status, 400, "bad checksum");
  assert.equal((await post({ id, type: "V", prompt: "x" })).status, 400, "type mismatch");
  assert.equal((await post({ id, type: "I", prompt: "" })).status, 400, "empty prompt");
  assert.equal((await post({ id, type: "I", prompt: "An oil lamp" })).status, 201);
  assert.equal((await post({ id, type: "I", prompt: "An oil lamp" })).status, 200, "idempotent");
  const next = await (await bot(env, "/api/bot/next")).json();
  assert.equal(next.requests.length, 1); assert.equal(next.requests[0].type, "image");
  assert.equal((await (await bot(env, "/api/bot/next")).json()).requests.length, 0, "claimed only once");
  const up = (body, ct) => bot(env, "/api/bot/result/" + id, { method: "PUT", body, headers: { "content-type": ct } });
  assert.equal((await up(MP4, "video/mp4")).status, 415, "video for image request");
  assert.equal((await up(new TextEncoder().encode("<html>").buffer, "image/jpeg")).status, 415, "not media");
  const res = await (await up(JPEG, "image/jpeg")).json();
  assert.ok(res.file_id && res.name === id + ".jpg");
  assert.equal((await (await up(JPEG, "image/jpeg")).json()).duplicate, true);
  const st = await (await owner(env, "/api/requests/" + id)).json();
  assert.equal(st.status, "done"); assert.equal(st.files.length, 1); assert.match(st.files[0].sha256, /^[0-9a-f]{64}$/);
  const file = await owner(env, "/api/file/" + st.files[0].file_id);
  assert.equal(file.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(JPEG));
  assert.equal((await call(env, "/api/file/" + st.files[0].file_id)).status, 401, "files need owner auth");
});

test("video request requires the approved image upload, bot can read it", async () => {
  const env = mk();
  const img = SR.makeRequestId("K7QM", 2, "I"), vid = SR.makeRequestId("K7QM", 2, "V");
  const post = () => owner(env, "/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: vid, type: "V", prompt: "Slow push-in", source_id: img }) });
  assert.equal((await post()).status, 409);
  assert.equal((await owner(env, "/api/source/" + img, { method: "PUT", body: MP4 })).status, 415);
  assert.equal((await owner(env, "/api/source/" + img, { method: "PUT", body: JPEG })).status, 200);
  assert.equal((await post()).status, 201);
  const job = (await (await bot(env, "/api/bot/next")).json()).requests[0];
  assert.equal(job.type, "video"); assert.ok(job.source_image_url.endsWith("/api/bot/source/" + img));
  assert.equal((await bot(env, new URL(job.source_image_url).pathname)).status, 200);
  const failOnce = async () => (await (await bot(env, "/api/bot/fail/" + vid, { method: "POST", body: JSON.stringify({ error: "quota reached" }) })).json());
  assert.equal((await failOnce()).retry, true, "first failure goes back to the queue");
  assert.equal((await (await owner(env, "/api/requests/" + vid)).json()).status, "queued");
  for (let i = 0; i < 2; i++) { assert.equal((await (await bot(env, "/api/bot/next")).json()).requests.length, 1); await failOnce(); }
  const st = await (await owner(env, "/api/requests/" + vid)).json();
  assert.equal(st.status, "failed"); assert.equal(st.error, "quota reached");
});

test("static pages need the owner too, and carry the security headers", async () => {
  assert.equal((await call(mk(), "/index.html")).status, 401);
  const r = await owner(mk(), "/index.html");
  assert.equal(await r.text(), "asset");
  assert.match(r.headers.get("Content-Security-Policy"), /connect-src 'self'/);
  assert.equal(r.headers.get("X-Frame-Options"), "DENY");
});

test("Cloudflare Access workers.dev identity (ctx.access) is accepted only for the owner", async () => {
  const env = mk();
  const ctx = email => ({ access: { getIdentity: async () => ({ email }) } });
  const req = () => new Request("https://studio.test/api/health");
  assert.equal((await worker.fetch(req(), env, ctx("OWNER@example.com"))).status, 200);
  assert.equal((await worker.fetch(req(), env, ctx("intruder@example.com"))).status, 401);
  assert.equal((await worker.fetch(req(), env, { access: { getIdentity: async () => { throw new Error("x"); } } })).status, 401);
  assert.equal((await worker.fetch(req(), Object.assign(mk(), { OWNER_EMAIL: "" }), ctx("owner@example.com"))).status, 401);
});

test("bot-role worker serves only bot routes", async () => {
  const env = Object.assign(mk(), { ROLE: "bot" });
  assert.equal((await call(env, "/index.html")).status, 404);
  assert.equal((await owner(env, "/api/health")).status, 404);
  assert.equal((await bot(env, "/api/bot/next")).status, 200);
  assert.equal((await call(env, "/api/bot/next")).status, 401);
});

test("automatic mode: delivering the image queues its follow-up video in the same bot run", async () => {
  const env = mk();
  const img = SR.makeRequestId("K7QM", 3, "I"), vid = SR.makeRequestId("K7QM", 3, "V"), otherScene = SR.makeRequestId("K7QM", 4, "V");
  const post = body => owner(env, "/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({ id: img, type: "I", prompt: "A tent", then_video: { id: otherScene, prompt: "push-in" } })).status, 400, "other scene");
  assert.equal((await post({ id: img, type: "I", prompt: "A tent", then_video: { id: vid, prompt: "" } })).status, 400, "empty video prompt");
  const created = await (await post({ id: img, type: "I", prompt: "A tent", then_video: { id: vid, prompt: "Slow push-in" } })).json();
  assert.equal(created.then_video_id, vid);
  assert.equal((await owner(env, "/api/requests/" + vid)).status, 404, "video waits for the image");
  assert.equal((await (await bot(env, "/api/bot/next")).json()).requests.length, 1);
  assert.equal((await bot(env, "/api/bot/result/" + img, { method: "PUT", body: JPEG })).status, 201);
  const job = (await (await bot(env, "/api/bot/next")).json()).requests[0];
  assert.equal(job.id, vid); assert.equal(job.prompt, "Slow push-in");
  assert.equal((await bot(env, new URL(job.source_image_url).pathname)).status, 200, "delivered image is the first frame");
  assert.equal((await bot(env, "/api/bot/result/" + vid, { method: "PUT", body: MP4 })).status, 201);
  assert.equal((await (await owner(env, "/api/requests/" + vid)).json()).status, "done");
});

test("script request: bot uploads JSON, server validates and returns the shot list", async () => {
  const env = mk();
  const id = SR.makeRequestId("K7QM", 0, "S");
  const post = body => owner(env, "/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({ id, type: "S", prompt: SR.scriptPrompt({ parasha: "תולדות" }) })).status, 201);
  const job = (await (await bot(env, "/api/bot/next")).json()).requests[0];
  assert.equal(job.type, "script"); assert.match(job.prompt, /Parashat תולדות/);
  const up = body => bot(env, "/api/bot/result/" + id, { method: "PUT", body, headers: { "content-type": "application/json" } });
  assert.equal((await up("not json")).status, 422);
  assert.equal((await up(JSON.stringify({ shots: [{ narration: "x" }] }))).status, 422, "shots need image_prompt");
  const script = { title: "הבכורה", characters: [{ name: "עשו", look: "red-haired hunter" }],
    shots: [{ shot_type: "extreme close-up", image_prompt: "A bowl of red lentil stew", motion: "Slow push-in", narration: "קערה אחת", on_screen_text: "" },
            { image_prompt: "Esau at the tent door", narration: "עשו חוזר" }] };
  assert.equal((await up("```json\n" + JSON.stringify(script) + "\n```")).status, 201, "code fence tolerated");
  const st = await (await owner(env, "/api/requests/" + id)).json();
  assert.equal(st.status, "done"); assert.equal(st.script.shots.length, 2); assert.equal(st.script.shots[1].motion, "");
  assert.equal(st.script.characters[0].name, "עשו");
});
