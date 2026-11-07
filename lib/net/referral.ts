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

/** Record who referred this new creator/brand. First referral wins; self-referral is ignored. */
export async function recordReferral(env: Env, code: string | null, referredType: 'creator' | 'brand', referredId: string): Promise<boolean> {
  if (!code) return false;
  const owner = await env.DB.prepare('SELECT owner_type, owner_id FROM referral_codes WHERE code=?').bind(code).first<{ owner_type: string; owner_id: string }>();
  if (!owner || (owner.owner_type === referredType && owner.owner_id === referredId)) return false;
  const r = await env.DB.prepare('INSERT OR IGNORE INTO referrals (id, code, referred_type, referred_id) VALUES (?,?,?,?)').bind(crypto.randomUUID(), code, referredType, referredId.toLowerCase()).run();
  return Boolean(r.meta?.changes);
}

/** Called when a deal is marked paid: books any referral earnings it unlocks. */
export async function accrueOnPaid(env: Env, dealId: string, feePct: number) {
  const d = await env.DB.prepare('SELECT d.id, d.fee, d.creator_id, k.client_email FROM creator_deals d LEFT JOIN campaigns k ON k.id=d.campaign_id WHERE d.id=?').bind(dealId).first<any>();
  if (!d) return;
  const out = [];
  // creator → creator: one-off bonus on the referred creator's first paid deal
  const rc = await env.DB.prepare("SELECT r.id, c.owner_type, c.owner_id FROM referrals r JOIN referral_codes c ON c.code=r.code WHERE r.referred_type='creator' AND r.referred_id=?").bind(String(d.creator_id).toLowerCase()).first<any>();
  if (rc) out.push(env.DB.prepare("INSERT OR IGNORE INTO referral_earnings (id, referral_id, deal_id, owner_type, owner_id, amount, kind, reason) VALUES (?,?,?,?,?,?,?,'creator_first_deal')")
    .bind(crypto.randomUUID(), rc.id, 'first', rc.owner_type, rc.owner_id, REF.creatorBonus, rc.owner_type === 'brand' ? 'credit' : 'cash'));
  // anyone → brand: share of Colatch's fee for REF.months
  if (d.client_email && d.fee) {
    const rb = await env.DB.prepare("SELECT r.id, r.created_at, c.owner_type, c.owner_id FROM referrals r JOIN referral_codes c ON c.code=r.code WHERE r.referred_type='brand' AND r.referred_id=?").bind(String(d.client_email).toLowerCase()).first<any>();
    if (rb && Date.now() - Date.parse(rb.created_at.replace(' ', 'T') + 'Z') < REF.months * 30.5 * 864e5) {
      const amount = Math.round((d.fee * feePct / 100) * REF.brandSharePct / 100);
      if (amount > 0) out.push(env.DB.prepare("INSERT OR IGNORE INTO referral_earnings (id, referral_id, deal_id, owner_type, owner_id, amount, kind, reason) VALUES (?,?,?,?,?,?,?,'brand_fee_share')")
        .bind(crypto.randomUUID(), rb.id, d.id, rb.owner_type, rb.owner_id, amount, rb.owner_type === 'brand' ? 'credit' : 'cash'));
    }
  }
  if (out.length) await env.DB.batch(out);
}
