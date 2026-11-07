import { colatchScore, earningsBucket, type Tier } from './score';

/** Everything the flex card and its landing page show for one referral code. Nothing private: no exact earnings, no contact info. */
export interface FlexData {
  code: string;
  ownerType: 'creator' | 'brand';
  name: string;
  handle: string | null;
  tier: Tier | null;
  score: number | null;
  delivered: number;
  rating: number | null;
  ratings: number;
  earned: string | null;
  skills: string | null;
  city: string | null;
}

export const cleanCode = (raw: unknown) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

export async function flexData(env: Env, rawCode: unknown): Promise<FlexData | null> {
  const code = cleanCode(rawCode);
  if (!code) return null;
  const rc = await env.DB.prepare('SELECT code, owner_type, owner_id, owner_name FROM referral_codes WHERE code=?').bind(code).first();
  if (!rc) return null;
  if (rc.owner_type !== 'creator') {
    return { code, ownerType: 'brand', name: rc.owner_name || 'A Colatch brand', handle: null, tier: null, score: null, delivered: 0, rating: null, ratings: 0, earned: null, skills: null, city: null };
  }
  const c = await env.DB.prepare("SELECT id, name, handle, skills, city, show_earnings FROM creators WHERE id=? AND status <> 'blacklisted'").bind(rc.owner_id).first();
  if (!c) return null;
  const s = await colatchScore(env, c.id);
  let earned: string | null = null;
  if (Number(c.show_earnings) === 1) {
    const row = await env.DB.prepare("SELECT COALESCE(SUM(fee),0) AS t FROM creator_deals WHERE creator_id=? AND pay_status='paid'").bind(c.id).first();
    earned = earningsBucket(Number(row?.t) || 0);
  }
  return {
    code, ownerType: 'creator', name: c.name || c.handle, handle: c.handle, tier: s.tier, score: s.score,
    delivered: s.stats.delivered, rating: s.stats.rating, ratings: s.stats.ratings, earned, skills: c.skills, city: c.city,
  };
}
