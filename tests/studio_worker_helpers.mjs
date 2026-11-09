// Test helpers for studio/worker (in-memory KV, Access JWT signing). Not a test file itself.
export class MemoryKV {
  constructor() { this.m = new Map(); }
  async put(k, v, o = {}) { const val = v instanceof ArrayBuffer ? v.slice(0) : v; this.m.set(k, { v: val, meta: o.metadata || null }); }
  async get(k, o) {
    const e = this.m.get(k); if (!e) return null;
    const t = typeof o === "string" ? o : o && o.type;
    if (t === "arrayBuffer" || t === "stream") return typeof e.v === "string" ? new TextEncoder().encode(e.v).buffer : e.v;
    return typeof e.v === "string" ? e.v : new TextDecoder().decode(e.v);
  }
  async getWithMetadata(k, o) { const e = this.m.get(k); return { value: e ? await this.get(k, o) : null, metadata: e ? e.meta : null }; }
  async list({ prefix = "" } = {}) {
    return { keys: [...this.m.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name, metadata: this.m.get(name).meta })), list_complete: true };
  }
}
const b64u = b => Buffer.from(b).toString("base64url");
export async function accessSetup(email = "owner@example.com") {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = Object.assign(await crypto.subtle.exportKey("jwk", publicKey), { kid: "k1", alg: "RS256" });
  const env = { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud-123", OWNER_EMAIL: email, BOT_TOKEN: "b".repeat(40) };
  async function sign(claims) {
    const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1" }));
    const p = b64u(JSON.stringify(Object.assign({ aud: [env.ACCESS_AUD], email, exp: Math.floor(Date.now() / 1000) + 600 }, claims)));
    const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(h + "." + p));
    return h + "." + p + "." + b64u(new Uint8Array(s));
  }
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, ...a) => String(u).endsWith("/cdn-cgi/access/certs") ? new Response(JSON.stringify({ keys: [jwk] })) : realFetch(u, ...a);
  return { env, sign };
}
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer;
export const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]).buffer;
