import { env } from "@/lib/net/env";

/** Live pitches with the creator facts brands may see before booking (never handle, email or phone). */
export const PITCH_SELECT = `SELECT p.id, p.title, p.idea, p.category, p.format, p.occasion, p.price, p.requests, p.created_at,
    c.name, c.followers, c.city, c.niche, c.verified, c.owner_verified,
    (SELECT AVG(r.stars) FROM ratings r JOIN creator_deals d ON d.id=r.deal_id WHERE r.by_side='brand' AND d.creator_id=c.id) AS rating,
    (SELECT COUNT(*) FROM creator_deals d WHERE d.creator_id=c.id AND d.stage IN ('live','paid')) AS done
  FROM creator_pitches p JOIN creators c ON c.id=p.creator_id
  WHERE p.status='live' AND c.status <> 'blacklisted'`;

export async function livePitch(id) {
  return env.DB.prepare(`${PITCH_SELECT} AND p.id=?`).bind(String(id || "")).first();
}
