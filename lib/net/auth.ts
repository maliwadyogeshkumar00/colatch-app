/**
 * Email/password auth.
 * Passwords: PBKDF2-SHA256 with a per-user random salt. New hashes use 600,000 iterations (OWASP
 * guidance) and are stored as "p600k$<hash>"; older 100,000-iteration hashes still verify and are
 * upgraded the next time that person logs in (see needsRehash).
 * Sessions: signed cookie (subject.expiry.HMAC). The subject carries a session version, so bumping
 * the version in the database signs that person out everywhere (logout-all, password change, disable).
 */

const ITER = 600_000;
const LEGACY_ITER = 100_000;
const PREFIX = 'p600k$';

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

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return b64url(new Uint8Array(bits));
}

/** New hash for a password. Returns { hash, salt } to store as password_hash and salt. */
export async function hashPassword(password: string, saltB64?: string) {
  const salt = saltB64 ? b64urlToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  return { hash: PREFIX + (await pbkdf2(password, salt, ITER)), salt: b64url(salt) };
}

function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, storedHash: string, saltB64: string) {
  if (!storedHash || !saltB64 || storedHash === 'login-disabled') return false;
  const salt = b64urlToBytes(saltB64);
  if (storedHash.startsWith(PREFIX)) return equal(PREFIX + (await pbkdf2(password, salt, ITER)), storedHash);
  return equal(await pbkdf2(password, salt, LEGACY_ITER), storedHash);
}

/** True when a stored hash uses the old iteration count and should be replaced after a good login. */
export const needsRehash = (storedHash: string) => !!storedHash && !storedHash.startsWith(PREFIX);

/** Minimum rules for any new password. Returns an error message, or null when it is fine. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password|qwerty)/i.test(pw)) return 'Pick something harder to guess.';
  return null;
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
  if (!equal(await hmac(secret, `${userId}.${exp}`), sig)) return null;
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
