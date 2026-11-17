// Outgoing webhooks: Zapier, Make, Slack, a CRM or any HTTPS endpoint can follow deal and campaign events.
//
// How it works:
//  - Owners/admins add a hook at /team/integrations (https only, never a private or internal host).
//  - emit(event, payload) writes one webhook_deliveries row per active hook that wants the event, then tries
//    to deliver each one straight away (5 second timeout). It never throws: a webhook problem must not break
//    the action that caused the event.
//  - Failed deliveries stay 'pending' and the cron job (/api/net/cron) retries them on a backoff schedule;
//    after MAX_ATTEMPTS they are marked 'failed'.
//  - Every request is signed: X-Colatch-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>
//    with the hook's secret. Receivers recompute it and reject old timestamps.
//  - Payloads carry ids, stage names, amounts in paise and timestamps. Never names, emails or phone numbers.
//
// Delivery ids for real events are derived from (hook, event, entity key), so the same event can be emitted
// twice (live and by the catch-up sweep) and is still delivered once.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { env } from './env';
import { logError } from './security';

export const EVENTS = [
  'deal.created', 'deal.stage_changed', 'draft.submitted', 'draft.approved',
  'post.live', 'payout.sent', 'application.created', 'campaign.created',
] as const;
export type WebhookEvent = (typeof EVENTS)[number];

export const EVENT_LABEL: Record<WebhookEvent, string> = {
  'deal.created': 'Deal created',
  'deal.stage_changed': 'Deal stage changed',
  'draft.submitted': 'Draft submitted',
  'draft.approved': 'Draft approved (by the brand or automatically)',
  'post.live': 'Live post verified',
  'payout.sent': 'Creator payout sent',
  'application.created': 'Creator applied to a brief',
  'campaign.created': 'Brief received',
};

export const MAX_ATTEMPTS = 6;
/** When attempt n (1-based) is due, in minutes after the delivery was created. Attempt 1 is immediate. */
export const BACKOFF_MINUTES = [0, 5, 30, 120, 360, 1440];
export const TIMEOUT_MS = 5000;
export const SIGNATURE_TOLERANCE_S = 300;

// ------------------------------------------------------------------ pure helpers (unit-tested)

export function isEvent(e: unknown): e is WebhookEvent {
  return (EVENTS as readonly string[]).includes(String(e));
}

/** The events a hook row subscribes to (stored comma-separated), keeping only known ones. */
export function parseEvents(s: unknown): WebhookEvent[] {
  const out: WebhookEvent[] = [];
  for (const x of String(s ?? '').split(',').map((v) => v.trim())) if (isEvent(x) && !out.includes(x)) out.push(x);
  return out;
}

export function matches(hookEvents: unknown, event: string): boolean {
  return parseEvents(hookEvents).includes(event as WebhookEvent);
}

/**
 * When the next attempt is due, given how many attempts were already made. Null once all are used.
 * Offsets are from the delivery's creation time, so a missed cron run never stretches the schedule.
 */
export function nextAttemptAt(createdAt: Date | string, attemptsMade: number): Date | null {
  if (attemptsMade >= MAX_ATTEMPTS) return null;
  const base = createdAt instanceof Date ? createdAt.getTime() : Date.parse(String(createdAt));
  if (!Number.isFinite(base)) return null;
  return new Date(base + BACKOFF_MINUTES[Math.max(0, attemptsMade)] * 60_000);
}

export function signature(secret: string, body: string, t: number): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

/** What a receiver does. Exported so tests (and anyone writing a receiver) can check the scheme. */
export function verifySignature(secret: string, body: string, header: string, nowS = Math.floor(Date.now() / 1000)): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(header || ''));
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false;
  const want = Buffer.from(signature(secret, body, t).split('v1=')[1], 'hex');
  const got = Buffer.from(m[2], 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}

export function newSecret(): string {
  return 'whsec_' + randomBytes(24).toString('hex');
}

/** Stable id for an event delivery, so emitting the same event twice is harmless. */
export function deliveryId(hookId: string, event: string, key: string): string {
  return 'wd_' + createHash('sha256').update(`${hookId}|${event}|${key}`).digest('hex').slice(0, 32);
}

/**
 * Private, loopback, link-local, CGNAT and multicast addresses. Same ranges as the SSRF guard in lib/guard.js
 * (used by the website decoder), copied rather than imported because that file pulls in next/server, which the
 * Node test bundles can't load; IPv6 is checked more fully here.
 */
export function privateIp(ip: string): boolean {
  const v = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
  const m4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (m4) {
    const [a, b] = [Number(m4[1]), Number(m4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (!v.includes(':')) return false;
  return v === '::1' || v === '::' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith('::ffff:') || v.startsWith('64:ff9b:') || v.startsWith('2001:db8');
}

/**
 * Shape check for a hook URL without any network: https, no credentials, standard port, a public-looking
 * host name. Returns the normalised URL or throws an Error with a message for the form.
 * The DNS check (no private addresses behind the name) is done by checkUrl().
 */
export function checkUrlShape(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) throw new Error('Paste the address your tool gave you (it starts with https://).');
  if (s.length > 500) throw new Error('That address is too long.');
  let u: URL;
  try { u = new URL(s); } catch { throw new Error('That is not a valid web address.'); }
  if (u.protocol !== 'https:') throw new Error('Only https:// addresses are allowed, so event data is encrypted in transit.');
  if (u.username || u.password) throw new Error('Remove the user name and password from the address.');
  if (u.port && u.port !== '443') throw new Error('Only the standard https port (443) is allowed.');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host === 'localhost' || /\.(local|internal|localhost|lan|home|corp|intranet)$/.test(host)) throw new Error('Use a public address, not a local or internal one.');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && privateIp(host)) throw new Error('Use a public address, not a private network one.');
  if (host.startsWith('[')) throw new Error('Use a host name, not an IPv6 address.');
  u.hash = '';
  return u.toString();
}

// ------------------------------------------------------------------ network checks

/** Shape check plus DNS: every address the name resolves to must be public (blocks DNS names pointing inside). */
export async function checkUrl(raw: unknown): Promise<string> {
  const url = checkUrlShape(raw);
  const host = new URL(url).hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return url;
  const { lookup } = await import('dns/promises');
  let addrs: { address: string }[] = [];
  try { addrs = await lookup(host, { all: true }); } catch { throw new Error(`We couldn't find ${host}. Check the address.`); }
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('Use a public address, not a private network one.');
  return url;
}

/** ISO time from a Date, an ISO string, or the app's 'YYYY-MM-DD HH:MM:SS' UTC text columns. */
export function iso(t: unknown): string {
  if (t instanceof Date) return Number.isFinite(t.getTime()) ? t.toISOString() : new Date().toISOString();
  const s = String(t ?? '').trim();
  if (!s) return new Date().toISOString();
  const x = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? Date.parse(s.replace(' ', 'T') + 'Z') : Date.parse(s);
  return Number.isFinite(x) ? new Date(x).toISOString() : s;
}

/** One HTTP attempt. Never follows redirects (a redirect could point inside our network). */
async function post(row: { id: string; event: string; created_at: any; payload: any; url: string; secret: string }): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  let url: string;
  try { url = await checkUrl(row.url); } catch (e: any) { return { ok: false, status: null, error: `Blocked: ${String(e?.message || e).slice(0, 160)}` }; }
  const data = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {};
  const body = JSON.stringify({ id: row.id, event: row.event, created_at: iso(row.created_at), data });
  const t = Math.floor(Date.now() / 1000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Colatch-Webhooks/1.0',
        'x-colatch-event': row.event,
        'x-colatch-delivery': row.id,
        'x-colatch-signature': signature(row.secret, body, t),
      },
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit);
    await r.body?.cancel().catch(() => {});
    if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status, error: null };
    if (r.status >= 300 && r.status < 400) return { ok: false, status: r.status, error: `HTTP ${r.status}: redirects are not followed, use the final address` };
    return { ok: false, status: r.status, error: `HTTP ${r.status}` };
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? `No answer within ${TIMEOUT_MS / 1000} seconds` : String(e?.cause?.code || e?.message || e);
    return { ok: false, status: null, error: msg.slice(0, 200) };
  }
}

/**
 * Try one pending delivery. The attempt is claimed first (attempts must still match), so a cron run and a live
 * emit can never send the same attempt twice. Returns the delivery's status afterwards.
 */
export async function deliver(id: string): Promise<string> {
  try {
    const row = await env.DB.prepare(
      'SELECT d.id, d.event, d.payload, d.status, d.attempts, d.created_at, w.url, w.secret, w.active FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE d.id = ?'
    ).bind(id).first();
    if (!row) return 'missing';
    if (row.status !== 'pending') return row.status;
    if (!row.active) {
      await env.DB.prepare("UPDATE webhook_deliveries SET status='failed', last_error='Webhook is disabled' WHERE id=? AND status='pending'").bind(id).run();
      return 'failed';
    }
    const claim = await env.DB.prepare(
      "UPDATE webhook_deliveries SET attempts = attempts + 1 WHERE id = ? AND status = 'pending' AND attempts = ? RETURNING attempts, webhook_id"
    ).bind(id, Number(row.attempts)).first();
    if (!claim) return 'pending';
    const res = await post(row);
    const made = Number(claim.attempts);
    if (res.ok) {
      await env.DB.prepare("UPDATE webhook_deliveries SET status='delivered', delivered_at=now(), last_error=NULL WHERE id=?").bind(id).run();
    } else {
      await env.DB.prepare('UPDATE webhook_deliveries SET status=?, last_error=? WHERE id=?')
        .bind(made >= MAX_ATTEMPTS ? 'failed' : 'pending', res.error, id).run();
    }
    await env.DB.prepare('UPDATE webhooks SET last_status=?, last_at=now() WHERE id=?').bind(res.status ?? 0, claim.webhook_id).run();
    return res.ok ? 'delivered' : made >= MAX_ATTEMPTS ? 'failed' : 'pending';
  } catch (e) {
    await logError('webhooks/deliver', e, { id });
    return 'error';
  }
}

/**
 * Record an event for every active hook that wants it and try to deliver now. Never throws.
 * `key` identifies the event (e.g. the deal id); the same key twice for the same hook is ignored.
 */
export async function emit(event: WebhookEvent, payload: Record<string, unknown>, opts: { key?: string; entityAt?: unknown } = {}): Promise<number> {
  try {
    if (!isEvent(event)) return 0;
    const hooks = (await env.DB.prepare('SELECT id, events, created_at FROM webhooks WHERE active = TRUE').all()).results ?? [];
    // The catch-up sweep passes when the thing happened: a hook added later doesn't get older events.
    const at = opts.entityAt == null ? null : Date.parse(iso(opts.entityAt));
    const ids: string[] = [];
    for (const h of hooks) {
      if (!matches(h.events, event)) continue;
      // Text timestamps have whole seconds, so compare at that precision.
      if (at != null && Number.isFinite(at) && Math.floor(new Date(h.created_at).getTime() / 1000) * 1000 > at) continue;
      const id = opts.key ? deliveryId(h.id, event, opts.key) : 'wd_' + crypto.randomUUID().replace(/-/g, '');
      const r = await env.DB.prepare('INSERT INTO webhook_deliveries (id, webhook_id, event, payload) VALUES (?,?,?,?) ON CONFLICT (id) DO NOTHING RETURNING id')
        .bind(id, h.id, event, JSON.stringify(payload ?? {})).first();
      if (r) ids.push(id);
    }
    await Promise.all(ids.map((id) => deliver(id)));
    return ids.length;
  } catch (e) {
    await logError('webhooks/emit', e, { event });
    return 0;
  }
}

/** Send a signed test event to one hook now. Test deliveries are not retried. */
export async function sendTest(hookId: string): Promise<{ status: string; error: string | null }> {
  const id = 'wd_' + crypto.randomUUID().replace(/-/g, '');
  await env.DB.prepare('INSERT INTO webhook_deliveries (id, webhook_id, event, payload) VALUES (?,?,?,?)')
    .bind(id, hookId, 'ping', JSON.stringify({ message: 'Test event from Colatch Connect. Your endpoint is reachable and the signature can be checked.', webhook_id: hookId })).run();
  const status = await deliver(id);
  if (status !== 'delivered') await env.DB.prepare("UPDATE webhook_deliveries SET status='failed' WHERE id=? AND status='pending'").bind(id).run();
  const row = await env.DB.prepare('SELECT status, last_error FROM webhook_deliveries WHERE id=?').bind(id).first();
  return { status: row?.status || status, error: row?.last_error || null };
}

/** Cron: retry pending deliveries whose next attempt is due. Stops early to stay inside the function time limit. */
export async function retryDue(now = new Date(), budgetMs = 40_000): Promise<{ tried: number; delivered: number; failed: number }> {
  const started = Date.now();
  const rows = (await env.DB.prepare("SELECT id, attempts, created_at FROM webhook_deliveries WHERE status = 'pending' ORDER BY created_at ASC LIMIT 300").all()).results ?? [];
  let tried = 0, delivered = 0, failed = 0;
  for (const r of rows) {
    if (Date.now() - started > budgetMs) break;
    const due = nextAttemptAt(r.created_at, Number(r.attempts));
    if (!due) {
      await env.DB.prepare("UPDATE webhook_deliveries SET status='failed', last_error=COALESCE(last_error, 'Out of attempts') WHERE id=? AND status='pending'").bind(r.id).run();
      failed++;
      continue;
    }
    if (due.getTime() > now.getTime()) continue;
    tried++;
    const s = await deliver(r.id);
    if (s === 'delivered') delivered++;
    else if (s === 'failed') failed++;
  }
  return { tried, delivered, failed };
}

// ------------------------------------------------------------------ event payloads (no personal contact data)

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const ts = (v: unknown) => (v == null || v === '' ? null : iso(v));

export function dealPayload(d: any): Record<string, unknown> {
  return {
    deal_id: d.id,
    campaign_id: d.campaign_id ?? null,
    creator_id: d.creator_id ?? null,
    stage: d.stage ?? null,
    pay_status: d.pay_status ?? null,
    draft_status: d.draft_status ?? null,
    fee_paise: d.fee == null ? null : Math.round(Number(d.fee) * 100),
    brand_paid_paise: num(d.brand_paid_paise),
    go_live_date: d.go_live_date ?? null,
    live_at: ts(d.live_at),
    created_at: ts(d.created_at),
    updated_at: ts(d.updated_at),
  };
}

/** After a deal step commits (called from the deal state machine). Never throws. */
export async function emitDealStep(step: string, beforeStage: string | null, d: any): Promise<void> {
  try {
    if (!d?.id) return;
    const base = dealPayload(d);
    const at = String(d.updated_at || '');
    if (beforeStage && d.stage && beforeStage !== d.stage) {
      await emit('deal.stage_changed', { ...base, from_stage: beforeStage, to_stage: d.stage, step }, { key: `${d.id}:${beforeStage}>${d.stage}:${at}` });
    }
    if (step === 'submit_draft') await emit('draft.submitted', { ...base, draft_submitted_at: ts(d.draft_submitted_at) }, { key: `${d.id}:${at}` });
    if (step === 'approve_draft' || step === 'auto_approve') await emit('draft.approved', { ...base, auto_approved: step === 'auto_approve' }, { key: `${d.id}:${at}` });
    if (step === 'verify_live') await emit('post.live', { ...base, post_url: d.post_url ?? null }, { key: d.id });
    if (step === 'record_payout') {
      const l = await env.DB.prepare("SELECT amount_paise, tds_paise, at FROM finance_ledger WHERE deal_id = ? AND kind = 'creator_payout_sent'").bind(d.id).first();
      await emit('payout.sent', { ...base, amount_paise: num(l?.amount_paise), tds_paise: num(l?.tds_paise), paid_at: ts(d.paid_at) }, { key: d.id });
    }
  } catch (e) {
    await logError('webhooks/deal_step', e, { step, deal: d?.id });
  }
}

async function dealCreated(dealId: string) {
  const d = await env.DB.prepare('SELECT * FROM creator_deals WHERE id = ?').bind(dealId).first();
  if (d) await emit('deal.created', dealPayload(d), { key: d.id });
}
async function applicationCreated(appId: string) {
  const a = await env.DB.prepare('SELECT id, campaign_id, creator_id, status, match_score, rate_quote, created_at FROM campaign_applications WHERE id = ?').bind(appId).first();
  if (a) await emit('application.created', applicationPayload(a), { key: a.id });
}
const applicationPayload = (a: any) => ({
  application_id: a.id, campaign_id: a.campaign_id, creator_id: a.creator_id ?? null, status: a.status,
  match_score: num(a.match_score), rate_quote_paise: a.rate_quote == null ? null : Math.round(Number(a.rate_quote) * 100), created_at: ts(a.created_at),
});
const campaignPayload = (k: any) => ({
  campaign_id: k.id, status: k.status, source: k.source, pay_type: k.pay_type ?? null,
  budget_total_paise: k.budget_total == null ? null : Math.round(Number(k.budget_total) * 100),
  creators_needed: num(k.creators_needed), deadline: k.deadline ?? null, created_at: ts(k.created_at),
});

/**
 * Audit rows written outside a transaction become events here (wired in security.audit()).
 * Only a few actions map to events; everything else returns immediately without touching the database.
 */
export async function emitFromAudit(action: string, entityId: string | null | undefined): Promise<void> {
  try {
    if (!entityId) return;
    if (action === 'deal.create') await dealCreated(entityId);
    else if (action === 'application.create') await applicationCreated(entityId);
  } catch (e) {
    await logError('webhooks/audit', e, { action });
  }
}

const textTs = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);

/**
 * Cron catch-up for "created" events that happen inside transactions or in code paths without an audit row
 * (brand approvals on the shortlist page, new briefs). Looks back at most 3 days, never before a hook existed,
 * and uses the same delivery ids as live emits, so nothing is sent twice.
 */
export async function sweepCreated(now = new Date()): Promise<number> {
  const hooks = (await env.DB.prepare('SELECT id, events, created_at FROM webhooks WHERE active = TRUE').all()).results ?? [];
  if (!hooks.length) return 0;
  const want = (e: WebhookEvent) => hooks.filter((h: any) => matches(h.events, e));
  const floor = (hs: any[]) => {
    const oldest = Math.min(...hs.map((h) => new Date(h.created_at).getTime()));
    return textTs(new Date(Math.max(oldest, now.getTime() - 3 * 864e5)));
  };
  let n = 0;
  const camp = want('campaign.created');
  if (camp.length) {
    const rows = (await env.DB.prepare('SELECT id, status, source, pay_type, budget_total, creators_needed, deadline, created_at FROM campaigns WHERE created_at >= ? ORDER BY created_at LIMIT 200').bind(floor(camp)).all()).results ?? [];
    for (const k of rows) n += await emit('campaign.created', campaignPayload(k), { key: k.id, entityAt: k.created_at });
  }
  const deals = want('deal.created');
  if (deals.length) {
    const rows = (await env.DB.prepare('SELECT * FROM creator_deals WHERE created_at >= ? ORDER BY created_at LIMIT 200').bind(floor(deals)).all()).results ?? [];
    for (const d of rows) n += await emit('deal.created', dealPayload(d), { key: d.id, entityAt: d.created_at });
  }
  const apps = want('application.created');
  if (apps.length) {
    const rows = (await env.DB.prepare('SELECT id, campaign_id, creator_id, status, match_score, rate_quote, created_at FROM campaign_applications WHERE created_at >= ? ORDER BY created_at LIMIT 200').bind(floor(apps)).all()).results ?? [];
    for (const a of rows) n += await emit('application.created', applicationPayload(a), { key: a.id, entityAt: a.created_at });
  }
  return n;
}
