/** Trust signals shown to creators on a blind brief, without revealing who the brand is. */
export interface BrandTrust { campaigns: number; paidDeals: number; avgPayDays: number | null; rating: number | null; ratings: number; funded: boolean; onTimePct: number | null; verified: boolean; }

const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|live|icloud|rediffmail|proton(mail)?|aol|ymail|zoho)\./i;

export async function brandTrust(env: Env, k: { id: string; client_email?: string | null; brand?: string | null; funded?: number | null; brand_verified?: number | null }): Promise<BrandTrust> {
  const key = (k.client_email || '').toLowerCase();
  const brand = (k.brand || '').toLowerCase();
  const where = key ? 'lower(k.client_email) = ?' : brand ? 'lower(k.brand) = ?' : 'k.id = ?';
  const arg = key || brand || k.id;
  const row = await env.DB.prepare(
    `SELECT COUNT(DISTINCT k.id) campaigns,
            SUM(CASE WHEN d.pay_status = 'paid' THEN 1 ELSE 0 END) paid,
            AVG(CASE WHEN d.paid_at IS NOT NULL AND d.live_at IS NOT NULL THEN julianday(d.paid_at) - julianday(d.live_at) END) days,
            SUM(CASE WHEN d.paid_at IS NOT NULL AND d.live_at IS NOT NULL THEN 1 ELSE 0 END) timed,
            SUM(CASE WHEN d.paid_at IS NOT NULL AND d.live_at IS NOT NULL AND julianday(d.paid_at) - julianday(d.live_at) <= COALESCE(k.payment_days, 30) THEN 1 ELSE 0 END) ontime
     FROM campaigns k LEFT JOIN creator_deals d ON d.campaign_id = k.id WHERE ${where}`
  ).bind(arg).first<{ campaigns: number; paid: number; days: number | null; timed: number; ontime: number }>().catch(() => null);
  const r = await env.DB.prepare(
    `SELECT AVG(r.stars) a, COUNT(*) n FROM ratings r JOIN creator_deals d ON d.id = r.deal_id JOIN campaigns k ON k.id = d.campaign_id
     WHERE r.by_side = 'creator' AND ${where}`
  ).bind(arg).first<{ a: number | null; n: number }>().catch(() => null);
  return {
    campaigns: row?.campaigns ?? 1, paidDeals: row?.paid ?? 0,
    avgPayDays: row?.days != null ? Math.round(row.days * 10) / 10 : null,
    rating: r?.a != null ? Math.round(r.a * 10) / 10 : null, ratings: r?.n ?? 0, funded: Boolean(k.funded),
    onTimePct: row?.timed ? Math.round((100 * (row.ontime ?? 0)) / row.timed) : null,
    // Verified = checked by the team, or money already in plus a company (non-webmail) email.
    verified: Boolean(k.brand_verified) || (Boolean(k.funded) && !!key && !FREE_MAIL.test(key)),
  };
}

export async function creatorRating(env: Env, creatorId: string): Promise<{ rating: number | null; n: number }> {
  const r = await env.DB.prepare(
    `SELECT AVG(r.stars) a, COUNT(*) n FROM ratings r JOIN creator_deals d ON d.id = r.deal_id WHERE r.by_side = 'brand' AND d.creator_id = ?`
  ).bind(creatorId).first<{ a: number | null; n: number }>().catch(() => null);
  return { rating: r?.a != null ? Math.round(r.a * 10) / 10 : null, n: r?.n ?? 0 };
}

/** "Paid by 13 Dec" for a brief: shoot date (or apply-by date) plus the brief's payment days, in IST. */
export function payByLine(k: { shoot_date?: string | null; deadline?: string | null; payment_days?: number | null }): string {
  const days = Number(k.payment_days ?? 30);
  const base = k.shoot_date || k.deadline;
  const t = base ? Date.parse(String(base).slice(0, 10) + 'T12:00:00+05:30') : NaN;
  if (!Number.isFinite(t)) return `Paid within ${days} days of going live`;
  const d = new Date(t + days * 864e5);
  return 'Paid by ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined, timeZone: 'Asia/Kolkata' });
}

/** True while a brief's paid "Featured" slot is running. */
export function isFeatured(k: { featured_until?: string | null }): boolean {
  if (!k.featured_until) return false;
  const t = Date.parse(String(k.featured_until).replace(' ', 'T') + (String(k.featured_until).length <= 19 && !/Z|[+-]\d\d:?\d\d$/.test(String(k.featured_until)) ? 'Z' : ''));
  return Number.isFinite(t) && t > Date.now();
}

/** What a creator gives up by taking a Colatch deal direct. Shown as the "going direct" panel. */
export function goingDirectLosses(o: { funded?: boolean; fee?: number | null; payDays?: number | null }): { title: string; line: string }[] {
  const money = o.fee ? `₹${Math.round(o.fee).toLocaleString('en-IN')}` : 'Your fee';
  return [
    { title: 'Guaranteed payment', line: o.funded ? `${money} is already sitting with Colatch. Direct, you wait on the brand.` : `${money} is collected from the brand before you start. Direct, nobody does that for you.` },
    { title: 'Colatch Score points', line: 'Up to +5 for going live, +4 for a sign-off and up to +20 from brand stars. Off-platform work earns zero.' },
    { title: 'Public proof', line: 'A brand-verified proof page and a line on your media kit that wins the next deal.' },
    { title: 'Dispute desk', line: 'If anything goes wrong, Colatch decides within 72 hours. Direct, it is your word against theirs.' },
    { title: 'Repeat-brand alerts', line: 'When this brand books again, creators who delivered for them hear first.' },
  ];
}
