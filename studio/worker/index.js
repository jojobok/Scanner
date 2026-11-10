// Scanner Studio – Cloudflare Worker: static app + request queue for Grok Bot.
//
// Flow (no Grok login, no browser automation, no paid API):
//   iPhone app  --POST /api/requests-->  queue (KV)
//   Grok Bot routine (xAI's own agent, runs on the user's subscription in xAI's cloud)
//     --GET /api/bot/next--> generates with Grok Imagine --PUT /api/bot/result/<id>--> KV
//   iPhone app  --GET /api/requests/<id>, /api/file/<fid>--> imports into the scene
//
// Auth: owner routes require a valid Cloudflare Access JWT (verified here, RS256 against the
// team's JWKS, audience checked). Bot routes require the BOT_TOKEN bearer secret (and, in front
// of the Worker, a Cloudflare Access service token). Nothing works if auth is not configured.
//
// Bindings: KV namespace STUDIO, static assets ASSETS (not on the bot worker).
// Deployed twice: the app (behind Access) and ROLE="bot" (bot routes only, BOT_TOKEN).
// Vars/secrets: ACCESS_TEAM_DOMAIN, ACCESS_AUD, OWNER_EMAIL, BOT_TOKEN.
import "../requests.js";
const SR = globalThis.StudioRequests;

export const MAX_BYTES = 25 * 1024 * 1024; // Workers KV value limit
const CLAIM_MINUTES = 30;
const MAX_ATTEMPTS = 3; // bot runs that may try one request
// same security headers and CSP as the previously deployed studio worker
const SECURITY = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" };
const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src https: blob:; media-src https: blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function secure(resp, extra) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(Object.assign({}, SECURITY, extra || {}))) r.headers.set(k, v);
  return r;
}
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, SECURITY) });
const fail = (status, error) => json({ error }, status);

// ---------- auth
let jwksCache = { at: 0, keys: null };
function b64urlBytes(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function accessKeys(env) {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const res = await fetch("https://" + env.ACCESS_TEAM_DOMAIN + "/cdn-cgi/access/certs");
  if (!res.ok) throw new Error("jwks fetch failed");
  jwksCache = { at: Date.now(), keys: (await res.json()).keys || [] };
  return jwksCache.keys;
}
export async function verifyOwner(request, env, ctx) {
  if (!env.OWNER_EMAIL) return null; // fail closed
  // Cloudflare Access for workers.dev (what the previous studio worker used)
  if (ctx && ctx.access) {
    let identity; try { identity = await ctx.access.getIdentity(); } catch (_) { return null; }
    const email = identity && identity.email ? String(identity.email).toLowerCase() : "";
    return email && email === String(env.OWNER_EMAIL).toLowerCase() ? email : null;
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.OWNER_EMAIL) return null; // fail closed
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
        payload = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1]))); } catch (_) { return null; }
  if (header.alg !== "RS256") return null;
  const jwk = (await accessKeys(env)).find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) return null;
  const now = Date.now() / 1000;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD) || !(payload.exp > now) || (payload.nbf && payload.nbf > now + 60)) return null;
  if (String(payload.email || "").toLowerCase() !== String(env.OWNER_EMAIL).toLowerCase()) return null;
  return payload.email;
}
function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function isBot(request, env) {
  const h = request.headers.get("Authorization") || "";
  return !!env.BOT_TOKEN && env.BOT_TOKEN.length >= 32 && timingSafeEqual(h, "Bearer " + env.BOT_TOKEN);
}

// ---------- media checks
export function sniff(bytes) {
  const b = new Uint8Array(bytes.slice(0, 16));
  const s = (o, t) => [...t].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "I", mime: "image/jpeg", ext: ".jpg" };
  if (b[0] === 0x89 && s(1, "PNG")) return { kind: "I", mime: "image/png", ext: ".png" };
  if (s(0, "RIFF") && s(8, "WEBP")) return { kind: "I", mime: "image/webp", ext: ".webp" };
  if (s(4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (/^(heic|heix|mif1)$/.test(brand)) return { kind: "I", mime: "image/heic", ext: ".heic" };
    if (brand === "qt  ") return { kind: "V", mime: "video/quicktime", ext: ".mov" };
    return { kind: "V", mime: "video/mp4", ext: ".mp4" };
  }
  return null;
}
async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}

// ---------- storage helpers
const getJSON = async (env, key) => { const v = await env.STUDIO.get(key); return v ? JSON.parse(v) : null; };
async function putReq(env, r) {
  await env.STUDIO.put("req:" + r.id, JSON.stringify(r), { metadata: { status: r.status, claimed_at: r.claimed_at || null } });
}
function publicReq(r) {
  const { id, type, status, created_at, claimed_at, done_at, error, files, then_video, script } = r;
  return { id, type, status, created_at, claimed_at: claimed_at || null, done_at: done_at || null, error: error || null, files: files || [],
           then_video_id: then_video ? then_video.id : null, script: script || null };
}

// ---------- routes
async function ownerApi(request, env, url) {
  const p = url.pathname;
  if (p === "/api/health" && request.method === "GET") {
    return json({ ok: true, bot_last_seen: await env.STUDIO.get("bot:last_seen") });
  }
  if (p === "/api/requests" && request.method === "POST") {
    let body; try { body = await request.json(); } catch (_) { return fail(400, "invalid json"); }
    const parsed = SR.parseRequestId(body.id);
    if (!parsed || parsed.id !== body.id || parsed.suffix) return fail(400, "invalid request id");
    if (body.type !== parsed.type) return fail(400, "type does not match id");
    const prompt = String(body.prompt || "").trim();
    const maxPrompt = parsed.type === "S" ? 16000 : 8000;
    if (!prompt || prompt.length > maxPrompt) return fail(400, "prompt required (max " + maxPrompt + " chars)");
    if (parsed.type === "V") {
      const src = SR.parseRequestId(body.source_id);
      if (!src || src.type !== "I") return fail(400, "video needs an approved image request id");
      if (!(await env.STUDIO.get("src:" + src.id, { type: "stream" }))) return fail(409, "upload the approved image first");
    }
    // automatic mode: an image request may carry the follow-up video request, which the server
    // queues by itself as soon as the bot delivers the image (no manual approval round-trip).
    let then_video = null;
    if (body.then_video) {
      const tv = SR.parseRequestId(body.then_video.id), tp = String(body.then_video.prompt || "").trim();
      if (parsed.type !== "I" || !tv || tv.id !== body.then_video.id || tv.suffix || tv.type !== "V"
          || tv.production !== parsed.production || tv.scene !== parsed.scene) return fail(400, "invalid follow-up video id");
      if (!tp || tp.length > 8000) return fail(400, "follow-up video prompt required (max 8000 chars)");
      then_video = { id: tv.id, prompt: tp };
    }
    const existing = await getJSON(env, "req:" + body.id);
    if (existing) return json(publicReq(existing)); // idempotent
    const r = { id: body.id, type: parsed.type, prompt, source_id: body.source_id || null, status: "queued",
                created_at: new Date().toISOString(), files: [], then_video };
    await putReq(env, r);
    return json(publicReq(r), 201);
  }
  let m;
  if ((m = p.match(/^\/api\/requests\/([A-Z0-9-]+)$/)) && request.method === "GET") {
    const r = await getJSON(env, "req:" + m[1]);
    return r ? json(publicReq(r)) : fail(404, "not found");
  }
  if ((m = p.match(/^\/api\/source\/([A-Z0-9-]+)$/)) && request.method === "PUT") {
    const parsed = SR.parseRequestId(m[1]);
    if (!parsed || parsed.type !== "I") return fail(400, "invalid image request id");
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return fail(413, "empty or larger than 25MB");
    const kind = sniff(bytes);
    if (!kind || kind.kind !== "I") return fail(415, "not an image");
    await env.STUDIO.put("src:" + parsed.id, bytes, { metadata: { mime: kind.mime } });
    return json({ ok: true });
  }
  if ((m = p.match(/^\/api\/file\/(f[a-z0-9]+)$/)) && request.method === "GET") {
    const { value, metadata } = await env.STUDIO.getWithMetadata("file:" + m[1], { type: "arrayBuffer" });
    if (!value) return fail(404, "not found");
    return new Response(value, { headers: { "content-type": metadata.mime, "cache-control": "private, no-store" } });
  }
  return fail(404, "unknown route");
}

async function botApi(request, env, url) {
  const p = url.pathname;
  await env.STUDIO.put("bot:last_seen", new Date().toISOString());
  if (p === "/api/bot/next" && request.method === "GET") {
    const now = Date.now(), out = [];
    let cursor;
    do {
      const page = await env.STUDIO.list({ prefix: "req:", cursor });
      for (const k of page.keys) {
        const st = k.metadata && k.metadata.status;
        const stale = st === "claimed" && (!k.metadata.claimed_at || now - Date.parse(k.metadata.claimed_at) > CLAIM_MINUTES * 60e3);
        if (st !== "queued" && !stale) continue;
        const r = await getJSON(env, k.name);
        if (!r || (r.status !== "queued" && r.status !== "claimed")) continue;
        r.status = "claimed"; r.claimed_at = new Date().toISOString(); r.attempts = (r.attempts || 0) + 1;
        await putReq(env, r);
        out.push({ id: r.id, type: r.type === "V" ? "video" : r.type === "S" ? "script" : "image", prompt: r.prompt,
                   source_image_url: r.source_id ? url.origin + "/api/bot/source/" + r.source_id : null,
                   upload_url: url.origin + "/api/bot/result/" + r.id,
                   failure_url: url.origin + "/api/bot/fail/" + r.id });
        if (out.length >= 5) break;
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor && out.length < 5);
    return json({ requests: out });
  }
  let m;
  if ((m = p.match(/^\/api\/bot\/source\/([A-Z0-9-]+)$/)) && request.method === "GET") {
    const { value, metadata } = await env.STUDIO.getWithMetadata("src:" + m[1], { type: "arrayBuffer" });
    if (!value) return fail(404, "not found");
    return new Response(value, { headers: { "content-type": metadata.mime, "cache-control": "no-store" } });
  }
  if ((m = p.match(/^\/api\/bot\/result\/([A-Z0-9-]+)$/)) && (request.method === "PUT" || request.method === "POST")) {
    const r = await getJSON(env, "req:" + m[1]);
    if (!r) return fail(404, "unknown request");
    if (r.type === "S") { // script: JSON text, validated and stored with the request
      const text = await request.text();
      if (!text || text.length > 200000) return fail(400, "script must be 1-200000 chars of JSON");
      let script; try { script = SR.parseScript(text); } catch (e) { return fail(422, "invalid script: " + e.message); }
      r.script = script; r.status = "done"; r.done_at = new Date().toISOString(); r.error = null;
      await putReq(env, r);
      return json({ ok: true, shots: script.shots.length }, 201);
    }
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return fail(400, "empty file");
    if (bytes.byteLength > MAX_BYTES) return fail(413, "larger than 25MB");
    const kind = sniff(bytes);
    if (!kind) return fail(415, "not an image or video");
    if (kind.kind !== r.type) return fail(415, r.type === "I" ? "expected an image" : "expected a video");
    const sha = await sha256Hex(bytes);
    const known = await env.STUDIO.get("sha:" + sha);
    if (known) return json({ ok: true, duplicate: true, file_id: known });
    const fid = "f" + Date.now().toString(36) + crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
    const name = r.id + ((r.files || []).length ? "-" + String.fromCharCode(97 + r.files.length) : "") + kind.ext;
    const meta = { file_id: fid, request_id: r.id, name, mime: kind.mime, size: bytes.byteLength, sha256: sha,
                   received_at: new Date().toISOString() };
    await env.STUDIO.put("file:" + fid, bytes, { metadata: { mime: kind.mime } });
    await env.STUDIO.put("sha:" + sha, fid);
    r.files = (r.files || []).concat([meta]); r.status = "done"; r.done_at = meta.received_at; r.error = null;
    if (r.type === "I" && r.then_video && !(await env.STUDIO.get("req:" + r.then_video.id))) {
      await env.STUDIO.put("src:" + r.id, bytes, { metadata: { mime: kind.mime } });
      await putReq(env, { id: r.then_video.id, type: "V", prompt: r.then_video.prompt, source_id: r.id, status: "queued",
                          created_at: meta.received_at, files: [] });
    }
    await putReq(env, r);
    return json({ ok: true, file_id: fid, name }, 201);
  }
  if ((m = p.match(/^\/api\/bot\/fail\/([A-Z0-9-]+)$/)) && request.method === "POST") {
    const r = await getJSON(env, "req:" + m[1]);
    if (!r) return fail(404, "unknown request");
    let msg = ""; try { msg = String((await request.json()).error || ""); } catch (_) {}
    // Grok sometimes fails transiently: put the job back for the next bot run, up to MAX_ATTEMPTS in total.
    if ((r.attempts || 0) < MAX_ATTEMPTS) {
      r.status = "queued"; r.claimed_at = null; r.last_error = msg.slice(0, 500) || "failed";
      await putReq(env, r);
      return json({ ok: true, retry: true });
    }
    r.status = "failed"; r.error = msg.slice(0, 500) || "failed"; r.done_at = new Date().toISOString();
    await putReq(env, r);
    return json({ ok: true });
  }
  return fail(404, "unknown route");
}

const TYPES = { ".js": "text/javascript; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".html": "text/html; charset=utf-8" };
async function staticFile(request, env, url) {
  if (env.ASSETS) return secure(await env.ASSETS.fetch(request), { "Content-Security-Policy": CSP });
  const content = globalThis.__STUDIO_CONTENT || {}; // inlined by build.mjs for API deploys
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method not allowed");
  if (!(path in content)) return fail(404, "not found");
  const ext = path.slice(path.lastIndexOf("."));
  return new Response(request.method === "HEAD" ? null : content[path],
    { headers: Object.assign({ "Content-Type": TYPES[ext] || "text/plain; charset=utf-8", "Content-Security-Policy": CSP }, SECURITY) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // ROLE=bot: the separate bot endpoint (same code, same KV, outside Cloudflare Access).
    // It serves ONLY the bot routes, guarded by BOT_TOKEN; no app, no owner API, no files.
    if (env.ROLE === "bot" && !url.pathname.startsWith("/api/bot/")) return fail(404, "not found");
    if (url.pathname.startsWith("/api/bot/")) {
      if (!isBot(request, env)) return fail(401, "unauthorized");
      return botApi(request, env, url);
    }
    if (!(await verifyOwner(request, env, ctx))) return fail(401, "unauthorized");
    if (url.pathname.startsWith("/api/")) return ownerApi(request, env, url);
    return staticFile(request, env, url);
  },
};
