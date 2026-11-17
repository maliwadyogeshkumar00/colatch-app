// Messages inside a deal, between the creator, the brand and the Colatch team.
// Creator and brand messages have contact details scrubbed on write (phone, email, @handle, links, UPI id),
// so the deal stays on Colatch. Team messages are stored as written. Read state is kept per reader in deal_reads.
import { env } from './env';
import { scrubContacts } from './guard';
import { notify, teamInbox } from './notify';
import { logError } from './security';

export const MAX_MESSAGE = 2000;
export type Side = 'creator' | 'brand' | 'team';
export type Reader = { kind: Side; id: string };

export class MessageError extends Error {}

const HIDDEN = '[contact hidden by Colatch]';
// UPI ids look like name@bank (no dot after the @, so the email pattern doesn't catch them): ravi.k@okaxis, 98xxxxxx@ybl.
const UPI = /\b[\w.-]{2,64}@(?:ok)?[a-z]{2,20}\b(?!\.[a-z])/gi;
const UPI_WORDS = /\b(?:upi|gpay|google pay|phonepe|paytm)\s*(?:(?:id|no\.?|number)\s*[:\-–]?|[:\-–])\s*[\w.@-]{3,}/gi;

/** scrubContacts plus UPI ids. Returns the safe text and how many things were hidden. */
export function scrubMessage(input: string): { text: string; found: number } {
  const first = scrubContacts(input);
  let found = first.found;
  let text = first.text.replace(UPI, () => { found++; return HIDDEN; });
  text = text.replace(UPI_WORDS, (m) => (m.includes(HIDDEN) ? m : (found++, HIDDEN)));
  text = text.replace(new RegExp(`(?:${HIDDEN.replace(/[[\]]/g, '\\$&')}\\s*){2,}`, 'g'), HIDDEN + ' ');
  return { text: text.trim(), found };
}

/** Trims, drops control characters, keeps at most two blank lines in a row. Throws MessageError when empty or too long. */
export function cleanBody(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!s) throw new MessageError('Write a message first.');
  if (s.length > MAX_MESSAGE) throw new MessageError(`Messages can be up to ${MAX_MESSAGE} characters. This one is ${s.length}.`);
  return s;
}

/** What gets stored: team messages as written, creator/brand messages scrubbed. */
export function prepareBody(raw: unknown, kind: Side): { body: string; scrubbed: boolean } {
  const body = cleanBody(raw);
  if (kind === 'team') return { body, scrubbed: false };
  const s = scrubMessage(body);
  if (!s.text || s.text === HIDDEN) throw new MessageError('Contact details can\'t be shared in deal messages. Write what you need and the Colatch team will help.');
  return { body: s.text, scrubbed: s.found > 0 };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The form carries a one-time id made when the page rendered; a second submit of the same form is a no-op. */
export const messageId = (v: unknown): string => (UUID.test(String(v ?? '')) ? String(v).toLowerCase() : crypto.randomUUID());

export const SENDER_LABEL: Record<Side, string> = { creator: 'Creator', brand: 'Brand', team: 'Colatch team' };

/** The latest messages on a deal, oldest first. */
export async function listMessages(dealId: string, limit = 200, database: any = env.DB) {
  const rows = ((await database.prepare('SELECT * FROM deal_messages WHERE deal_id=? ORDER BY created_at DESC, id DESC LIMIT ?').bind(dealId, limit).all()).results ?? []) as any[];
  return rows.reverse();
}

const notMine = "NOT (m.sender_kind=? AND COALESCE(m.sender_id,'')=?)";

/** Messages from anyone else since this reader last opened the deal. */
export async function unreadCount(dealId: string, reader: Reader, database: any = env.DB): Promise<number> {
  const r = await database.prepare(
    `SELECT COUNT(*) AS n FROM deal_messages m
     LEFT JOIN deal_reads r ON r.deal_id=m.deal_id AND r.reader_kind=? AND r.reader_id=?
     WHERE m.deal_id=? AND ${notMine} AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)`
  ).bind(reader.kind, reader.id, dealId, reader.kind, reader.id).first();
  return Number(r?.n ?? 0);
}

/** Unread counts for every deal of a campaign, for the brand's shortlist page. */
export async function unreadForCampaign(campaignId: string, reader: Reader, database: any = env.DB): Promise<Record<string, number>> {
  const rows = ((await database.prepare(
    `SELECT m.deal_id, COUNT(*) AS n FROM deal_messages m
     JOIN creator_deals d ON d.id=m.deal_id AND d.campaign_id=?
     LEFT JOIN deal_reads r ON r.deal_id=m.deal_id AND r.reader_kind=? AND r.reader_id=?
     WHERE ${notMine} AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
     GROUP BY m.deal_id`
  ).bind(campaignId, reader.kind, reader.id, reader.kind, reader.id).all()).results ?? []) as any[];
  return Object.fromEntries(rows.map((x) => [x.deal_id, Number(x.n)]));
}

/** Messages per deal of a campaign, oldest first, for the brand page (one query for every booked creator). */
export async function messagesForCampaign(campaignId: string, perDeal = 50, database: any = env.DB): Promise<Record<string, any[]>> {
  const rows = ((await database.prepare(
    `SELECT * FROM (SELECT m.*, row_number() OVER (PARTITION BY m.deal_id ORDER BY m.created_at DESC, m.id DESC) AS rn
       FROM deal_messages m JOIN creator_deals d ON d.id=m.deal_id WHERE d.campaign_id=?) x
     WHERE rn <= ? ORDER BY created_at, id`
  ).bind(campaignId, perDeal).all()).results ?? []) as any[];
  const out: Record<string, any[]> = {};
  for (const r of rows) (out[r.deal_id] ||= []).push(r);
  return out;
}

export async function markRead(dealId: string, reader: Reader, database: any = env.DB) {
  await database.prepare(
    `INSERT INTO deal_reads (deal_id, reader_kind, reader_id, last_read_at) VALUES (?,?,?, now())
     ON CONFLICT (deal_id, reader_kind, reader_id) DO UPDATE SET last_read_at = GREATEST(deal_reads.last_read_at, EXCLUDED.last_read_at)`
  ).bind(dealId, reader.kind, reader.id).run();
}

/** Every deal of a campaign marked read for the brand (they saw the whole shortlist page). */
export async function markCampaignRead(campaignId: string, reader: Reader, database: any = env.DB) {
  await database.prepare(
    `INSERT INTO deal_reads (deal_id, reader_kind, reader_id, last_read_at)
     SELECT DISTINCT m.deal_id, ?, ?, now() FROM deal_messages m JOIN creator_deals d ON d.id=m.deal_id WHERE d.campaign_id=?
     ON CONFLICT (deal_id, reader_kind, reader_id) DO UPDATE SET last_read_at = GREATEST(deal_reads.last_read_at, EXCLUDED.last_read_at)`
  ).bind(reader.kind, reader.id, campaignId).run();
}

/**
 * Stores one message. The caller has already checked the sender may post on this deal.
 * `mid` is the form's one-time id: posting the same form twice stores one message (created=false the second time).
 */
export async function postMessage(dealId: string, sender: Reader, raw: unknown, mid?: unknown, database: any = env.DB) {
  const { body, scrubbed } = prepareBody(raw, sender.kind);
  const id = messageId(mid);
  const ins = await database.prepare(
    `INSERT INTO deal_messages (id, deal_id, sender_kind, sender_id, body, scrubbed) VALUES (?,?,?,?,?,?)
     ON CONFLICT (id) DO NOTHING RETURNING id`
  ).bind(id, dealId, sender.kind, sender.id, body, scrubbed).first();
  // Own message: the thread is read up to here for the sender.
  await markRead(dealId, sender, database).catch(() => {});
  return { id, created: Boolean(ins), scrubbed, body };
}

/**
 * Emails the other side(s) that there's a new message, through the notification outbox. The message text is not
 * put in the email: it stays on Colatch. Someone who already has unread messages on this deal isn't emailed again.
 * Never throws.
 */
export async function notifyMessage(dealId: string, messageIdValue: string, sender: Reader, database: any = env.DB) {
  try {
    const d = await database.prepare(
      `SELECT d.id, d.creator_id, d.campaign_id, d.brand, k.title, k.share_token, k.client_email, k.client_name,
              COALESCE(a.email, c.email) AS creator_email, c.name AS creator_name, c.handle
       FROM creator_deals d LEFT JOIN campaigns k ON k.id=d.campaign_id LEFT JOIN creators c ON c.id=d.creator_id
       LEFT JOIN creator_accounts a ON a.creator_id=d.creator_id WHERE d.id=?`
    ).bind(dealId).first();
    if (!d) return;
    const site = (env.SITE_URL || process.env.SITE_URL || 'https://colatch-app.vercel.app').replace(/\/$/, '');
    const title = d.title || d.brand || 'your deal';
    const from = sender.kind === 'team' ? 'The Colatch team' : sender.kind === 'brand' ? 'The brand' : d.creator_name || (d.handle ? `@${d.handle}` : 'The creator');
    const targets: { kind: Side; id: string | null; to: string | null; link: string; name?: string | null }[] = [];
    if (sender.kind !== 'creator' && d.creator_id) targets.push({ kind: 'creator', id: d.creator_id, to: d.creator_email, link: `${site}/creator/deals/${encodeURIComponent(d.id)}`, name: d.creator_name });
    if (sender.kind !== 'brand' && d.campaign_id && d.share_token) targets.push({ kind: 'brand', id: d.campaign_id, to: d.client_email, link: `${site}/shortlist/${encodeURIComponent(d.share_token)}#deal-${d.id}`, name: d.client_name });
    if (sender.kind !== 'team') targets.push({ kind: 'team', id: null, to: teamInbox(), link: `${site}/team/deals/${encodeURIComponent(d.id)}` });
    for (const t of targets) {
      if (!t.to) continue;
      // Already has unread messages from before this one: they were emailed then, so don't email again.
      if (!t.id) {
        // Team inbox: one email per deal per half hour is enough; the team sees every message on the deal page.
        const recent = await database.prepare(
          `SELECT COUNT(*) AS n FROM deal_messages WHERE deal_id=? AND id<>? AND sender_kind<>'team' AND created_at > now() - interval '30 minutes'`
        ).bind(dealId, messageIdValue).first();
        if (Number(recent?.n ?? 0) > 0) continue;
      } else {
        const earlier = await database.prepare(
          `SELECT COUNT(*) AS n FROM deal_messages m LEFT JOIN deal_reads r ON r.deal_id=m.deal_id AND r.reader_kind=? AND r.reader_id=?
           WHERE m.deal_id=? AND m.id<>? AND m.sender_kind<>? AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)`
        ).bind(t.kind, t.id, dealId, messageIdValue, t.kind).first();
        if (Number(earlier?.n ?? 0) > 0) continue;
      }
      await notify({
        template: 'account_alert', to: t.to, toKind: t.kind, toId: t.id,
        payload: { subject: `New message on "${title}"`, text: `Hi ${t.name || 'there'},\n\n${from} sent you a message about "${title}" on Colatch.\n\nRead and reply: ${t.link}\n\nPlease keep all contact on Colatch: phone numbers, emails and handles are hidden in deal messages.` },
        dedupeKey: `deal_message:${messageIdValue}:${t.kind}`,
      });
    }
  } catch (e) {
    await logError('messages/notify', e, { deal: dealId });
  }
}
