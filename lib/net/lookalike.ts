/**
 * Lookalike search: "find creators like @handle".
 *
 * Scores how close a candidate is to a seed creator from attributes Colatch already holds:
 *   talent (skills) overlap ........ 20
 *   niche overlap .................. 20
 *   follower band, log scale ....... 15   (same size → 15; 10x apart → 0)
 *   city / state ................... 10   (same city 10, same state 4)
 *   languages overlap .............. 10
 *   engagement band ................ 10   (same rate → 10; 3x apart → 0)
 *   audience split similarity ...... 10   (only when both have one)
 *   other platforms overlap ........  5
 * A missing value on either side scores 0 for that part (no guessing), so fuller profiles rank higher.
 *
 * findSimilar() prefilters in SQL (shared niche, same city, or within ~3x followers), caps at 2,000 rows,
 * then scores in JS.
 */
import { list } from './match';
import { compact } from './creators';
import { audienceSimilarity, readAudience } from './audience';

export const WEIGHTS = { skills: 20, niche: 20, followers: 15, city: 10, language: 10, engagement: 10, audience: 10, platforms: 5 } as const;
export const PREFILTER_CAP = 2000;
/** Follower window for the SQL prefilter: within half an order of magnitude (≈3.16x) either way. */
export const BAND_SPREAD = Math.sqrt(10);

export interface LookalikeCreator {
  id: string; handle: string; name?: string | null;
  skills?: string | null; niche?: string | null; city?: string | null; state?: string | null; language?: string | null;
  followers?: number | null; engagement_rate?: number | null; audience?: unknown; platforms?: string[];
  [k: string]: unknown;
}
export interface LookalikeResult<T = LookalikeCreator> { creator: T; score: number; reasons: string[]; why: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function shared(a: string[], b: string[]): string[] {
  const B = new Set(b.map(norm));
  const seen = new Set<string>();
  return a.filter((x) => { const n = norm(x); if (!n || !B.has(n) || seen.has(n)) return false; seen.add(n); return true; });
}
/** Overlap as a share of the smaller list, 0–1. */
function overlapShare(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  return shared(a, b).length / Math.min(new Set(a.map(norm)).size, new Set(b.map(norm)).size);
}

/** 1 when the two follower counts are equal, falling linearly to 0 at 10x apart (log10 scale). */
export function followerCloseness(a: number | null | undefined, b: number | null | undefined): number {
  if (!a || !b || a <= 0 || b <= 0) return 0;
  return Math.max(0, 1 - Math.abs(Math.log10(a) - Math.log10(b)));
}

/** 1 when the two engagement rates are equal, falling to 0 at 3x apart. */
export function engagementCloseness(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null || b == null || !(a > 0) || !(b > 0)) return 0;
  return Math.max(0, 1 - Math.abs(Math.log(a / b)) / Math.log(3));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Score one candidate against the seed. 0–100, with the reasons behind the biggest parts. */
export function lookalikeScore(seed: LookalikeCreator, cand: LookalikeCreator): { score: number; reasons: string[] } {
  const parts: Array<{ pts: number; why: string | null }> = [];

  const sk = shared(list(seed.skills), list(cand.skills));
  parts.push({ pts: WEIGHTS.skills * overlapShare(list(seed.skills), list(cand.skills)), why: sk.length ? `Also ${sk.slice(0, 2).join(', ')}` : null });

  const ni = shared(list(seed.niche), list(cand.niche));
  parts.push({ pts: WEIGHTS.niche * overlapShare(list(seed.niche), list(cand.niche)), why: ni.length ? `Same niche: ${ni.slice(0, 2).join(', ')}` : null });

  const fc = followerCloseness(seed.followers, cand.followers);
  parts.push({ pts: WEIGHTS.followers * fc, why: fc >= 0.6 ? `Similar size (${compact(cand.followers)} vs ${compact(seed.followers)})` : null });

  const sc = norm(String(seed.city ?? '')), cc = norm(String(cand.city ?? ''));
  const ss = norm(String(seed.state ?? '')), cs = norm(String(cand.state ?? ''));
  if (sc && sc === cc) parts.push({ pts: WEIGHTS.city, why: `Also in ${cand.city}` });
  else if (ss && ss === cs) parts.push({ pts: WEIGHTS.city * 0.4, why: `Same state (${cand.state})` });

  const la = shared(list(seed.language), list(cand.language));
  parts.push({ pts: WEIGHTS.language * overlapShare(list(seed.language), list(cand.language)), why: la.length ? `Creates in ${la.slice(0, 2).join(', ')}` : null });

  const ec = engagementCloseness(seed.engagement_rate, cand.engagement_rate);
  parts.push({ pts: WEIGHTS.engagement * ec, why: ec >= 0.6 ? `Engagement close (${r1(Number(cand.engagement_rate))}% vs ${r1(Number(seed.engagement_rate))}%)` : null });

  const as = audienceSimilarity(seed.audience, cand.audience);
  if (as != null) {
    const a = readAudience(cand.audience);
    const lead = a?.gender ? (a.gender.women >= a.gender.men ? `${Math.round(a.gender.women)}% women` : `${Math.round(a.gender.men)}% men`) : a?.core_age || '';
    parts.push({ pts: WEIGHTS.audience * as, why: as >= 0.75 ? `Similar audience${lead ? ` (${lead})` : ''}` : null });
  }

  const pl = shared(seed.platforms ?? [], cand.platforms ?? []);
  parts.push({ pts: WEIGHTS.platforms * overlapShare(seed.platforms ?? [], cand.platforms ?? []), why: pl.length ? `Also on ${pl.slice(0, 2).map(platformName).join(', ')}` : null });

  const score = Math.round(Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.pts, 0))));
  const reasons = parts.filter((p) => p.why && p.pts > 0).sort((a, b) => b.pts - a.pts).map((p) => p.why as string);
  return { score, reasons };
}

const NAMES: Record<string, string> = { youtube: 'YouTube', moj: 'Moj', josh: 'Josh', sharechat: 'ShareChat', snapchat: 'Snapchat', linkedin: 'LinkedIn', x: 'X', facebook: 'Facebook', threads: 'Threads' };
const platformName = (p: string) => NAMES[p] || p;

/** One line for a list: the top three reasons. */
export const whyLine = (reasons: string[]) => (reasons.length ? reasons.slice(0, 3).join(' · ') : 'Few shared details; add niche, city and languages to both profiles.');

/** Rank candidates against a seed (pure; the seed itself and duplicates are dropped). */
export function rankLookalikes<T extends LookalikeCreator>(seed: LookalikeCreator, cands: T[], limit = 8, minScore = 1): LookalikeResult<T>[] {
  const seen = new Set<string>([seed.id]);
  const out: LookalikeResult<T>[] = [];
  for (const c of cands) {
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    const { score, reasons } = lookalikeScore(seed, c);
    if (score >= minScore) out.push({ creator: c, score, reasons, why: whyLine(reasons) });
  }
  // Ties go to the bigger, then better-engaged creator, then handle, so the order is stable.
  out.sort((a, b) => b.score - a.score || Number(b.creator.followers ?? 0) - Number(a.creator.followers ?? 0)
    || Number(b.creator.engagement_rate ?? 0) - Number(a.creator.engagement_rate ?? 0) || String(a.creator.handle).localeCompare(String(b.creator.handle)));
  return out.slice(0, limit);
}

/**
 * The SQL prefilter for a seed: shared niche, same city, or followers within ~3x. Column names are
 * unqualified (creators table). Returns null when the seed has nothing to filter on (then every creator is a candidate).
 */
export function prefilter(seed: LookalikeCreator): { sql: string; args: unknown[]; order: string; orderArgs: unknown[] } | null {
  const ors: string[] = [];
  const args: unknown[] = [];
  const niches = list(seed.niche).slice(0, 5);
  for (const n of niches) { ors.push('niche LIKE ?'); args.push(`%${n}%`); }
  if (seed.city) { ors.push('city LIKE ?'); args.push(String(seed.city).trim()); }
  const f = Number(seed.followers || 0);
  if (f > 0) { ors.push('(followers BETWEEN ? AND ?)'); args.push(Math.floor(f / BAND_SPREAD), Math.ceil(f * BAND_SPREAD)); }
  if (!ors.length) return null;
  // Closest first, so the 2,000-row cap keeps the best candidates: shared niche first, then nearest follower count.
  const orderParts: string[] = [];
  const orderArgs: unknown[] = [];
  if (niches.length) { orderParts.push(`(CASE WHEN ${niches.map(() => 'niche LIKE ?').join(' OR ')} THEN 0 ELSE 1 END)`); orderArgs.push(...niches.map((n) => `%${n}%`)); }
  if (f > 0) { orderParts.push('ABS(ln(GREATEST(COALESCE(followers, 1), 1)::float8) - ln(?::float8)) NULLS LAST'); orderArgs.push(f); }
  orderParts.push('id');
  return { sql: `(${ors.join(' OR ')})`, args, order: orderParts.join(', '), orderArgs };
}

/**
 * Creators most like the seed. `where`/`args` add the finder's own filters (unqualified creators columns).
 * Loads at most 2,000 prefiltered rows and their platforms in two queries.
 */
export async function findSimilar(
  env: Env,
  seed: LookalikeCreator,
  opts: { limit?: number; where?: string[]; args?: unknown[] } = {},
): Promise<LookalikeResult<any>[]> {
  const limit = opts.limit ?? 8;
  const pre = prefilter(seed);
  const where = ['id <> ?', "status <> 'blacklisted'", ...(pre ? [pre.sql] : []), ...(opts.where ?? [])];
  const args: unknown[] = [seed.id, ...(pre ? pre.args : []), ...(opts.args ?? [])];
  const order = pre ? pre.order : 'followers DESC NULLS LAST, id';
  const orderArgs = pre ? pre.orderArgs : [];
  const rows = (await env.DB.prepare(
    `SELECT id, handle, name, skills, niche, city, state, language, gender, followers, engagement_rate, audience, profile_pic, verified, quality_score, rate_reel, status
     FROM creators WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${PREFILTER_CAP}`
  ).bind(...args, ...orderArgs).all()).results ?? [];
  const ids = [seed.id, ...rows.map((r: any) => r.id)];
  const plat = (await env.DB.prepare(`SELECT creator_id, platform FROM creator_platforms WHERE creator_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all().catch(() => ({ results: [] }))).results ?? [];
  const byId: Record<string, string[]> = {};
  for (const p of plat as any[]) (byId[p.creator_id] ||= []).push(p.platform);
  const s = { ...seed, platforms: seed.platforms ?? byId[seed.id] ?? [] };
  return rankLookalikes(s, rows.map((r: any) => ({ ...r, platforms: byId[r.id] ?? [] })), limit);
}
