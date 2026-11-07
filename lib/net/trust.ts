/** Trust signals shown to creators on a blind brief, without revealing who the brand is. */
export interface BrandTrust { campaigns: number; paidDeals: number; avgPayDays: number | null; rating: number | null; ratings: number; funded: boolean; }

export async function brandTrust(env: Env, k: { id: string; client_email?: string | null; brand?: string | null; funded?: number | null }): Promise<BrandTrust> {
  const key = (k.client_email || '').toLowerCase();
  const brand = (k.brand || '').toLowerCase();
  const where = key ? 'lower(k.client_email) = ?' : brand ? 'lower(k.brand) = ?' : 'k.id = ?';
  const arg = key || brand || k.id;
  const row = await env.DB.prepare(
    `SELECT COUNT(DISTINCT k.id) campaigns,
            SUM(CASE WHEN d.pay_status = 'paid' THEN 1 ELSE 0 END) paid,
            AVG(CASE WHEN d.paid_at IS NOT NULL AND d.live_at IS NOT NULL THEN julianday(d.paid_at) - julianday(d.live_at) END) days
     FROM campaigns k LEFT JOIN creator_deals d ON d.campaign_id = k.id WHERE ${where}`
  ).bind(arg).first<{ campaigns: number; paid: number; days: number | null }>().catch(() => null);
  const r = await env.DB.prepare(
    `SELECT AVG(r.stars) a, COUNT(*) n FROM ratings r JOIN creator_deals d ON d.id = r.deal_id JOIN campaigns k ON k.id = d.campaign_id
     WHERE r.by_side = 'creator' AND ${where}`
  ).bind(arg).first<{ a: number | null; n: number }>().catch(() => null);
  return {
    campaigns: row?.campaigns ?? 1, paidDeals: row?.paid ?? 0,
    avgPayDays: row?.days != null ? Math.round(row.days * 10) / 10 : null,
    rating: r?.a != null ? Math.round(r.a * 10) / 10 : null, ratings: r?.n ?? 0, funded: Boolean(k.funded),
  };
}

export async function creatorRating(env: Env, creatorId: string): Promise<{ rating: number | null; n: number }> {
  const r = await env.DB.prepare(
    `SELECT AVG(r.stars) a, COUNT(*) n FROM ratings r JOIN creator_deals d ON d.id = r.deal_id WHERE r.by_side = 'brand' AND d.creator_id = ?`
  ).bind(creatorId).first<{ a: number | null; n: number }>().catch(() => null);
  return { rating: r?.a != null ? Math.round(r.a * 10) / 10 : null, n: r?.n ?? 0 };
}
