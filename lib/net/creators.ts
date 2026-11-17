import type { IgProfile } from './meta';
import { scrubContacts } from './guard';

export const NICHES = ['Beauty', 'Fashion', 'Lifestyle', 'Food', 'Travel', 'Fitness', 'Health', 'Tech', 'Gaming', 'Finance', 'Education', 'Parenting', 'Comedy', 'Music', 'Dance', 'Auto', 'Sports', 'Home & Decor', 'Pets', 'Regional'];
export const CREATOR_STATUSES = ['new', 'shortlisted', 'contacted', 'negotiating', 'onboarded', 'blacklisted'];
export const DEAL_STAGES = ['shortlisted', 'contacted', 'negotiating', 'confirmed', 'live', 'paid', 'dropped'];
/**
 * Stages the team may set by hand (CRM pipeline before money moves). Confirmed, live and paid
 * only come from the deal steps (brand payment recorded, post verified, payout recorded), and a
 * deal with brand money on it is stopped with Cancel, not by dragging it to Dropped.
 */
export const MANUAL_STAGES = ['shortlisted', 'contacted', 'negotiating', 'dropped'];
export function canSetStage(d: { stage: string; pay_status: string }, to: string): string | null {
  if (!MANUAL_STAGES.includes(to)) return 'Confirmed, Live and Paid are set by the deal steps (payment, live check, payout), not by hand.';
  if (d.pay_status !== 'unfunded') return 'This deal has brand money on it. Open the deal and use Cancel instead.';
  if (!MANUAL_STAGES.includes(d.stage)) return 'This deal is past the pipeline stages.';
  return null;
}
export const STAGE_LABEL: Record<string, string> = {
  shortlisted: 'Shortlisted', contacted: 'Contacted', negotiating: 'Negotiating', confirmed: 'Confirmed',
  live: 'Live', paid: 'Paid', dropped: 'Dropped', cancelled: 'Cancelled', new: 'New', onboarded: 'Onboarded', blacklisted: 'Blacklisted',
};

export interface CreatorRow {
  id: string; handle: string; name: string | null; niche: string | null; city: string | null; state: string | null;
  language: string | null; gender: string | null; followers: number | null; following: number | null; media_count: number | null;
  avg_likes: number | null; avg_comments: number | null; avg_views: number | null; engagement_rate: number | null;
  bio: string | null; profile_pic: string | null; website: string | null; email: string | null; phone: string | null;
  rate_reel: number | null; rate_story: number | null; rate_post: number | null; tier: string | null; status: string;
  tags: string | null; notes: string | null; source: string; last_synced_at: string | null; created_at: string; updated_at: string;
}

export function tierFor(f: number | null | undefined): string | null {
  if (!f && f !== 0) return null;
  if (f < 10_000) return 'Nano';
  if (f < 100_000) return 'Micro';
  if (f < 500_000) return 'Mid';
  if (f < 1_000_000) return 'Macro';
  return 'Mega';
}

export function compact(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1e7) return (v / 1e7).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '') + ' Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(v >= 1e6 ? 0 : 1).replace(/\.0$/, '') + ' L';
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
}

export function inr(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—';
  return '₹' + Math.round(Number(n)).toLocaleString('en-IN');
}

export function int(v: unknown): number | null {
  const s = String(v ?? '').replace(/[,₹\s]/g, '').trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^([\d.]+)(k|l|lac|lakh|m|cr)?$/);
  if (!m) return null;
  const mult: Record<string, number> = { k: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, m: 1e6, cr: 1e7 };
  const n = parseFloat(m[1]) * (m[2] ? mult[m[2]] : 1);
  return isFinite(n) ? Math.round(n) : null;
}

export function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

/** Benchmarks: typical Instagram engagement by tier (India, 2025–26 industry ranges). */
export function erBand(er: number | null | undefined, followers: number | null | undefined): { label: string; tone: 'good' | 'ok' | 'low' | 'na' } {
  if (er == null || !followers) return { label: 'No data', tone: 'na' };
  const t = tierFor(followers);
  const good = t === 'Nano' ? 5 : t === 'Micro' ? 3.5 : t === 'Mid' ? 2.5 : 1.8;
  const ok = good / 2;
  if (er >= good * 3) return { label: 'Unusually high — check', tone: 'ok' };
  if (er >= good) return { label: 'Strong', tone: 'good' };
  if (er >= ok) return { label: 'Average', tone: 'ok' };
  return { label: 'Low', tone: 'low' };
}

/** Upsert a creator from an Instagram lookup. Keeps team-entered fields (niche, city, rates, notes). */
export async function upsertFromInstagram(env: Env, p: IgProfile): Promise<string> {
  const existing = await env.DB.prepare('SELECT id FROM creators WHERE handle = ?').bind(p.handle.toLowerCase()).first<{ id: string }>();
  const now = new Date().toISOString();
  if (existing) {
    await env.DB.prepare(
      `UPDATE creators SET name=COALESCE(?,name), bio=?, website=?, profile_pic=?, followers=?, following=?, media_count=?,
       avg_likes=?, avg_comments=?, engagement_rate=?, tier=?, last_synced_at=?, updated_at=? WHERE id=?`
    ).bind(p.name, p.bio, p.website, p.profile_pic, p.followers, p.following, p.media_count, p.avg_likes, p.avg_comments,
      p.engagement_rate, tierFor(p.followers), now, now, existing.id).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO creators (id, handle, name, bio, website, profile_pic, followers, following, media_count, avg_likes, avg_comments,
     engagement_rate, tier, status, source, last_synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'new','instagram',?)`
  ).bind(id, p.handle.toLowerCase(), p.name, p.bio, p.website, p.profile_pic, p.followers, p.following, p.media_count,
    p.avg_likes, p.avg_comments, p.engagement_rate, tierFor(p.followers), now).run();
  return id;
}

/* ───────────── Profile review ───────────── */

export interface Review {
  score: number;              // 0–100
  verdict: string;            // one line
  summary: string;            // 2–3 sentences
  strengths: string[];
  risks: string[];
  fit: string[];              // brand categories this creator suits
  suggested_rate: string;     // e.g. "₹15,000–25,000 per reel"
  checks: Array<{ label: string; value: string; tone: 'good' | 'ok' | 'low' | 'na' }>;
}

/** Rate card guide, INR per reel, by tier — used by the rules engine and shown in the CPV tool. */
export const RATE_GUIDE: Record<string, [number, number]> = {
  Nano: [2_000, 10_000], Micro: [10_000, 60_000], Mid: [60_000, 2_00_000], Macro: [2_00_000, 5_00_000], Mega: [5_00_000, 25_00_000],
};

export function rulesReview(p: IgProfile): Review {
  const tier = tierFor(p.followers) || 'Nano';
  const band = erBand(p.engagement_rate, p.followers);
  const commentRatio = p.avg_likes ? p.avg_comments / p.avg_likes : 0;
  const ffRatio = p.followers ? p.following / p.followers : 0;
  let score = 50;
  if (band.tone === 'good') score += 20; else if (band.tone === 'ok') score += 8; else if (band.tone === 'low') score -= 15;
  if (p.posts_per_week >= 3) score += 10; else if (p.posts_per_week >= 1) score += 4; else score -= 10;
  if (p.reel_share >= 0.5) score += 8;
  if (commentRatio >= 0.02) score += 6; else if (commentRatio < 0.005) score -= 6;
  if (ffRatio > 0.8 && p.followers > 5000) score -= 12;
  if (p.bio && /(@|mail|collab|business|contact)/i.test(p.bio)) score += 4;
  score = Math.max(5, Math.min(97, Math.round(score)));
  const strengths: string[] = [];
  const risks: string[] = [];
  if (band.tone === 'good') strengths.push(`Engagement of ${p.engagement_rate}% is strong for a ${tier.toLowerCase()} creator.`);
  if (band.tone === 'low') risks.push(`Engagement of ${p.engagement_rate}% is low for ${tier.toLowerCase()} size; reach per rupee may disappoint.`);
  if (band.label.startsWith('Unusually')) risks.push('Engagement is far above normal for this size. Check for giveaways, pods or bought likes.');
  if (p.posts_per_week >= 3) strengths.push(`Posts about ${p.posts_per_week} times a week, so the audience is used to seeing them.`);
  if (p.posts_per_week < 1) risks.push('Posts less than once a week; the account may be going quiet.');
  if (p.reel_share >= 0.5) strengths.push(`${Math.round(p.reel_share * 100)}% of recent posts are Reels, the format brands buy most.`);
  else risks.push(`Only ${Math.round(p.reel_share * 100)}% of recent posts are Reels.`);
  if (commentRatio < 0.005 && p.avg_likes > 200) risks.push('Very few comments per like, which can point to passive or inflated audiences.');
  if (ffRatio > 0.8 && p.followers > 5000) risks.push('Follows almost as many accounts as follow them, a sign of follow-for-follow growth.');
  const [lo, hi] = RATE_GUIDE[tier];
  const adj = band.tone === 'good' ? 1.15 : band.tone === 'low' ? 0.7 : 1;
  return {
    score,
    verdict: score >= 75 ? 'Worth pitching to brands' : score >= 55 ? 'Usable with the right brief' : 'Proceed with caution',
    summary: `@${p.handle} is a ${tier.toLowerCase()} creator with ${compact(p.followers)} followers and ${p.engagement_rate}% engagement across the last ${p.recent.length} posts. ${band.tone === 'good' ? 'The audience is active.' : band.tone === 'low' ? 'The audience looks passive for this size.' : 'Engagement is in the normal range.'}`,
    strengths,
    risks,
    fit: [],
    suggested_rate: `${inr(lo * adj)}–${inr(hi * adj)} per reel`,
    checks: [
      { label: 'Engagement rate', value: `${p.engagement_rate}% · ${band.label}`, tone: band.tone },
      { label: 'Posting rhythm', value: `${p.posts_per_week}/week`, tone: p.posts_per_week >= 3 ? 'good' : p.posts_per_week >= 1 ? 'ok' : 'low' },
      { label: 'Reels share', value: `${Math.round(p.reel_share * 100)}%`, tone: p.reel_share >= 0.5 ? 'good' : 'ok' },
      { label: 'Comments per 100 likes', value: (commentRatio * 100).toFixed(1), tone: commentRatio >= 0.02 ? 'good' : commentRatio >= 0.005 ? 'ok' : 'low' },
      { label: 'Following / followers', value: ffRatio.toFixed(2), tone: ffRatio > 0.8 ? 'low' : 'good' },
    ],
  };
}

/** AI review on top of the rules review. Falls back to rules when no key is set or the call fails. */
export async function aiReview(env: Env, p: IgProfile): Promise<{ review: Review; engine: 'ai' | 'rules'; note?: string }> {
  const base = rulesReview(p);
  if (!env.ANTHROPIC_API_KEY) return { review: base, engine: 'rules', note: 'AI key not set, so this is the rules-based review.' };
  const captions = p.recent.slice(0, 12).map((m, i) => `${i + 1}. [${m.media_product_type || m.media_type}] likes ${m.like_count ?? 0}, comments ${m.comments_count ?? 0}: ${(m.caption || '').replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');
  const prompt = `You audit Instagram creators for Colatch, an Indian celebrity and influencer marketing agency. Be specific, honest and brief. Indian market, INR.

Profile @${p.handle} (${p.name || ''})
Bio: ${p.bio || '—'}
Followers ${p.followers}, following ${p.following}, posts ${p.media_count}
Avg likes ${p.avg_likes}, avg comments ${p.avg_comments}, engagement ${p.engagement_rate}%, ${p.posts_per_week} posts/week, ${Math.round(p.reel_share * 100)}% reels
Rules-engine score: ${base.score}/100. Rules notes: ${[...base.strengths, ...base.risks].join(' ')}
Recent posts:
${captions}

Return ONLY JSON with keys: score (0-100 integer), verdict (max 8 words), summary (2-3 sentences: niche, content style, audience quality), strengths (2-4 short strings), risks (1-4 short strings, include brand-safety flags from captions if any), fit (3-5 brand categories that suit them), suggested_rate (INR range per reel as text).`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = (await res.json()) as any;
    if (!res.ok) throw new Error(j?.error?.message || `AI error ${res.status}`);
    const text: string = j.content?.map((c: any) => c.text || '').join('') || '';
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return {
      engine: 'ai',
      review: {
        ...base,
        score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || base.score))),
        verdict: String(parsed.verdict || base.verdict),
        summary: String(parsed.summary || base.summary),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : base.strengths,
        risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : base.risks,
        fit: Array.isArray(parsed.fit) ? parsed.fit.map(String) : [],
        suggested_rate: String(parsed.suggested_rate || base.suggested_rate),
      },
    };
  } catch (e) {
    return { review: base, engine: 'rules', note: `AI review failed (${e instanceof Error ? e.message : 'error'}), showing the rules-based review.` };
  }
}

/* ───────────── CSV import ───────────── */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const HEADER_MAP: Record<string, string> = {
  handle: 'handle', username: 'handle', instagram: 'handle', ig: 'handle', 'instagram handle': 'handle', 'instagram link': 'handle', profile: 'handle',
  name: 'name', 'full name': 'name', niche: 'niche', category: 'niche', genre: 'niche', city: 'city', location: 'city', state: 'state',
  language: 'language', gender: 'gender', followers: 'followers', 'follower count': 'followers', 'avg views': 'avg_views', views: 'avg_views',
  'engagement rate': 'engagement_rate', er: 'engagement_rate', email: 'email', phone: 'phone', mobile: 'phone', whatsapp: 'phone',
  'reel rate': 'rate_reel', 'rate reel': 'rate_reel', 'reel price': 'rate_reel', rate: 'rate_reel', price: 'rate_reel', commercial: 'rate_reel',
  'story rate': 'rate_story', 'post rate': 'rate_post', notes: 'notes', remarks: 'notes', tags: 'tags',
};

export function mapCsvRows(rows: string[][]): Array<Record<string, string>> {
  if (!rows.length) return [];
  const head = rows[0].map((h) => HEADER_MAP[h.trim().toLowerCase()] || '');
  if (!head.includes('handle')) throw new Error('The first row needs a column called handle, username or instagram.');
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    head.forEach((k, i) => { if (k && r[i] != null && String(r[i]).trim()) o[k] = String(r[i]).trim(); });
    return o;
  }).filter((o) => o.handle);
}

/** Creator self-serve profile fields (join + profile pages). */
export function profileFromForm(f: FormData) {
  const many = (k: string) => f.getAll(k).map(String).filter(Boolean).join(', ') || null;
  const followers = int(f.get('followers'));
  return {
    skills: many('skills'), niche: many('niche'), city: str(f.get('city')), gender: str(f.get('gender')), language: many('language'),
    followers, avg_views: int(f.get('avg_views')), rate_reel: int(f.get('rate_reel')), rate_story: int(f.get('rate_story')),
    bio_pitch: str(scrubContacts(String(f.get('bio_pitch') ?? '')).text)?.slice(0, 200) ?? null, portfolio_links: str(f.get('portfolio_links')), phone: str(f.get('phone')),
    open_to_barter: f.get('open_to_barter') ? 1 : 0, tier: tierFor(followers),
  };
}

export async function saveProfile(env: Env, creatorId: string, p: ReturnType<typeof profileFromForm>) {
  await env.DB.prepare(
    `UPDATE creators SET skills=?, niche=?, city=?, gender=?, language=?, followers=COALESCE(CASE WHEN verified=1 THEN followers END, ?), avg_views=?, rate_reel=?, rate_story=?,
     bio_pitch=?, portfolio_links=?, phone=?, open_to_barter=?, tier=COALESCE(CASE WHEN verified=1 THEN tier END, ?), updated_at=datetime('now') WHERE id=?`
  ).bind(p.skills, p.niche, p.city, p.gender, p.language, p.followers, p.avg_views, p.rate_reel, p.rate_story, p.bio_pitch, p.portfolio_links,
    p.phone, p.open_to_barter, p.tier, creatorId).run();
}

/* ───────────── Other platforms (schema v6: creator_platforms) ───────────── */

/** Platforms creators can add beside Instagram, in the order they are shown. `mark` is the short badge text. */
export const PLATFORMS: Array<{ id: string; label: string; mark: string; host: RegExp }> = [
  { id: 'youtube', label: 'YouTube', mark: 'YT', host: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { id: 'moj', label: 'Moj', mark: 'Mj', host: /(^|\.)(mojapp\.in|moj\.app)$/ },
  { id: 'josh', label: 'Josh', mark: 'Js', host: /(^|\.)(myjosh\.in|joshapp\.in)$/ },
  { id: 'sharechat', label: 'ShareChat', mark: 'SC', host: /(^|\.)sharechat\.com$/ },
  { id: 'snapchat', label: 'Snapchat', mark: 'Sn', host: /(^|\.)snapchat\.com$/ },
  { id: 'linkedin', label: 'LinkedIn', mark: 'in', host: /(^|\.)linkedin\.com$/ },
  { id: 'x', label: 'X', mark: 'X', host: /(^|\.)(x\.com|twitter\.com)$/ },
  { id: 'facebook', label: 'Facebook', mark: 'f', host: /(^|\.)(facebook\.com|fb\.com)$/ },
  { id: 'threads', label: 'Threads', mark: 'Th', host: /(^|\.)threads\.(net|com)$/ },
];
export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);
export const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]));
export const platformInfo = (id: string) => PLATFORMS.find((p) => p.id === id) || null;

export interface PlatformRow { platform: string; handle: string; url: string | null; followers: number | null; avg_views: number | null }

/** http(s) links only, no spaces or quotes, at most 300 characters. Returns the normalised URL or null. */
export function httpUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 300 || !/^https?:\/\/[^\s<>"'`]+$/i.test(s)) return null;
  try { const u = new URL(s); return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.toString() : null; } catch { return null; }
}

/** A handle: letters, numbers, dot, underscore, hyphen; 1–60 characters; leading @ dropped. null when invalid. */
export function cleanPlatformHandle(raw: unknown): string | null {
  const h = String(raw ?? '').trim().replace(/^@+/, '');
  return /^[A-Za-z0-9._-]{1,60}$/.test(h) ? h : null;
}

/** Last useful path segment of a profile link, e.g. youtube.com/@priya → "priya", linkedin.com/in/priya-s → "priya-s". */
function handleFromUrl(u: string): string | null {
  try {
    const segs = new URL(u).pathname.split('/').filter(Boolean).filter((s) => !['in', 'c', 'channel', 'user', 'add', 'profile', 'u'].includes(s.toLowerCase()));
    return segs.length ? cleanPlatformHandle(decodeURIComponent(segs[segs.length - 1])) : null;
  } catch { return null; }
}

/**
 * Read one "add a platform" form. The handle box also accepts a pasted profile link.
 * Numbers accept 45K / 1.2L / 2M like the rest of the profile.
 */
export function platformFromForm(src: { get(k: string): unknown }): { value: PlatformRow | null; error: string | null } {
  const platform = String(src.get('platform') ?? '').trim().toLowerCase();
  const info = platformInfo(platform);
  if (!info) return { value: null, error: 'Pick a platform from the list.' };
  let rawHandle = String(src.get('handle') ?? '').trim();
  let rawUrl = String(src.get('url') ?? '').trim();
  if (/^[a-z]+:\/\//i.test(rawHandle) || /^www\./i.test(rawHandle)) { if (!rawUrl) rawUrl = rawHandle.replace(/^www\./i, 'https://www.'); rawHandle = ''; }
  let url: string | null = null;
  if (rawUrl) {
    url = httpUrl(rawUrl);
    if (!url) return { value: null, error: 'The link must start with https:// (or http://) and have no spaces.' };
    const host = new URL(url).hostname.toLowerCase();
    if (!info.host.test(host)) return { value: null, error: `That link isn't a ${info.label} link.` };
  }
  const handle = rawHandle ? cleanPlatformHandle(rawHandle) : url ? handleFromUrl(url) : null;
  if (!handle) return { value: null, error: rawHandle ? 'A handle can use letters, numbers, dots, underscores and hyphens, up to 60 characters.' : `Add your ${info.label} handle or profile link.` };
  const followers = int(src.get('followers'));
  const avg = int(src.get('avg_views'));
  const tooBig = (n: number | null) => n != null && (n < 0 || n > 2_000_000_000);
  if (String(src.get('followers') ?? '').trim() && followers == null) return { value: null, error: 'Followers should be a number, like 45K or 1.2L.' };
  if (String(src.get('avg_views') ?? '').trim() && avg == null) return { value: null, error: 'Average views should be a number, like 30K.' };
  if (tooBig(followers) || tooBig(avg)) return { value: null, error: 'That number is too big. Check it and try again.' };
  return { value: { platform, handle, url, followers, avg_views: avg }, error: null };
}

/** Platforms for one creator, in display order. */
export async function creatorPlatforms(env: Env, creatorId: string): Promise<PlatformRow[]> {
  const r = await env.DB.prepare('SELECT platform, handle, url, followers, avg_views FROM creator_platforms WHERE creator_id=?').bind(creatorId).all().catch(() => ({ results: [] as PlatformRow[] }));
  return sortPlatforms(r.results ?? []);
}
export const sortPlatforms = <T extends { platform: string }>(rows: T[]): T[] =>
  [...rows].filter((r) => PLATFORM_IDS.includes(r.platform)).sort((a, b) => PLATFORM_IDS.indexOf(a.platform) - PLATFORM_IDS.indexOf(b.platform));

/** Platforms for many creators at once: { creatorId: ['youtube', ...] }. */
export async function platformsFor(env: Env, ids: string[]): Promise<Record<string, PlatformRow[]>> {
  const out: Record<string, PlatformRow[]> = {};
  if (!ids.length) return out;
  // One placeholder per id (not an array parameter), so it works the same with every Postgres driver.
  const r = await env.DB.prepare(`SELECT creator_id, platform, handle, url, followers, avg_views FROM creator_platforms WHERE creator_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all().catch(() => ({ results: [] as any[] }));
  for (const row of r.results ?? []) (out[row.creator_id] ||= []).push(row);
  for (const k of Object.keys(out)) out[k] = sortPlatforms(out[k]);
  return out;
}

/* ───────────── Shipping address for product seeding (schema v6: creator_addresses) ───────────── */

/** Indian PIN code: 6 digits, never starting with 0. Spaces are ignored ("110 001"). */
export function validPincode(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/\s/g, '');
  return /^[1-9][0-9]{5}$/.test(s) ? s : null;
}

/** Indian mobile number as 10 digits (drops +91, 91 or a leading 0). null when it isn't one. */
export function indianMobile(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(d)) return null;
  d = d.replace(/^\+/, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export interface ShippingAddress { name: string; line1: string; line2: string | null; city: string; state: string | null; pincode: string; phone: string | null }

/** Read and check the shipping address form. */
export function addressFromForm(src: { get(k: string): unknown }): { value: ShippingAddress | null; error: string | null } {
  const t = (k: string, max: number) => String(src.get(k) ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const name = t('ship_name', 80), line1 = t('line1', 120), line2 = t('line2', 120), city = t('ship_city', 60), state = t('ship_state', 60);
  if (!name) return { value: null, error: 'Add the name the parcel should be addressed to.' };
  if (!line1) return { value: null, error: 'Add the first line of the address (house or flat, building, street).' };
  if (!city) return { value: null, error: 'Add the city.' };
  const pincode = validPincode(src.get('pincode'));
  if (!pincode) return { value: null, error: 'The PIN code should be 6 digits, like 110001.' };
  const rawPhone = String(src.get('ship_phone') ?? '').trim();
  const phone = rawPhone ? indianMobile(rawPhone) : null;
  if (rawPhone && !phone) return { value: null, error: 'The phone number should be a 10-digit Indian mobile number.' };
  return { value: { name, line1, line2: line2 || null, city, state: state || null, pincode, phone }, error: null };
}

/** A stored link that is safe to put in an href (http/https only), or null. */
export const safeHref = (u: unknown): string | null => httpUrl(u);
