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

/**
 * #1 Savings meter for one creator quote: what the brand saves vs the creator's usual rate and vs agency pricing.
 * Only positive savings are returned (null otherwise), so the UI never shows a "saving" that isn't one.
 */
export function quoteSavings(env: Env, c: { rate_reel?: number | null; followers?: number | null }, quoteFee: number, colatchPct: number) {
  const b = baselines(env);
  const market = marketRate(c);
  const vsMarket = market && market > quoteFee ? market - quoteFee : null;
  const agencyGap = Math.round((quoteFee * (b.agencyPct - colatchPct)) / 100);
  return { vsMarket, vsAgency: agencyGap > 0 ? agencyGap : null, agencyPct: b.agencyPct };
}

/** #46 Budget fit: the brand's per-creator budget vs this creator's all-in price. */
export function budgetFit(budgetTotal: number | null | undefined, creatorsNeeded: number | null | undefined, allIn: number): { label: string; tone: 'good' | 'ok' | 'bad' } | null {
  const total = Number(budgetTotal || 0), n = Math.max(1, Number(creatorsNeeded || 1));
  if (!total || !allIn) return null;
  const per = total / n;
  if (allIn <= per) return { label: 'Fits your budget', tone: 'good' };
  if (allIn <= per * 1.2) return { label: 'Stretch', tone: 'ok' };
  return { label: 'Over budget', tone: 'bad' };
}

/** #49 Brief quality score, 0–100, from what the brand gave. Returns the score and what's missing, most valuable first. */
export function briefScore(k: Record<string, any>): { score: number; missing: string[] } {
  const checks: [boolean, number, string][] = [
    [!!String(k.talent_types || '').trim(), 15, 'the kind of creator you need (dancer, chef, comedian…)'],
    [!!String(k.deliverables || '').trim(), 15, 'what each creator posts (e.g. 1 Reel + 2 Stories)'],
    [!!(k.budget_total || String(k.budget_note || '').trim()), 15, 'a budget or per-creator range'],
    [!!String(k.city || '').trim(), 10, 'the cities your buyers live in'],
    [!!(k.min_followers || k.max_followers), 10, 'a follower range'],
    [!!(k.deadline || k.shoot_date), 10, 'a go-live or shoot date'],
    [!!String(k.mandatories || '').trim(), 10, 'must-say lines or must-show shots'],
    [!!String(k.brand_url || '').trim(), 5, 'a landing page for tracked links'],
    [!!String(k.pay_type || '').trim() && k.pay_type !== 'cash' ? true : !!k.budget_total, 5, 'how creators are rewarded (cash, product, tickets)'],
    [!!String(k.languages || '').trim(), 5, 'the language creators should speak in'],
  ];
  let score = 0; const missing: string[] = [];
  for (const [ok, pts, label] of checks) { if (ok) score += pts; else missing.push(label); }
  return { score: Math.min(100, score), missing };
}

/** #68 Free webmail domains that, with no website, put a brief on hold for a quick check. */
export const FREE_MAIL = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'rediffmail.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com'];
export function isFreeMail(email: string | null | undefined): boolean {
  const d = String(email || '').toLowerCase().split('@')[1] || '';
  return FREE_MAIL.includes(d);
}
