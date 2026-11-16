// Roles, permissions, login throttling, password-reset tokens and the audit log.
import { env } from './env';

// ------------------------------------------------------------------ team roles and permissions
export const ROLES = ['owner', 'admin', 'shortlist', 'finance', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner (everything)',
  admin: 'Admin (everything except owner settings)',
  shortlist: 'Shortlister (campaigns, creators, deals; no money)',
  finance: 'Finance (payments and payouts; no shortlists)',
  viewer: 'Viewer (read only)',
};

/**
 * What each permission means:
 *  view        see the team desk
 *  shortlist   applicants, shortlists, campaign edits, creator records, deal progress (draft, live checks)
 *  finance     record brand payments, creator payouts, refunds, referral and bypass credits
 *  team        add/disable members, change roles, issue password-reset links
 *  owner       demo data, platform settings, owner role changes
 */
export type Perm = 'view' | 'shortlist' | 'finance' | 'team' | 'owner';
const GRANTS: Record<Role, Perm[]> = {
  owner: ['view', 'shortlist', 'finance', 'team', 'owner'],
  admin: ['view', 'shortlist', 'finance', 'team'],
  shortlist: ['view', 'shortlist'],
  finance: ['view', 'finance'],
  viewer: ['view'],
};
export function can(role: string | null | undefined, perm: Perm): boolean {
  const r = (ROLES as readonly string[]).includes(String(role)) ? (role as Role) : null;
  return !!r && GRANTS[r].includes(perm);
}

// ------------------------------------------------------------------ login throttling
/** Max failed logins per key inside the window before we refuse to check the password at all. */
export const THROTTLE = { maxFailures: 8, windowMinutes: 15 };

export async function loginBlocked(key: string): Promise<boolean> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND ok = 0 AND at > now() - interval '${THROTTLE.windowMinutes} minutes'`
  ).bind(key).first();
  return Number(r?.n || 0) >= THROTTLE.maxFailures;
}

export async function recordLogin(key: string, ok: boolean) {
  await env.DB.prepare('INSERT INTO login_attempts (key, ok) VALUES (?, ?)').bind(key, ok ? 1 : 0).run();
  if (ok) await env.DB.prepare('DELETE FROM login_attempts WHERE key = ? AND ok = 0').bind(key).run();
  // Keep the table small.
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM login_attempts WHERE at < now() - interval '2 days'").run();
}

// ------------------------------------------------------------------ password-reset tokens
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(d));
}

export const RESET_HOURS = 2;

/** Creates a single-use reset token. Only its hash is stored; the raw token goes in the link once. */
export async function createResetToken(userKind: 'creator' | 'team' | 'brand', userId: string, createdBy: string | null): Promise<string> {
  const raw = b64url(crypto.getRandomValues(new Uint8Array(32)));
  // A new link cancels any earlier unused one for the same person.
  await env.DB.prepare('UPDATE password_resets SET used_at = now() WHERE user_kind = ? AND user_id = ? AND used_at IS NULL').bind(userKind, userId).run();
  await env.DB.prepare(
    `INSERT INTO password_resets (token_hash, user_kind, user_id, created_by, expires_at) VALUES (?, ?, ?, ?, now() + interval '${RESET_HOURS} hours')`
  ).bind(await sha256(raw), userKind, userId, createdBy).run();
  return raw;
}

/** Looks a token up without using it. Null when unknown, used or expired. */
export async function peekResetToken(raw: string): Promise<{ user_kind: 'creator' | 'team' | 'brand'; user_id: string } | null> {
  if (!raw || raw.length < 20) return null;
  return env.DB.prepare('SELECT user_kind, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > now()')
    .bind(await sha256(raw)).first();
}

/** Marks the token used and returns who it was for, atomically, so it can never be used twice. */
export async function consumeResetToken(raw: string): Promise<{ user_kind: 'creator' | 'team' | 'brand'; user_id: string } | null> {
  if (!raw || raw.length < 20) return null;
  const r = await env.DB.prepare(
    'UPDATE password_resets SET used_at = now() WHERE token_hash = ? AND used_at IS NULL AND expires_at > now() RETURNING user_kind, user_id'
  ).bind(await sha256(raw)).first();
  return r || null;
}

// ------------------------------------------------------------------ audit log
export async function audit(
  actor: { kind: 'team' | 'creator' | 'brand' | 'system'; id?: string | null },
  action: string,
  entity?: string | null,
  entityId?: string | null,
  detail?: Record<string, unknown> | null,
  database: any = env.DB
) {
  await database.prepare('INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(actor.kind, actor.id ?? null, action, entity ?? null, entityId ?? null, detail ? JSON.stringify(detail) : null)
    .run();
}

// ------------------------------------------------------------------ input helpers
export const isEmail = (s: string) => /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/.test(s);
/** Same-site relative paths only; anything else falls back. Blocks //evil.com and /\evil.com. */
export function safeNext(next: unknown, prefix: string, fallback: string): string {
  const s = String(next || '');
  if (!s.startsWith(prefix) || s.startsWith('//') || s.includes('\\') || /[\r\n]/.test(s)) return fallback;
  return s;
}

// ------------------------------------------------------------------ email verification
export const VERIFY_HOURS = 48;

/** Creates a single-use email verification token (only its hash is stored). An earlier unused one is cancelled. */
export async function createVerifyToken(userKind: 'creator' | 'brand', userId: string, email: string): Promise<string> {
  const raw = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('UPDATE email_verifications SET used_at = now() WHERE user_kind = ? AND user_id = ? AND used_at IS NULL').bind(userKind, userId).run();
  await env.DB.prepare(
    `INSERT INTO email_verifications (token_hash, user_kind, user_id, email, expires_at) VALUES (?, ?, ?, ?, now() + interval '${VERIFY_HOURS} hours')`
  ).bind(await sha256(raw), userKind, userId, String(email).toLowerCase()).run();
  return raw;
}

/** Uses a verification token once and marks the account's email verified. Returns who it was for, or null. */
export async function consumeVerifyToken(raw: string): Promise<{ user_kind: 'creator' | 'brand'; user_id: string; email: string } | null> {
  if (!raw || raw.length < 20) return null;
  const r = await env.DB.prepare(
    'UPDATE email_verifications SET used_at = now() WHERE token_hash = ? AND used_at IS NULL AND expires_at > now() RETURNING user_kind, user_id, email'
  ).bind(await sha256(raw)).first();
  if (!r) return null;
  const table = r.user_kind === 'brand' ? 'brand_accounts' : 'creator_accounts';
  // Only if the account's email is still the one the link was sent to.
  await env.DB.prepare(`UPDATE ${table} SET email_verified_at = now() WHERE id = ? AND LOWER(email) = ? AND email_verified_at IS NULL`).bind(r.user_id, r.email).run();
  return r;
}

// ------------------------------------------------------------------ error log
/** Records a server error where the team can see it (Team > System health). Never throws. */
export async function logError(source: string, err: unknown, detail?: Record<string, unknown>) {
  const e: any = err;
  const message = String(e?.message || e || 'Unknown error').slice(0, 500);
  console.error(JSON.stringify({ level: 'error', source, message, digest: e?.digest ?? null, ...(detail || {}) }));
  try {
    await env.DB.prepare('INSERT INTO app_errors (source, message, digest, detail) VALUES (?, ?, ?, ?)')
      .bind(source.slice(0, 120), message, e?.digest ?? null, detail ? JSON.stringify(detail) : null).run();
  } catch { /* logging must never break the request */ }
}
