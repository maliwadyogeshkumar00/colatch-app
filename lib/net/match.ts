/**
 * Colatch matching engine — decides which creator sees which opportunity,
 * and ranks applicants for the team.
 *
 * Hard gates (fail any → the creator never sees the brief):
 *   talent type  · brief asks for Dancer → only creators with Dancer in skills
 *   followers    · inside min/max range (when the creator's count is known)
 *   gender       · when the brief specifies one
 *   city         · when the brief names cities and is not remote-friendly
 *   blacklisted  · never shown anything
 * Soft score (0–100) on top: niche overlap, language, follower sweet spot,
 * engagement quality, profile quality score, verified handle, profile completeness.
 */

export const SKILLS = [
  'Dancer', 'Singer', 'Musician', 'Rapper', 'Comedian', 'Actor', 'Model', 'Anchor / Host', 'Voice-over artist',
  'Chef / Food creator', 'Fitness coach', 'Yoga instructor', 'Makeup artist', 'Fashion stylist', 'Photographer',
  'Videographer / Editor', 'Tech reviewer', 'Gamer', 'Finance educator', 'Teacher / Educator', 'Doctor / Health expert',
  'Travel creator', 'Parent creator', 'Pet creator', 'Artist / Illustrator', 'Athlete', 'Motivational speaker', 'UGC creator',
];
export const LANGUAGES = ['Hindi', 'English', 'Hinglish', 'Punjabi', 'Marathi', 'Gujarati', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Odia', 'Bhojpuri', 'Urdu', 'Assamese'];
export const CITIES = ['Mumbai', 'Delhi', 'Gurugram', 'Noida', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Chandigarh', 'Indore', 'Surat', 'Kochi', 'Goa', 'Bhopal', 'Patna', 'Nagpur'];

export const list = (s: string | null | undefined): string[] =>
  String(s ?? '').split(/[,\n|]/).map((x) => x.trim()).filter(Boolean);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const overlap = (a: string[], b: string[]) => {
  const B = new Set(b.map(norm));
  return a.filter((x) => B.has(norm(x)));
};
/** Loose skill match: "Dancer" ~ "Dance", "Chef / Food creator" ~ "chef". */
const stem = (s: string) => norm(s).split(' ')[0].replace(/(ers|er|ists|ist|ors|or|es|e|s)$/, '');
function skillHit(need: string, has: string[]): boolean {
  const n = norm(need), ns = stem(need);
  return has.some((h) => norm(h) === n || (ns.length >= 3 && stem(h) === ns));
}

export interface MatchCreator {
  skills: string | null; niche: string | null; city: string | null; language: string | null; gender: string | null;
  followers: number | null; engagement_rate: number | null; quality_score: number | null; verified: number | null;
  status?: string | null; bio_pitch?: string | null; portfolio_links?: string | null; rate_reel?: number | null; open_to_barter?: number | null;
}
export interface MatchCampaign {
  talent_types: string | null; niche: string | null; city: string | null; languages: string | null; gender: string | null;
  min_followers: number | null; max_followers: number | null; brief?: string | null; deliverables?: string | null; pay_type?: string | null;
}
export interface MatchResult { eligible: boolean; score: number; reasons: string[]; blockers: string[]; }

export function match(c: MatchCreator, k: MatchCampaign): MatchResult {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const skills = list(c.skills);
  const need = list(k.talent_types);

  if (c.status === 'blacklisted') blockers.push('Not available');
  // creators who said cash-only never see product-only deals
  if (['barter', 'ticket', 'giveaway', 'commission'].includes(String(k.pay_type)) && !c.open_to_barter) blockers.push('No fixed cash fee (you chose paid deals only)');

  // talent type — the strictest gate
  if (need.length) {
    const hits = need.filter((n) => skillHit(n, skills));
    if (!hits.length) blockers.push(`Needs ${need.join(' / ')}`);
    else reasons.push(`You're a ${hits.join(', ').toLowerCase()}`);
  }
  // followers
  if (c.followers != null) {
    if (k.min_followers && c.followers < k.min_followers) blockers.push(`Needs ${fmt(k.min_followers)}+ followers`);
    if (k.max_followers && c.followers > k.max_followers) blockers.push(`For creators under ${fmt(k.max_followers)} followers`);
  } else if (k.min_followers) {
    blockers.push('Add your follower count to unlock this');
  }
  // gender
  if (k.gender && c.gender && norm(k.gender) !== norm(c.gender)) blockers.push(`Looking for ${k.gender.toLowerCase()} creators`);
  if (k.gender && !c.gender) blockers.push('Add your gender in your profile to unlock this');
  // city
  const cities = list(k.city).filter((x) => !/^(any|anywhere|pan india|remote|all india|india)$/i.test(x));
  if (cities.length) {
    if (!c.city) blockers.push('Add your city to unlock this');
    else if (!overlap([c.city], cities).length) blockers.push(`Shoot is in ${cities.join(' / ')}`);
    else reasons.push(`Based in ${c.city}`);
  }

  // soft score
  let score = 40;
  if (need.length && !blockers.some((b) => b.startsWith('Needs ') && !b.includes('followers'))) score += 20;
  const nicheHits = overlap(list(c.niche), list(k.niche));
  if (nicheHits.length) { score += 12; reasons.push(`Your niche: ${nicheHits.join(', ')}`); }
  const langHits = overlap(list(c.language), list(k.languages));
  if (list(k.languages).length) {
    if (langHits.length) { score += 8; reasons.push(`Creates in ${langHits.join(', ')}`); }
    else score -= 6;
  }
  if (c.followers && (k.min_followers || k.max_followers)) {
    const lo = k.min_followers || 0, hi = k.max_followers || lo * 10 || c.followers * 2;
    if (c.followers >= lo && c.followers <= hi) { score += 6; reasons.push(`${fmt(c.followers)} followers fits the range`); }
  }
  if (c.engagement_rate != null) {
    if (c.engagement_rate >= 4) { score += 8; reasons.push(`Strong ${c.engagement_rate}% engagement`); }
    else if (c.engagement_rate >= 2) score += 4;
    else if (c.engagement_rate < 1) score -= 6;
  }
  if (c.quality_score != null) score += Math.round((c.quality_score - 50) / 5);
  if (c.verified) score += 4;
  if ((c as any).owner_verified) score += 3;
  const complete = [c.skills, c.niche, c.city, c.language, c.bio_pitch, c.portfolio_links, c.rate_reel].filter((x) => x != null && x !== '').length;
  score += complete - 4;

  return { eligible: blockers.length === 0, score: Math.max(1, Math.min(99, Math.round(score))), reasons: reasons.slice(0, 4), blockers };
}

function fmt(n: number): string {
  if (n >= 1e7) return `${+(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `${+(n / 1e5).toFixed(1)} L`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(0)}K`;
  return String(n);
}

/** Missing profile fields that would unlock more briefs, most valuable first. */
export function profileGaps(c: MatchCreator): string[] {
  const g: string[] = [];
  if (!list(c.skills).length) g.push('What you do (dancer, singer, chef…)');
  if (c.followers == null) g.push('Follower count');
  if (!c.city) g.push('City');
  if (!c.gender) g.push('Gender');
  if (!list(c.language).length) g.push('Languages');
  if (!list(c.niche).length) g.push('Niche');
  if (!c.portfolio_links) g.push('2–3 best reels');
  if (c.rate_reel == null) g.push('Your reel rate');
  return g;
}
