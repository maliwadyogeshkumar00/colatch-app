// Shared sign-in helpers for the team login, creator login, join, reset and settings pages.
import { headers } from "next/headers";
import { env } from "@/lib/net/env";
import { hashPassword, verifyPassword, needsRehash, passwordProblem } from "@/lib/net/auth";
import { loginBlocked, recordLogin, THROTTLE } from "@/lib/net/security";
import { revokeSessions } from "@/lib/net/creatorAuth";

export const TOO_MANY = `Too many wrong tries. Wait ${THROTTLE.windowMinutes} minutes, or reset your password.`;

/** First hop of x-forwarded-for (set by Vercel), so throttling is per visitor, not per proxy. */
export function clientIp() {
  const h = headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

const TABLE = { team: "team_users", creator: "creator_accounts" };

let dummy = null;
async function dummyHash() {
  if (!dummy) dummy = await hashPassword(crypto.randomUUID());
  return dummy;
}

/**
 * Checks a password with throttling. Returns "ok" | "bad" | "blocked".
 * When the account does not exist we still run a full password hash, so the response time does not
 * tell anyone which emails have accounts. Old-format hashes are upgraded after a good login.
 */
export async function checkLogin(kind, email, password, row) {
  const key = `${kind}:${email}|${clientIp()}`;
  if (await loginBlocked(key)) return "blocked";
  let ok = false;
  if (row) ok = await verifyPassword(password, row.password_hash, row.salt);
  else { const d = await dummyHash(); await verifyPassword(password, d.hash, d.salt); }
  if (ok && row.disabled_at) ok = false;
  await recordLogin(key, ok);
  if (ok && needsRehash(row.password_hash)) {
    const { hash, salt } = await hashPassword(password);
    await env.DB.prepare(`UPDATE ${TABLE[kind]} SET password_hash=?, salt=? WHERE id=?`).bind(hash, salt, row.id).run();
  }
  return ok ? "ok" : "bad";
}

/** Counts a non-login request (reset emails, setup attempts) against a throttle key. True when over the limit. */
export async function overLimit(key) {
  if (await loginBlocked(key)) return true;
  await recordLogin(key, false);
  return false;
}

/** Sets a new password and signs the person out everywhere. Returns an error message or null. */
export async function setPassword(kind, id, pw) {
  const problem = passwordProblem(pw);
  if (problem) return problem;
  const { hash, salt } = await hashPassword(pw);
  const r = await env.DB.prepare(`UPDATE ${TABLE[kind]} SET password_hash=?, salt=? WHERE id=?`).bind(hash, salt, id).run();
  if (!r.meta?.changes) return "That account no longer exists.";
  await revokeSessions(kind, id);
  return null;
}

/** Constant-time comparison of two secrets of any length (compares their SHA-256 digests). */
export async function sameSecret(a, b) {
  const d = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
  const [x, y] = await Promise.all([d(a), d(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0 && String(a).length > 0 && String(b).length > 0;
}

/** Base URL for links that go out by email: SITE_URL when set, never the request's Host header. */
export function mailBase() {
  const u = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://colatch-app.vercel.app");
  return u.replace(/\/$/, "");
}

/** Base URL of the current request, for links shown on screen to a signed-in team member. */
export function requestBase() {
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) return mailBase();
  const proto = h.get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
