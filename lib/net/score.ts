import { profileGaps } from './match';

/**
 * Colatch Score: a creator's reputation, built only from work done through Colatch.
 * Every point comes from something checked by the platform (a verified post, a brand sign-off,
 * a star rating, an on-time go-live), so it can't be bought, copied or carried off-platform.
 */
export type Tier = 'Rising' | 'Trusted' | 'Gold' | 'Icon';
export interface ScorePart { label: string; points: number; max: number; how: string }
export interface ColatchScore {
  score: number;
  tier: Tier;
  parts: ScorePart[];
  next: { tier: Tier; need: string } | null;
  perks: string[];
  stats: { delivered: number; onTime: number; timed: number; rating: number | null; ratings: number; signoffs: number; proofs: number; paid: number };
}

export const TIERS: { tier: Tier; min: number; perk: string }[] = [
  { tier: 'Rising', min: 0, perk: 'Your profile is live and matched to every brief you fit.' },
  { tier: 'Trusted', min: 40, perk: 'You are shown first when the team builds a shortlist for a brief you fit.' },
  { tier: 'Gold', min: 65, perk: 'Paid in 3 working days after your post goes live, whatever the brief says.' },
  { tier: 'Icon', min: 85, perk: 'You see new briefs 24 hours before everyone else.' },
];

export const SCORE_RULE = "Only work done through Colatch counts. Deals taken off-platform don't build your score.";

export function tierFor(score: number): Tier {
  let t: Tier = 'Rising';
  for (const x of TIERS) if (score >= x.min) t = x.tier;
  return t;
}

export function perksFor(tier: Tier): string[] {
  const i = TIERS.findIndex((x) => x.tier === tier);
  return TIERS.slice(0, i + 1).map((x) => x.perk);
}

export async function colatchScore(env: Env, creatorId: string): Promise<ColatchScore> {
  const c = (await env.DB.prepare('SELECT * FROM creators WHERE id=?').bind(creatorId).first()) || {};
  const d = (await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN stage IN ('live','paid') THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN stage = 'paid' THEN 1 ELSE 0 END) AS paid,
       SUM(CASE WHEN live_at IS NOT NULL AND go_live_date IS NOT NULL AND go_live_date <> '' THEN 1 ELSE 0 END) AS timed,
       SUM(CASE WHEN live_at IS NOT NULL AND go_live_date IS NOT NULL AND go_live_date <> '' AND substr(live_at,1,10) <= go_live_date THEN 1 ELSE 0 END) AS on_time,
       SUM(CASE WHEN brand_signoff_at IS NOT NULL THEN 1 ELSE 0 END) AS signoffs,
       SUM(CASE WHEN proof_public = 1 AND brand_signoff_at IS NOT NULL THEN 1 ELSE 0 END) AS proofs,
       SUM(CASE WHEN draft_status = 'approved' THEN COALESCE(revisions_used,0) ELSE 0 END) AS rev_used,
       SUM(CASE WHEN draft_status = 'approved' THEN COALESCE(revisions_included,2) ELSE 0 END) AS rev_incl
     FROM creator_deals WHERE creator_id=?`
  ).bind(creatorId).first()) || {};
  const r = (await env.DB.prepare(
    "SELECT AVG(r.stars) AS a, COUNT(*) AS n FROM ratings r JOIN creator_deals d ON d.id=r.deal_id WHERE r.by_side='brand' AND d.creator_id=?"
  ).bind(creatorId).first()) || {};

  const n = (v: any) => Number(v) || 0;
  const delivered = n(d.delivered), timed = n(d.timed), onTime = n(d.on_time), signoffs = n(d.signoffs), proofs = n(d.proofs);
  const ratings = n(r.n), rating = r.a != null && ratings ? Math.round(Number(r.a) * 10) / 10 : null;
  const revUsed = n(d.rev_used), revIncl = n(d.rev_incl);
  const gaps = profileGaps(c as any).length;

  const parts: ScorePart[] = [
    { label: 'Work delivered', max: 25, points: Math.min(25, delivered * 5), how: '5 points for every Colatch post that went live, up to 5 posts.' },
    { label: 'Brand ratings', max: 20, points: ratings ? Math.round(((rating as number) - 1) / 4 * 20) : 0, how: 'Your average star rating from brands after each deal.' },
    { label: 'On time', max: 15, points: timed ? Math.round((onTime / timed) * 15) : 0, how: 'Share of posts that went live on or before the agreed date.' },
    { label: 'Brand sign-offs', max: 10, points: Math.min(10, signoffs * 4), how: 'Brands confirming your finished work. 4 points each.' },
    { label: 'Clean drafts', max: 5, points: revIncl ? Math.round((1 - Math.min(1, revUsed / revIncl)) * 5) : 0, how: 'Fewer revision rounds used than included in the deal.' },
    { label: 'Account ownership', max: 10, points: c.owner_verified ? 10 : 0, how: 'Prove you own the handle with the code in your bio (Profile page).' },
    { label: 'Instagram verified', max: 5, points: c.verified ? 5 : 0, how: 'Colatch has confirmed your followers and reach from Instagram.' },
    { label: 'Complete profile', max: 5, points: Math.max(0, 5 - gaps), how: 'Talent, city, languages, niche, best reels and your rate all filled in.' },
    { label: 'Public proof', max: 5, points: Math.min(5, proofs * 3), how: 'Brand-verified work you let brands see on your media kit.' },
  ];
  const score = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.points, 0)));
  const tier = tierFor(score);
  const nextT = TIERS.find((x) => x.min > score) || null;

  let next: ColatchScore['next'] = null;
  if (nextT) {
    const gap = nextT.min - score;
    // suggest the cheapest real actions that close the gap, best value first
    const tips: string[] = [];
    if (!c.owner_verified) tips.push('verify your handle (+10)');
    if (gaps) tips.push(`fill ${gaps} missing profile ${gaps === 1 ? 'field' : 'fields'} (+${gaps})`);
    if (delivered < 5) tips.push('deliver your next Colatch post (+5)');
    if (signoffs < 3 && delivered > signoffs) tips.push('ask the brand to sign off your live post (+4)');
    if (proofs < 2 && signoffs > proofs) tips.push('make your signed-off work public (+3)');
    next = { tier: nextT.tier, need: `${gap} ${gap === 1 ? 'point' : 'points'} to ${nextT.tier}${tips.length ? ': ' + tips.slice(0, 2).join(', ') : ''}.` };
  }

  return { score, tier, parts, next, perks: perksFor(tier), stats: { delivered, onTime, timed, rating, ratings, signoffs, proofs, paid: n(d.paid) } };
}

/** Rupee bucket for the flex card: rounds earnings down so the exact figure stays private. */
export function earningsBucket(total: number): string | null {
  const steps: [number, string][] = [[500000, '₹5L+'], [250000, '₹2.5L+'], [100000, '₹1L+'], [50000, '₹50K+'], [25000, '₹25K+'], [10000, '₹10K+']];
  for (const [v, label] of steps) if (total >= v) return label;
  return null;
}
