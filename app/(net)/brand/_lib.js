// Shared helpers for the brand account pages (join, settings, verify, team).
import { env } from "@/lib/net/env";
import { createVerifyToken, audit } from "@/lib/net/security";
import { notify } from "@/lib/net/notify";
import { mailBase } from "../reset/_lib";

export const clean = (v, n = 120) => { const s = String(v ?? "").trim().replace(/\s+/g, " "); return s ? s.slice(0, n) : null; };

/** Indian phone: 10 digits, optional +91 / 0 prefix. Returns the cleaned value, null when empty, or false when invalid. */
export function cleanPhone(v) {
  const s = String(v ?? "").replace(/[\s()-]/g, "");
  if (!s) return null;
  return /^(\+?91|0)?[6-9]\d{9}$/.test(s) ? s : false;
}

/** GSTIN: 15 characters, state code + PAN + entity + Z + check. Format check only. */
export function cleanGstin(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s) ? s : false;
}

export function cleanWebsite(v) {
  let s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { const u = new URL(s); return /\./.test(u.hostname) && u.protocol.startsWith("http") ? u.toString().slice(0, 200) : false; } catch { return false; }
}

/** Sends a fresh confirmation link. Returns the notify status ('sent' | 'not_configured' | 'failed' | ...). */
export async function sendBrandVerify(acc) {
  const vt = await createVerifyToken("brand", acc.id, acc.email);
  return notify({
    template: "verify_email", to: acc.email, toKind: "brand", toId: acc.id, payload: {},
    dedupeKey: `verify:brand:${acc.id}:${Date.now()}`, secret: { link: `${mailBase()}/verify/${vt}` },
  });
}

/**
 * Links briefs sent from this email to the brand account. Only call once the email is verified:
 * otherwise anyone could type another brand's email and see their campaigns.
 * Never takes a campaign that already belongs to another account.
 */
export async function linkCampaignsByEmail(accountId) {
  const acc = await env.DB.prepare("SELECT id, email, email_verified_at, verified_by FROM brand_accounts WHERE id=? AND disabled_at IS NULL").bind(accountId).first();
  if (!acc || !acc.email_verified_at) return 0;
  const r = await env.DB.prepare(
    "UPDATE campaigns SET brand_account_id=? WHERE LOWER(client_email)=? AND brand_account_id IS NULL"
  ).bind(acc.id, String(acc.email).toLowerCase()).run();
  const n = Number(r.meta?.changes || 0);
  if (acc.verified_by) await env.DB.prepare("UPDATE campaigns SET brand_verified=1 WHERE brand_account_id=?").bind(acc.id).run();
  if (n) await audit({ kind: "brand", id: acc.id }, "brand.campaigns_linked", "brand_account", acc.id, { count: n });
  return n;
}
