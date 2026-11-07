/**
 * In-app email/password auth backed by Cloudflare D1 — replaces Supabase Auth.
 * Passwords: PBKDF2-SHA256, 100k iterations, per-user random salt.
 * Sessions: stateless signed cookie (userId.expiry.HMAC) — no session table.
 */

const ITER = 100_000;

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string, saltB64?: string) {
  const salt = saltB64 ? b64urlToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256);
  return { hash: b64url(new Uint8Array(bits)), salt: b64url(salt) };
}

export async function verifyPassword(password: string, hashB64: string, saltB64: string) {
  const { hash } = await hashPassword(password, saltB64);
  // constant-time-ish compare
  if (hash.length !== hashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ hashB64.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return b64url(new Uint8Array(sig));
}

/** Create a signed session cookie value valid for `days`. */
export async function makeSession(secret: string, userId: string, days = 7): Promise<string> {
  if (!secret) throw new Error('Sign-in is not configured on this environment (SESSION_SECRET missing).');
  const exp = Date.now() + days * 864e5;
  const payload = `${userId}.${exp}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Verify a session cookie; returns the userId or null. */
export async function readSession(secret: string, cookie: string | undefined): Promise<string | null> {
  if (!cookie || !secret) return null;
  const parts = cookie.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  if ((await hmac(secret, `${userId}.${exp}`)) !== sig) return null;
  return userId;
}

/**
 * The signing key for session cookies. Uses the SESSION_SECRET Pages secret when set (production).
 * Where it isn't set (preview deployments), a random 256-bit key is generated once on the server and
 * kept in KV. Nobody ever types or sees it, and it is never the same as production's key.
 */
let cached: string | null = null;
export async function sessionSecret(env: Env): Promise<string> {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (cached) return cached;
  // No secret configured: generate one once and keep it in the database, so every server instance signs with the same key.
  const fresh = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('session_secret', ?)").bind(fresh).run();
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='session_secret'").first<{ value: string }>();
  cached = row?.value || fresh;
  return cached;
}
