// One price for a deal, everywhere: team desk, shortlist, receipt, reports.
// Before the brand pays, the price is live (loyalty / repeat / rush can change it).
// Once the brand's payment is recorded, fee_pct and brand_paid_paise are frozen on the deal
// and every page shows those, so a receipt never changes after the fact.
import type { Env } from './env';
import { brandFeePct, quote, RUSH_PCT } from './deal';

export type PricedDeal = ReturnType<typeof quote> & { frozen: boolean; reason: string | null; paidPaise: number | null };

export async function priceDeal(
  env: Env,
  d: { fee?: number | null; fee_pct?: number | string | null; brand_paid_paise?: number | string | null; creator_id?: string | null },
  k: { id?: string | null; client_email?: string | null; rush?: number | boolean | null },
  creatorGst = false
): Promise<PricedDeal | null> {
  const fee = Number(d.fee || 0);
  if (!fee) return null;
  const rush = Number(k.rush) === 1 || k.rush === true;
  if (d.fee_pct != null && d.fee_pct !== '') {
    // Frozen at funding. fee_pct already includes any rush surcharge.
    const pct = Number(d.fee_pct);
    const base = rush ? pct - RUSH_PCT : pct;
    const q = quote(env, fee, creatorGst, base, rush);
    return { ...q, frozen: true, reason: null, paidPaise: d.brand_paid_paise != null ? Number(d.brand_paid_paise) : null };
  }
  const r = await brandFeePct(env, k.client_email, d.creator_id, k.id);
  return { ...quote(env, fee, creatorGst, r.pct, rush), frozen: false, reason: r.reason, paidPaise: null };
}
