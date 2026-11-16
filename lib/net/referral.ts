import { cookies } from 'next/headers';

/**
 * Two-sided affiliate program.
 *  - Creator brings a creator → ₹REF_CREATOR_BONUS when that creator's first paid deal clears.
 *  - Anyone (creator or brand) brings a brand → REF_BRAND_SHARE_PCT % of Colatch's fee on that brand's deals
 *    for REF_MONTHS months. Creators get it as cash; brands get it as credit off their next invoice.
 * Paid out of Colatch's own fee, never out of the creator's fee or the brand's budget.
 */
export const REF = { creatorBonus: 500, brandSharePct: 10, months: 12 };
export const REF_COOKIE = 'clt_ref';

/** Brand-referral share of Colatch's fee grows with how many brands someone has brought. */
export const BRAND_TIERS = [
  { min: 10, pct: 15, label: '10+ brands' },
  { min: 5, pct: 12, label: '5 to 9 brands' },
  { min: 0, pct: REF.brandSharePct, label: '1 to 4 brands' },
];
export function brandTierFor(brands: number) {
  return BRAND_TIERS.find((t) => brands >= t.min)!;
}
/** How many brands a code (or an owner's code) has brought in. */
export async function brandsReferred(env: Env, code: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM referrals WHERE code=? AND referred_type='brand'").bind(code).first<{ n: number }>();
  return Number(r?.n ?? 0);
}
/** % of Colatch's fee paid to the owner of this code on their referred brands' deals. */
export async function brandShareFor(env: Env, code: string): Promise<number> {
  return brandTierFor(await brandsReferred(env, code)).pct;
}

export async function ensureCode(env: Env, ownerType: 'creator' | 'brand', ownerId: string, name: string | null): Promise<string> {
  const have = await env.DB.prepare('SELECT code FROM referral_codes WHERE owner_type=? AND owner_id=?').bind(ownerType, ownerId).first<{ code: string }>();
  if (have) return have.code;
  const base = String(name || ownerId).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 7) || 'COLATCH';
  for (let i = 0; i < 5; i++) {
    const code = base + Math.floor(10 + Math.random() * 89);
    const r = await env.DB.prepare('INSERT OR IGNORE INTO referral_codes (code, owner_type, owner_id, owner_name) VALUES (?,?,?,?)').bind(code, ownerType, ownerId, name).run();
    if (r.meta?.changes) return code;
  }
  throw new Error('Could not create a referral code.');
}

export function readRefCookie(param?: string | null): string | null {
  const v = cookies().get(REF_COOKIE)?.value || param || '';
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return c || null;
}

/**
 * Record who referred this new creator/brand. First referral wins; self-referral is ignored.
 * A brand only counts as referred if this is the first campaign ever posted from that email, so
 * nobody can claim an existing Colatch client by submitting a brief with their code attached.
 */
export async function recordReferral(env: Env, code: string | null, referredType: 'creator' | 'brand', referredId: string): Promise<boolean> {
  if (!code) return false;
  const owner = await env.DB.prepare('SELECT owner_type, owner_id FROM referral_codes WHERE code=?').bind(code).first<{ owner_type: string; owner_id: string }>();
  const id = String(referredId || '').toLowerCase();
  if (!owner || !id || (owner.owner_type === referredType && String(owner.owner_id).toLowerCase() === id)) return false;
  if (referredType === 'brand') {
    const prior = await env.DB.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE LOWER(client_email)=?').bind(id).first<{ n: number }>();
    if (Number(prior?.n || 0) > 1) return false;
    // Someone referring their own company address (same email domain) earns nothing.
    const ownerEmail = owner.owner_type === 'brand' ? String(owner.owner_id).toLowerCase() : '';
    if (ownerEmail && ownerEmail.split('@')[1] && ownerEmail.split('@')[1] === id.split('@')[1]) return false;
  }
  const r = await env.DB.prepare('INSERT OR IGNORE INTO referrals (id, code, referred_type, referred_id) VALUES (?,?,?,?)').bind(crypto.randomUUID(), code, referredType, id).run();
  return Boolean(r.meta?.changes);
}

/**
 * Books the referral earnings a paid deal unlocks. Runs inside the payout transaction (t), so the
 * earnings exist if and only if the payout does. Unique indexes make it safe to call twice.
 * The brand share is a % of the fee Colatch actually charged on this deal (frozen at funding).
 */
export async function accrueOnPaidTx(t: any, dealId: string) {
  const d = await t.prepare('SELECT d.id, d.fee, d.fee_pct, d.creator_id, k.client_email FROM creator_deals d LEFT JOIN campaigns k ON k.id=d.campaign_id WHERE d.id=?').bind(dealId).first();
  if (!d) return;
  // creator → creator: one-off bonus on the referred creator's first paid deal
  const rc = await t.prepare("SELECT r.id, c.owner_type, c.owner_id FROM referrals r JOIN referral_codes c ON c.code=r.code WHERE r.referred_type='creator' AND r.referred_id=?").bind(String(d.creator_id).toLowerCase()).first();
  if (rc) await t.prepare("INSERT INTO referral_earnings (id, referral_id, deal_id, owner_type, owner_id, amount, kind, reason) VALUES (?,?,?,?,?,?,?,'creator_first_deal') ON CONFLICT DO NOTHING")
    .bind(crypto.randomUUID(), rc.id, 'first', rc.owner_type, rc.owner_id, REF.creatorBonus, rc.owner_type === 'brand' ? 'credit' : 'cash').run();
  // anyone → brand: share of Colatch's fee for REF.months
  const pct = d.fee_pct != null ? Number(d.fee_pct) : null;
  if (d.client_email && d.fee && pct != null) {
    const rb = await t.prepare("SELECT r.id, r.code, r.created_at, c.owner_type, c.owner_id FROM referrals r JOIN referral_codes c ON c.code=r.code WHERE r.referred_type='brand' AND r.referred_id=?").bind(String(d.client_email).toLowerCase()).first();
    if (rb && Date.now() - Date.parse(String(rb.created_at).replace(' ', 'T') + 'Z') < REF.months * 30.5 * 864e5) {
      const n = await t.prepare("SELECT COUNT(*) AS n FROM referrals WHERE code=? AND referred_type='brand'").bind(rb.code).first();
      const share = brandTierFor(Number(n?.n || 0)).pct;
      const amount = Math.round(((Number(d.fee) * pct) / 100) * share / 100);
      if (amount > 0) await t.prepare("INSERT INTO referral_earnings (id, referral_id, deal_id, owner_type, owner_id, amount, kind, reason) VALUES (?,?,?,?,?,?,?,'brand_fee_share') ON CONFLICT DO NOTHING")
        .bind(crypto.randomUUID(), rb.id, d.id, rb.owner_type, rb.owner_id, amount, rb.owner_type === 'brand' ? 'credit' : 'cash').run();
    }
  }
}

/** @deprecated Use accrueOnPaidTx inside the payout transaction (lib/net/dealflow.ts). */
export async function accrueOnPaid(env: Env, dealId: string, _feePct?: number) {
  await env.DB.tx((t: any) => accrueOnPaidTx(t, dealId));
}
