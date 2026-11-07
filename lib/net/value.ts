import { RATE_GUIDE, tierFor } from './creators';

/**
 * The value ledger: every rupee a brand saved or earned through Colatch, and every rupee a creator earned.
 * Each figure names its baseline so nothing is overstated. Baselines are adjustable via env:
 *   AGENCY_MARKUP_PCT  typical agency markup Colatch replaces (default 25; industry range 15–30)
 *   MEDIA_CPM          what 1,000 paid-ad views would cost a brand (default ₹120), for the ads-equivalent figure
 */
export function baselines(env: Env) {
  const m = Number((env as any).AGENCY_MARKUP_PCT), c = Number((env as any).MEDIA_CPM);
  return { agencyPct: isFinite(m) && m > 0 ? m : 25, cpm: isFinite(c) && c > 0 ? c : 120 };
}

/** Benchmark price for one reel by this creator: their own rate card, else the tier midpoint. */
export function marketRate(c: { rate_reel?: number | null; followers?: number | null }): number | null {
  if (c.rate_reel) return c.rate_reel;
  const t = tierFor(c.followers ?? null);
  if (!t) return null;
  const [lo, hi] = RATE_GUIDE[t];
  return Math.round((lo + hi) / 2);
}

export interface DealValue {
  fee: number; market: number | null; savedVsMarket: number; savedVsAgency: number; adsEquivalent: number; sales: number; rewards: number; views: number;
}

export function dealValue(env: Env, d: { fee?: number | null; market_rate?: number | null; actual_views?: number | null; sales_value?: number | null; reward_value?: number | null }, feePct: number): DealValue {
  const b = baselines(env);
  const fee = d.fee || 0;
  const market = d.market_rate ?? null;
  const views = d.actual_views || 0;
  return {
    fee, market, views,
    savedVsMarket: market && market > fee ? market - fee : 0,
    savedVsAgency: fee ? Math.max(0, Math.round((fee * (b.agencyPct - feePct)) / 100)) : 0,
    adsEquivalent: Math.round((views / 1000) * b.cpm),
    sales: d.sales_value || 0,
    rewards: d.reward_value || 0,
  };
}

export function sumValue(vs: DealValue[]) {
  const s = vs.reduce((a, v) => ({
    fee: a.fee + v.fee, savedVsMarket: a.savedVsMarket + v.savedVsMarket, savedVsAgency: a.savedVsAgency + v.savedVsAgency,
    adsEquivalent: a.adsEquivalent + v.adsEquivalent, sales: a.sales + v.sales, rewards: a.rewards + v.rewards, views: a.views + v.views,
  }), { fee: 0, savedVsMarket: 0, savedVsAgency: 0, adsEquivalent: 0, sales: 0, rewards: 0, views: 0 });
  return { ...s, saved: s.savedVsMarket + s.savedVsAgency, roas: s.fee ? s.sales / s.fee : null, adsMultiple: s.fee ? s.adsEquivalent / s.fee : null };
}
