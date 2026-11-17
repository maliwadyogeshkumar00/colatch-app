// Scheduled jobs, run by Vercel Cron through GET /api/net/cron (see vercel.json and README).
//
// Each job is idempotent (running it twice in a row does nothing the second time), records its last run in
// cron_runs, and is isolated: one job throwing never stops the others.
//
//  auto_approve      drafts whose review window passed are approved through the deal state machine
//                    (the same applyAutoApprove the deal page uses), so it is checked, logged and happens once
//  reminders         brand hasn't paid after accepting terms, draft due soon, post due, payout approved but not sent
//  usage_expiry      usage rights ending in 14 days, and on the day they end
//  webhook_retries   pending webhook deliveries retried on their backoff schedule
//  webhook_catchup   "created" events that happen inside transactions or without an audit row are emitted
//
// Reminders use a key per reminder (reminders_sent) and the same key as the notification dedupe key,
// so a reminder is sent once even if two cron runs overlap.
import { env } from './env';
import { logError } from './security';
import { notify, teamInbox, type Template } from './notify';
import { inr } from './creators';

export const JOB_NAMES = ['auto_approve', 'reminders', 'usage_expiry', 'webhook_retries', 'webhook_catchup'] as const;
export type JobName = (typeof JOB_NAMES)[number];
export const JOB_LABEL: Record<JobName, string> = {
  auto_approve: 'Draft auto-approve',
  reminders: 'Reminders (payment, drafts, posts, payouts)',
  usage_expiry: 'Usage-rights expiry alerts',
  webhook_retries: 'Webhook retries',
  webhook_catchup: 'Webhook catch-up for new briefs, deals, applications',
};

const DAY = 864e5;

export type ReminderCfg = { unpaidDays: number; draftDueDays: number; payoutStuckDays: number; usageWarnDays: number; staleDays: number };
export function reminderCfg(): ReminderCfg {
  const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  return {
    unpaidDays: n('REMINDER_UNPAID_DAYS', 3),
    draftDueDays: n('REMINDER_DRAFT_DUE_DAYS', 2),
    payoutStuckDays: 3,
    usageWarnDays: 14,
    // Nothing older than this is reminded about, so switching the job on doesn't flood inboxes with old deals.
    staleDays: 14,
  };
}

/** Parse the app's mixed time columns: 'YYYY-MM-DD HH:MM:SS' (UTC text), ISO strings, Dates, and 'YYYY-MM-DD' dates (midnight IST). */
export function parseTime(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  const s = String(v).trim();
  let t: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) t = Date.parse(`${s}T00:00:00+05:30`);
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) t = Date.parse(s.replace(' ', 'T') + 'Z');
  else t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
const dayKey = (v: unknown) => { const t = parseTime(v); return t == null ? 'none' : new Date(t).toISOString().slice(0, 10); };

export type ReminderKind = 'unpaid' | 'draft_due' | 'post_due' | 'payout_stuck' | 'usage_14d' | 'usage_0d';

/** The dedupe key for one reminder. The date in it means a changed go-live or expiry date can be reminded again. */
export function reminderKey(kind: ReminderKind, d: { id: string; sow_accepted_at?: unknown; go_live_date?: unknown; usage_expires_at?: unknown; released_at?: unknown }): string {
  switch (kind) {
    case 'unpaid': return `unpaid:${d.id}:${dayKey(d.sow_accepted_at)}`;
    case 'draft_due': return `draft_due:${d.id}:${dayKey(d.go_live_date)}`;
    case 'post_due': return `post_due:${d.id}:${dayKey(d.go_live_date)}`;
    case 'payout_stuck': return `payout_stuck:${d.id}:${dayKey(d.released_at)}`;
    case 'usage_14d': return `usage_14d:${d.id}:${dayKey(d.usage_expires_at)}`;
    case 'usage_0d': return `usage_0d:${d.id}:${dayKey(d.usage_expires_at)}`;
  }
}

const isClosed = (d: any) => d.stage === 'cancelled' || d.pay_status === 'refunded';

/** Pure: which reminders a deal row is due for right now (dedupe is applied by the caller). */
export function remindersFor(d: any, now = new Date(), cfg: ReminderCfg = reminderCfg()): ReminderKind[] {
  const out: ReminderKind[] = [];
  const t = now.getTime();
  if (isClosed(d)) return out;
  const sow = parseTime(d.sow_accepted_at);
  if (sow != null && d.pay_status === 'unfunded' && t - sow >= cfg.unpaidDays * DAY && t - sow <= (cfg.unpaidDays + cfg.staleDays) * DAY) out.push('unpaid');
  const live = parseTime(d.go_live_date);
  if (live != null) {
    const until = live - t;
    if (sow != null && d.pay_status !== 'unfunded' && ['none', 'changes'].includes(d.draft_status) && until <= cfg.draftDueDays * DAY && until >= -cfg.staleDays * DAY) out.push('draft_due');
    if (d.draft_status === 'approved' && !d.live_at && !d.post_url && until <= 0 && until >= -cfg.staleDays * DAY) out.push('post_due');
  }
  const rel = parseTime(d.released_at);
  if (d.pay_status === 'released' && rel != null && t - rel >= cfg.payoutStuckDays * DAY) out.push('payout_stuck');
  const exp = parseTime(d.usage_expires_at);
  if (exp != null) {
    const until = exp - t;
    if (until > 0 && until <= cfg.usageWarnDays * DAY) out.push('usage_14d');
    else if (until <= 0 && until >= -7 * DAY) out.push('usage_0d');
  }
  return out;
}

// ------------------------------------------------------------------ run bookkeeping

export type JobResult = { job: JobName; ok: boolean; result: string; ms: number };

async function record(job: JobName, result: string) {
  await env.DB.prepare(
    'INSERT INTO cron_runs (job, last_run_at, last_result) VALUES (?, now(), ?) ON CONFLICT (job) DO UPDATE SET last_run_at = now(), last_result = EXCLUDED.last_result'
  ).bind(job, result.slice(0, 500)).run();
}

export async function runJob(job: JobName, fn: () => Promise<string>): Promise<JobResult> {
  const t0 = Date.now();
  let ok = true, result: string;
  try {
    result = await fn();
  } catch (e: any) {
    ok = false;
    result = `error: ${String(e?.message || e).slice(0, 300)}`;
    await logError(`cron/${job}`, e);
  }
  try { await record(job, result); } catch (e) { await logError('cron/record', e, { job }); }
  return { job, ok, result, ms: Date.now() - t0 };
}

// ------------------------------------------------------------------ jobs

/** Limits the deal jobs to some deals. Only tests use it (other test files share the database). The cron route never passes it. */
export type Scope = { dealIds?: string[] };
const inScope = (s: Scope) => (d: any) => !s.dealIds || s.dealIds.includes(d.id);


/** a. Overdue drafts: the same function the deal page calls when someone opens the deal. */
export async function autoApproveDue(now = new Date(), scope: Scope = {}): Promise<string> {
  const { applyAutoApprove } = await import('./deal');
  const rows = (await env.DB.prepare("SELECT * FROM creator_deals WHERE draft_status = 'submitted' AND auto_approve_at IS NOT NULL AND stage <> 'cancelled' LIMIT 500").all()).results ?? [];
  const due = rows.filter(inScope(scope)).filter((d: any) => { const t = parseTime(d.auto_approve_at); return t != null && t <= now.getTime(); });
  let n = 0;
  for (const d of due) if (await applyAutoApprove(env, d)) n++;
  return `${n} of ${due.length} overdue drafts approved`;
}

type Ctx = { creator: { name?: string; email?: string } | null; campaign: { title?: string; client_email?: string; client_name?: string; share_token?: string } | null };
async function context(d: any, cache: Map<string, Ctx>): Promise<Ctx> {
  if (cache.has(d.id)) return cache.get(d.id)!;
  const creator = d.creator_id ? await env.DB.prepare('SELECT c.name, a.email FROM creators c LEFT JOIN creator_accounts a ON a.creator_id = c.id WHERE c.id = ?').bind(d.creator_id).first() : null;
  const campaign = d.campaign_id ? await env.DB.prepare('SELECT title, client_email, client_name, share_token FROM campaigns WHERE id = ?').bind(d.campaign_id).first() : null;
  const ctx = { creator, campaign };
  cache.set(d.id, ctx);
  return ctx;
}

/** Send one reminder to its recipients once. Returns true when it was new. */
async function sendOnce(key: string, sends: { template: Template; to: string | null | undefined; toKind: 'creator' | 'brand' | 'team'; toId?: string | null; payload: Record<string, any> }[]): Promise<boolean> {
  const seen = await env.DB.prepare('SELECT key FROM reminders_sent WHERE key = ?').bind(key).first();
  if (seen) return false;
  // notify() dedupes on the same key, so an overlapping run can't double-send between these two steps.
  // A brand is only written to when it has its campaign link (the reminder points there).
  for (const s of sends) if (s.toKind !== 'brand' || s.payload.token) await notify({ ...s, dedupeKey: `${key}:${s.toKind}` });
  const r = await env.DB.prepare('INSERT INTO reminders_sent (key) VALUES (?) ON CONFLICT (key) DO NOTHING RETURNING key').bind(key).first();
  return Boolean(r);
}

const daysAgo = (v: unknown, now: Date) => { const t = parseTime(v); return t == null ? 0 : Math.max(0, Math.floor((now.getTime() - t) / DAY)); };
const fmtDay = (v: unknown) => { const t = parseTime(v); return t == null ? '' : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }); };

/** b. Reminders on open deals. */
export async function sendReminders(now = new Date(), scope: Scope = {}): Promise<string> {
  const cfg = reminderCfg();
  const rows = ((await env.DB.prepare(
    `SELECT d.id, d.creator_id, d.campaign_id, d.brand, d.stage, d.pay_status, d.draft_status, d.sow_accepted_at, d.go_live_date, d.live_at, d.post_url, d.fee,
       (SELECT MAX(e.created_at) FROM deal_events e WHERE e.deal_id = d.id AND e.kind = 'released') AS released_at
     FROM creator_deals d
     WHERE d.stage <> 'cancelled' AND d.pay_status IN ('unfunded','funded','released')
     ORDER BY d.updated_at DESC LIMIT 2000`
  ).all()).results ?? []).filter(inScope(scope));
  const cache = new Map<string, Ctx>();
  const counts: Record<string, number> = { unpaid: 0, draft_due: 0, post_due: 0, payout_stuck: 0 };
  for (const d of rows) {
    const kinds = remindersFor({ ...d, usage_expires_at: null }, now, cfg);
    for (const kind of kinds) {
      const { creator, campaign } = await context(d, cache);
      const title = campaign?.title || d.brand || 'your campaign';
      const base = { title, dealId: d.id };
      let sends: Parameters<typeof sendOnce>[1] = [];
      if (kind === 'unpaid') {
        const days = daysAgo(d.sow_accepted_at, now);
        sends = [
          { template: 'reminder_brand_unpaid', to: campaign?.client_email, toKind: 'brand', payload: { ...base, name: campaign?.client_name, days, token: campaign?.share_token } },
          { template: 'reminder_brand_unpaid_team', to: teamInbox(), toKind: 'team', payload: { ...base, creator: creator?.name || 'The creator', days } },
        ];
      } else if (kind === 'draft_due') {
        sends = [{ template: 'reminder_draft_due', to: creator?.email, toKind: 'creator', toId: d.creator_id, payload: { ...base, name: creator?.name, due: fmtDay(d.go_live_date) } }];
      } else if (kind === 'post_due') {
        sends = [{ template: 'reminder_post_due', to: creator?.email, toKind: 'creator', toId: d.creator_id, payload: { ...base, name: creator?.name, due: fmtDay(d.go_live_date) } }];
      } else if (kind === 'payout_stuck') {
        sends = [{ template: 'reminder_payout_stuck', to: teamInbox(), toKind: 'team', payload: { ...base, creator: creator?.name || 'A creator', days: daysAgo(d.released_at, now), amount: inr(Number(d.fee || 0)) } }];
      } else continue;
      if (await sendOnce(reminderKey(kind, d), sends)) counts[kind]++;
    }
  }
  return `checked ${rows.length} deals; sent ${counts.unpaid} unpaid, ${counts.draft_due} draft due, ${counts.post_due} post due, ${counts.payout_stuck} payout stuck`;
}

/** c. Usage rights ending in 14 days, and on the day they end: team inbox and the brand contact. */
export async function usageExpiry(now = new Date(), scope: Scope = {}): Promise<string> {
  const rows = ((await env.DB.prepare(
    `SELECT id, creator_id, campaign_id, brand, stage, pay_status, usage_expires_at, usage_channels FROM creator_deals
     WHERE usage_expires_at IS NOT NULL AND stage <> 'cancelled' AND usage_expires_at > now() - interval '7 days' AND usage_expires_at <= now() + interval '14 days'
     LIMIT 2000`
  ).all()).results ?? []).filter(inScope(scope));
  const cache = new Map<string, Ctx>();
  let warned = 0, ended = 0;
  for (const d of rows) {
    const kinds = remindersFor({ id: d.id, stage: d.stage, pay_status: d.pay_status, usage_expires_at: d.usage_expires_at }, now).filter((k) => k === 'usage_14d' || k === 'usage_0d');
    for (const kind of kinds) {
      const { creator, campaign } = await context(d, cache);
      const exp = parseTime(d.usage_expires_at)!;
      const payload = { title: campaign?.title || d.brand || 'your campaign', dealId: d.id, creator: creator?.name || 'the creator', expires: fmtDay(d.usage_expires_at), days: Math.max(0, Math.ceil((exp - now.getTime()) / DAY)), channels: d.usage_channels || null, token: campaign?.share_token, name: campaign?.client_name };
      const template: Template = kind === 'usage_14d' ? 'usage_expiring' : 'usage_expired';
      const sent = await sendOnce(reminderKey(kind, d), [
        { template, to: teamInbox(), toKind: 'team', payload: { ...payload, team: true } },
        { template, to: campaign?.client_email, toKind: 'brand', payload },
      ]);
      if (sent) kind === 'usage_14d' ? warned++ : ended++;
    }
  }
  return `checked ${rows.length} deals; ${warned} expiring soon, ${ended} expired`;
}

/** d. Webhook retries. */
export async function webhookRetries(now = new Date()): Promise<string> {
  const { retryDue } = await import('./webhooks');
  const r = await retryDue(now);
  return `${r.tried} retried, ${r.delivered} delivered, ${r.failed} gave up`;
}

export async function webhookCatchup(now = new Date()): Promise<string> {
  const { sweepCreated } = await import('./webhooks');
  return `${await sweepCreated(now)} new deliveries`;
}

/** Everything, in order. Never throws; each job's outcome is in the result and in cron_runs. */
export async function runAll(now = new Date(), scope: Scope = {}): Promise<JobResult[]> {
  const out: JobResult[] = [];
  out.push(await runJob('auto_approve', () => autoApproveDue(now, scope)));
  out.push(await runJob('reminders', () => sendReminders(now, scope)));
  out.push(await runJob('usage_expiry', () => usageExpiry(now, scope)));
  out.push(await runJob('webhook_catchup', () => webhookCatchup(now)));
  out.push(await runJob('webhook_retries', () => webhookRetries(now)));
  return out;
}
