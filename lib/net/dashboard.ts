// Team home dashboard: read-only aggregates and the pure helpers that turn rows into charts,
// a day clock and one "needs you" list. Every figure comes from the database; nothing is estimated.
// Times: the database mixes 'YYYY-MM-DD HH:MM:SS' (UTC text), ISO strings, Date objects and date-only
// 'YYYY-MM-DD' values. Date-only values are calendar days in India (no time of day is invented for them).

export const IST_MS = 5.5 * 36e5;
const DAY = 864e5;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type When = { t: number; allDay: boolean };

/** Parse any stored time. Date-only values become midnight IST of that day, flagged allDay. */
export function parseWhen(v: unknown): When | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? { t: v.getTime(), allDay: false } : null;
  const s = String(v).trim();
  let t: number;
  // Postgres text output of a timestamptz ('2026-11-17 03:06:00+00') isn't a format Date.parse accepts.
  const pgz = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})(?::?(\d{2}))?$/);
  if (pgz) { t = Date.parse(`${pgz[1]}T${pgz[2]}${pgz[3]}:${pgz[4] || '00'}`); return Number.isFinite(t) ? { t, allDay: false } : null; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { t: Date.parse(`${s}T00:00:00+05:30`), allDay: true };
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) t = Date.parse(s.replace(' ', 'T') + 'Z');
  else t = Date.parse(s);
  return Number.isFinite(t) ? { t, allDay: false } : null;
}

/** Calendar parts of an instant in India time. */
export function ist(t: number) {
  const d = new Date(t + IST_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes(), key: d.toISOString().slice(0, 10) };
}
/** Midnight IST of the day containing t, as a UTC instant. */
export const istDayStart = (t: number) => { const p = ist(t); return Date.UTC(p.y, p.m, p.d) - IST_MS; };

export function greeting(t: number) {
  const h = ist(t).h;
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
/** "Tue, 17 Nov 2026" */
export function longDay(t: number) { const p = ist(t); return `${WD[p.wd]}, ${p.d} ${MON[p.m]} ${p.y}`; }
/** "Tue 17 Nov" */
export function shortDay(t: number) { const p = ist(t); return `${WD[p.wd]} ${p.d} ${MON[p.m]}`; }
/** "4:30 PM" in IST */
export function clockText(t: number) {
  const p = ist(t); const h12 = p.h % 12 || 12;
  return `${h12}:${String(p.min).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}
/** "5m", "3h", "2d", "6w" since t. */
export function ageText(t: number | null, now: number) {
  if (t == null) return '—';
  const s = Math.max(0, now - t) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)}d`;
  return `${Math.round(s / 86400 / 7)}w`;
}

/** Rupees split for a big figure: ₹4.2 Cr → {num:'4.2', unit:'Cr'}, ₹38.5 L, below a lakh in full Indian grouping. */
export function inrParts(n: number): { num: string; unit: string } {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  const trim = (x: number) => String(Number(x.toFixed(x >= 100 ? 0 : 1)));
  if (a >= 1e7) return { num: trim(a / 1e7), unit: 'Cr' };
  if (a >= 1e5) return { num: trim(a / 1e5), unit: 'L' };
  return { num: a.toLocaleString('en-IN'), unit: '' };
}
/** "₹4.2 Cr", "₹38.5 L", "₹47,080" */
export function inrShort(n: number) { const p = inrParts(n); return `₹${p.num}${p.unit ? ' ' + p.unit : ''}`; }

// ------------------------------------------------------------------ series

/** The last `n` IST calendar months ending with the current one, each with a total. */
export function monthSeries(rows: { at: unknown; amount: number }[], now: number, n = 12) {
  const p = ist(now);
  const out = Array.from({ length: n }, (_, i) => {
    const m = (p.m - (n - 1 - i) + 120) % 12; const y = p.y + Math.floor((p.m - (n - 1 - i)) / 12);
    return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: MON[m], year: y, total: 0 };
  });
  const prior = { total: 0 };
  const idx = new Map(out.map((b, i) => [b.key, i]));
  const firstKey = out[0].key;
  for (const r of rows) {
    const w = parseWhen(r.at); if (!w) continue;
    const q = ist(w.t); const key = `${q.y}-${String(q.m + 1).padStart(2, '0')}`;
    const i = idx.get(key);
    if (i != null) out[i].total += Number(r.amount) || 0;
    else if (key < firstKey) prior.total += Number(r.amount) || 0;
  }
  return { months: out, total: out.reduce((a, b) => a + b.total, 0), priorTotal: prior.total };
}

/** Counts per 7-day week, oldest first, the last bucket ending now. */
export function weekSeries(times: unknown[], now: number, n = 12) {
  const out = new Array(n).fill(0);
  for (const v of times) {
    const w = parseWhen(v); if (!w) continue;
    const ago = Math.floor((now - w.t) / (7 * DAY));
    if (ago >= 0 && ago < n) out[n - 1 - ago]++;
  }
  return out;
}

// ------------------------------------------------------------------ deal stages

export const STAGE_GROUPS = [
  { key: 'terms', label: 'Terms', steps: ['edit_terms', 'accept_terms'] },
  { key: 'paid', label: 'Brand to pay', steps: ['record_funding'] },
  { key: 'draft', label: 'Draft', steps: ['submit_draft', 'approve_draft'] },
  { key: 'live', label: 'Going live', steps: ['submit_live_link', 'verify_live'] },
  { key: 'payout', label: 'Payout', steps: ['approve_payout', 'record_payout'] },
] as const;

export function stageGroups(moves: ({ step: string } | null)[]) {
  return STAGE_GROUPS.map((g) => ({ key: g.key, label: g.label, n: moves.filter((m) => m && (g.steps as readonly string[]).includes(m.step)).length }));
}

// ------------------------------------------------------------------ events (day clock and week list)

export type DashEvent = { t: number; allDay: boolean; kind: 'live' | 'draft' | 'pay' | 'shoot' | 'brief'; title: string; sub: string; href: string };
export const EVENT_TAG: Record<DashEvent['kind'], string> = { live: 'Go live', draft: 'Draft', pay: 'Payout', shoot: 'Shoot', brief: 'Shortlist' };

/**
 * Everything dated in [from, to): go-live dates, draft deadlines (go-live minus the reminder window),
 * draft auto-approve times, payouts ready (today), campaign shoot dates and shortlist deadlines.
 */
export function buildEvents(o: {
  openDeals: any[]; toPay: any[]; drafts: any[]; owed: any[]; shoots: any[]; from: number; to: number; now: number; draftDueDays?: number;
}): DashEvent[] {
  const ev: DashEvent[] = [];
  const nameOf = (d: any) => d.name || (d.handle ? '@' + d.handle : 'Creator');
  const inWin = (t: number) => t >= o.from && t < o.to;
  const dueDays = o.draftDueDays ?? 2;
  for (const d of o.openDeals) {
    const g = parseWhen(d.go_live_date);
    if (!g) continue;
    if (!d.live_at && !d.post_url && inWin(g.t)) ev.push({ t: g.t, allDay: g.allDay, kind: 'live', title: `${nameOf(d)} × ${d.brand || 'brand'} goes live`, sub: d.deliverable || 'Post due', href: `/team/deals/${d.id}` });
    const due = g.t - dueDays * DAY;
    if (d.sow_accepted_at && d.pay_status !== 'unfunded' && ['none', 'changes'].includes(d.draft_status) && inWin(due))
      ev.push({ t: due, allDay: g.allDay, kind: 'draft', title: `Draft due · ${nameOf(d)}`, sub: `${d.brand || 'Brand'} · ${dueDays} days before go-live`, href: `/team/deals/${d.id}` });
  }
  for (const d of o.drafts) {
    const a = parseWhen(d.auto_approve_at);
    if (a && inWin(a.t)) ev.push({ t: a.t, allDay: false, kind: 'draft', title: `Draft auto-approves · ${nameOf(d)}`, sub: `${d.brand || 'Brand'} hasn't reviewed it yet`, href: `/team/deals/${d.id}` });
  }
  const today = istDayStart(o.now);
  if (inWin(today)) for (const d of o.toPay) ev.push({ t: today, allDay: true, kind: 'pay', title: `Payout · ${nameOf(d)}`, sub: `${d.brand || 'Brand'} · ${d.pay_status === 'released' ? 'approved, send it' : 'post verified, approve it'}`, href: `/team/deals/${d.id}` });
  for (const k of o.shoots) {
    const s = parseWhen(k.shoot_date);
    if (s && inWin(s.t)) ev.push({ t: s.t, allDay: s.allDay, kind: 'shoot', title: `Shoot · ${k.title}`, sub: k.client_company || k.brand || 'Campaign', href: `/team/campaigns/${k.id}` });
  }
  for (const w of o.owed) {
    const s = parseWhen(w.shortlist_due);
    if (s && inWin(s.t)) ev.push({ t: s.t, allDay: s.allDay, kind: 'brief', title: `Shortlist due · ${w.title}`, sub: w.client_company || w.brand || 'Brand', href: `/team/campaigns/${w.id}` });
  }
  return ev.sort((a, b) => a.t - b.t || Number(b.allDay) - Number(a.allDay));
}

/** Position on the 8 AM–11 PM clock, 0–100. */
export const CLOCK_FROM = 8, CLOCK_TO = 23;
export function clockPct(t: number) {
  const p = ist(t); const h = p.h + p.min / 60;
  return Math.min(100, Math.max(0, ((h - CLOCK_FROM) / (CLOCK_TO - CLOCK_FROM)) * 100));
}

// ------------------------------------------------------------------ the money figure

/**
 * Creator fees due to move today: payouts ready to send or approve, plus posts going live today.
 * When today has none, the same for the next 7 days (posts going live this week), labelled as a week.
 */
export function moneyMoving(o: { toPay: any[]; openDeals: any[]; now: number }) {
  const start = istDayStart(o.now);
  const payIds = new Set(o.toPay.map((d) => d.id));
  const pay = o.toPay.reduce((a, d) => a + (Number(d.fee) || 0), 0);
  const goingLive = (to: number) => o.openDeals.filter((d) => {
    if (payIds.has(d.id) || d.live_at || d.post_url) return false;
    const g = parseWhen(d.go_live_date); return g != null && g.t >= start && g.t < to;
  });
  const today = goingLive(start + DAY);
  const dayTotal = pay + today.reduce((a, d) => a + (Number(d.fee) || 0), 0);
  if (dayTotal > 0) return { span: 'day' as const, total: dayTotal, payN: o.toPay.length, liveN: today.length };
  const week = goingLive(start + 7 * DAY);
  const weekTotal = week.reduce((a, d) => a + (Number(d.fee) || 0), 0);
  if (weekTotal > 0) return { span: 'week' as const, total: weekTotal, payN: 0, liveN: week.length };
  return { span: 'none' as const, total: 0, payN: 0, liveN: 0 };
}

/** The deal to look at first: the biggest fee going live in the next 7 days, else the biggest open fee. */
export function dealOfDay(openDeals: any[], now: number) {
  const start = istDayStart(now);
  const withFee = openDeals.filter((d) => Number(d.fee) > 0);
  const soon = withFee.filter((d) => { const g = parseWhen(d.go_live_date); return g && g.t >= start && g.t < start + 7 * DAY; });
  const pool = soon.length ? soon : withFee;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => Number(b.fee) - Number(a.fee))[0];
}

// ------------------------------------------------------------------ one "needs you" list

export type NeedType = 'payout' | 'verify' | 'unpaid' | 'draft' | 'applicants' | 'late' | 'owed' | 'pitch';
export type Need = { type: NeedType; label: string; what: string; whatHref: string; sub: string; next: string; amount: number | null; since: number | null; action: string; rank: number; key: string };
export const NEED_LABEL: Record<NeedType, string> = {
  payout: 'Payout', verify: 'Live post', unpaid: 'Unpaid brand', draft: 'Draft', applicants: 'Applicants', late: 'Shortlist late', owed: 'Shortlist owed', pitch: 'Pitch request',
};
const RANK: Record<NeedType, number> = { late: 0, payout: 1, verify: 2, unpaid: 3, draft: 4, applicants: 5, owed: 6, pitch: 7 };

export function buildNeeds(o: { toPay: any[]; toVerify: any[]; unfunded: any[]; drafts: any[]; newApps: any[]; owed: any[]; pitchReqs: any[]; now: number; fmt: (iso: string) => string }): Need[] {
  const nameOf = (d: any) => d.name || (d.handle ? '@' + d.handle : 'Creator');
  const T = (v: unknown) => parseWhen(v)?.t ?? null;
  const out: Need[] = [];
  const add = (type: NeedType, n: Omit<Need, 'type' | 'label' | 'rank'>) => out.push({ type, label: NEED_LABEL[type], rank: RANK[type], ...n });
  for (const d of o.toPay) add('payout', { key: `p-${d.id}`, what: `${nameOf(d)} × ${d.brand || 'brand'}`, whatHref: `/team/deals/${d.id}`, sub: d.deliverable || '', next: d.pay_status === 'released' ? 'Payout approved: send it, then record the UTR' : 'Post verified: approve the payout', amount: Number(d.fee) || null, since: T(d.updated_at), action: d.pay_status === 'released' ? 'Send' : 'Approve' });
  for (const d of o.toVerify) add('verify', { key: `v-${d.id}`, what: `${nameOf(d)} × ${d.brand || 'brand'}`, whatHref: `/team/deals/${d.id}`, sub: d.deliverable || '', next: 'Check the post against the brief, then verify', amount: Number(d.fee) || null, since: T(d.updated_at), action: 'Verify' });
  for (const d of o.unfunded) add('unpaid', { key: `u-${d.id}`, what: `${nameOf(d)} × ${d.brand || 'brand'}`, whatHref: `/team/deals/${d.id}`, sub: 'Terms accepted', next: 'Collect the brand payment before the creator shoots', amount: Number(d.fee) || null, since: T(d.sow_accepted_at), action: 'Chase' });
  for (const d of o.drafts) add('draft', { key: `d-${d.id}`, what: `${nameOf(d)} × ${d.brand || 'brand'}`, whatHref: `/team/deals/${d.id}`, sub: d.deliverable || '', next: d.auto_approve_at ? `Brand to review · auto-approves ${o.fmt(String(d.auto_approve_at))}` : 'Brand to review the draft', amount: Number(d.fee) || null, since: T(d.draft_submitted_at) ?? T(d.updated_at), action: 'Review' });
  for (const a of o.newApps) add('applicants', { key: `a-${a.id}`, what: a.title, whatHref: `/team/campaigns/${a.id}`, sub: 'Campaign', next: `${a.n} new ${Number(a.n) === 1 ? 'applicant' : 'applicants'} to review`, amount: null, since: T(a.oldest), action: 'Review' });
  for (const w of o.owed) {
    const late = w.shortlist_due && (T(w.shortlist_due) ?? Infinity) < o.now;
    add(late ? 'late' : 'owed', { key: `s-${w.id}`, what: w.title, whatHref: `/team/campaigns/${w.id}`, sub: `${w.client_company || w.brand || 'Brand'} · ${w.status === 'pending' ? 'needs approval' : 'open'}`, next: w.shortlist_due ? `${late ? 'Was due' : 'Due'} ${o.fmt(String(w.shortlist_due))}` : 'No deadline set', amount: null, since: T(w.created_at), action: 'Shortlist' });
  }
  for (const r of o.pitchReqs) add('pitch', { key: `r-${r.id}`, what: r.title, whatHref: `/team/campaigns/${r.id}`, sub: `${r.client_company || 'Brand'} wants this idea`, next: `Confirm the creator's dates${r.shortlist_due ? ` · due ${o.fmt(String(r.shortlist_due))}` : ''}`, amount: Number(r.budget_total) || null, since: null, action: 'Confirm' });
  // Most urgent kind first; inside a kind, the oldest waiting first.
  return out.sort((a, b) => a.rank - b.rank || (a.since ?? Infinity) - (b.since ?? Infinity));
}

// ------------------------------------------------------------------ queries (read-only)

type DB = { prepare: (s: string) => { bind: (...b: any[]) => { all: () => Promise<{ results?: any[] }> } } };

/** The extra rows the dashboard needs beyond what the page already loads. Each query fails soft to an empty list. */
export async function loadDashboard(db: DB, now: number) {
  const many = async (sql: string, ...b: any[]) => ((await db.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results ?? []);
  const utc = (t: number) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
  const start = istDayStart(now);
  const day = (t: number) => ist(t).key;
  const [booked, signups, ledger, shoots] = await Promise.all([
    // Fees booked: the creator fee on every deal whose terms were accepted, by month of acceptance (24 months, for the change).
    many(`SELECT sow_accepted_at AS at, fee AS amount FROM creator_deals
      WHERE sow_accepted_at IS NOT NULL AND sow_accepted_at <> '' AND fee > 0 AND stage NOT IN ('cancelled','dropped') AND pay_status <> 'refunded'
        AND sow_accepted_at >= ?`, utc(now - 750 * DAY).slice(0, 10)),
    // New creators per week, 12 weeks.
    many(`SELECT created_at FROM creators WHERE created_at >= ? AND status <> 'blacklisted'`, utc(now - 85 * DAY)),
    // Money in motion: the latest ledger rows with who they were for.
    many(`SELECT l.at::text AS at, l.kind, l.amount_paise, l.deal_id, d.brand, c.name, c.handle, k.title AS ctitle, k.client_company
      FROM finance_ledger l LEFT JOIN creator_deals d ON d.id = l.deal_id LEFT JOIN creators c ON c.id = d.creator_id
      LEFT JOIN campaigns k ON k.id = COALESCE(l.campaign_id, d.campaign_id) ORDER BY l.at DESC LIMIT 6`),
    // Campaign shoot dates in the next 7 days.
    many(`SELECT id, title, brand, client_company, shoot_date FROM campaigns
      WHERE status IN ('open','pending') AND shoot_date IS NOT NULL AND shoot_date >= ? AND shoot_date <= ? ORDER BY shoot_date LIMIT 40`, day(start), day(start + 7 * DAY)),
  ]);
  return { booked, signups, ledger, shoots };
}

export const LEDGER_LABEL: Record<string, string> = {
  brand_payment_received: 'Brand paid', creator_payout_sent: 'Payout sent', brand_refund_sent: 'Refund sent', referral_payout_sent: 'Referral paid', adjustment: 'Adjustment',
};
