// Usage rights per deal: which channels the brand may use the content on, for how many months,
// counted from the day the post went live. Pure helpers first (unit-tested), then the save/sync calls.
import { env } from './env';

export const USAGE_CHANNELS = [
  'Organic repost',
  'Paid ads (Meta)',
  'Paid ads (Google/YouTube)',
  'Website',
  'Email and CRM',
  'Offline and print',
  'Partnership ads (whitelisting)',
] as const;

export const MAX_USAGE_MONTHS = 60;
const DAY = 864e5;

/** A Date from what Postgres or the old SQLite text columns give back ('YYYY-MM-DD HH:MM:SS' is UTC). */
export function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  const iso = /^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d(\.\d+)?)?$/.test(s) ? s.replace(' ', 'T') + 'Z' : /^\d{4}-\d\d-\d\d$/.test(s) ? s + 'T00:00:00Z' : s;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Calendar months later, clamped to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). Works in UTC. */
export function addMonths(start: Date, months: number): Date {
  const d = new Date(start.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** "Organic repost, Paid ads (Meta), Website" -> unique, trimmed list (at most 8, 60 chars each). */
export function parseChannels(text: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? '').split(/[,;\n]+/)) {
    const c = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
    if (out.length >= 8) break;
  }
  return out;
}

/** "a, b and c" for the one-line summary. Paid ads (Meta) reads as "Paid ads on Meta". */
export function channelPhrase(channels: string[]): string {
  const nice = channels.map((c) => c.replace(/^Paid ads \((.+)\)$/i, 'Paid ads on $1'));
  if (nice.length <= 1) return nice[0] || '';
  return `${nice.slice(0, -1).join(', ')} and ${nice[nice.length - 1]}`;
}

/**
 * Best guess from the campaign's free-text usage_rights ("Paid ads on Meta for 3 months + organic repost").
 * Returns the channels found (or the text itself when no known channel matches) and the months, if any.
 */
export function prefillFromText(text: unknown): { channels: string; months: number | null } {
  const s = String(text ?? '').trim();
  if (!s) return { channels: '', months: null };
  const low = s.toLowerCase();
  const found: string[] = [];
  const add = (c: string) => { if (!found.includes(c)) found.push(c); };
  if (/organic|repost|re-post|reshare|collab post/.test(low)) add('Organic repost');
  if (/\bmeta\b|facebook|instagram ads|\bfb\b|paid social|boost/.test(low)) add('Paid ads (Meta)');
  if (/google|youtube|\byt\b/.test(low)) add('Paid ads (Google/YouTube)');
  if (!found.some((f) => f.startsWith('Paid ads')) && /\b(paid|ads?|advert)/.test(low)) add('Paid ads (Meta)');
  if (/website|web site|\bsite\b|landing page|e-?commerce|amazon|flipkart|marketplace/.test(low)) add('Website');
  if (/e-?mail|newsletter|crm|whatsapp/.test(low)) add('Email and CRM');
  if (/print|offline|ooh|hoarding|billboard|in-store|instore|pos\b/.test(low)) add('Offline and print');
  if (/whitelist|white-list|partnership ad|branded content ad|spark ad/.test(low)) add('Partnership ads (whitelisting)');
  let months: number | null = null;
  const m = low.match(/(\d{1,3})\s*(?:-|\s)?\s*(months?|mos?\b|mths?|years?|yrs?)/);
  if (m) {
    const n = Number(m[1]);
    months = /^y/.test(m[2]) ? n * 12 : n;
  } else if (/\b(one|a|1)\s+year\b|annual|12 ?months?/.test(low)) months = 12;
  else if (/\bsix months\b|half[- ]year/.test(low)) months = 6;
  else if (/\bthree months\b|quarter/.test(low)) months = 3;
  if (months != null && (months < 1 || months > MAX_USAGE_MONTHS)) months = null;
  if (/perpetu|forever|lifetime|in perpetuity/.test(low)) months = null;
  return { channels: found.length ? found.join(', ') : s.slice(0, 200), months };
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export type UsageRow = {
  usage_channels?: string | null; usage_months?: number | string | null;
  usage_starts_at?: unknown; usage_expires_at?: unknown; live_at?: unknown;
};

export type UsageStatus = {
  state: 'none' | 'pending' | 'active' | 'expired';
  channels: string[];
  months: number | null;
  starts: Date | null;
  expires: Date | null;
  /** Whole days until expiry (0 = expires today); negative once expired. */
  daysLeft: number | null;
  line: string;
};

/**
 * Where a deal's usage rights stand right now. The start falls back to the live date when the team saved the
 * rights before the post went live, so the expiry is right even before syncUsageStart() has stored it.
 */
export function usageStatus(d: UsageRow, now: Date = new Date()): UsageStatus {
  const channels = parseChannels(d.usage_channels);
  const monthsN = Number(d.usage_months);
  const months = Number.isInteger(monthsN) && monthsN > 0 ? monthsN : null;
  if (!channels.length) return { state: 'none', channels, months, starts: null, expires: null, daysLeft: null, line: '' };
  const what = channelPhrase(channels);
  const starts = toDate(d.usage_starts_at) || toDate(d.live_at);
  const expires = toDate(d.usage_expires_at) || (starts && months ? addMonths(starts, months) : null);
  if (!months && !expires) return { state: 'active', channels, months, starts, expires: null, daysLeft: null, line: `Usage rights: ${what}, no end date set` };
  if (!expires) {
    return { state: 'pending', channels, months, starts, expires: null, daysLeft: null, line: `Usage rights: ${what} for ${months} ${months === 1 ? 'month' : 'months'} from the day the post goes live` };
  }
  // Days counted on India calendar dates, so "until 12 Mar" on 11 Mar reads "1 day left" whatever the hour.
  const ist = (x: Date) => Math.floor((x.getTime() + 5.5 * 36e5) / DAY);
  const daysLeft = ist(expires) - ist(now);
  if (expires.getTime() <= now.getTime()) {
    const ago = Math.max(0, -daysLeft);
    return { state: 'expired', channels, months, starts, expires, daysLeft: -ago, line: `Usage rights: ${what} expired on ${fmtDate(expires)} (${ago === 0 ? 'today' : `${ago} ${ago === 1 ? 'day' : 'days'} ago`})` };
  }
  const left = daysLeft <= 0 ? 'ends today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  return { state: 'active', channels, months, starts, expires, daysLeft, line: `Usage rights: ${what} until ${fmtDate(expires)} (${left})` };
}

export class UsageError extends Error {}

/** Checks the team form. starts is an optional 'YYYY-MM-DD' (India date); empty means "from the live date". */
export function cleanUsage(input: { channels?: unknown; months?: unknown; starts?: unknown }, liveAt?: unknown):
  { channels: string; months: number; starts: Date | null; expires: Date | null } {
  const list = parseChannels(input.channels);
  if (!list.length) throw new UsageError('Add at least one channel, for example "Organic repost, Paid ads (Meta)".');
  const m = Number(String(input.months ?? '').trim());
  if (!Number.isInteger(m) || m < 1 || m > MAX_USAGE_MONTHS) throw new UsageError(`Months must be a whole number from 1 to ${MAX_USAGE_MONTHS}.`);
  const st = String(input.starts ?? '').trim();
  let starts: Date | null = null;
  if (st) {
    if (!/^\d{4}-\d\d-\d\d$/.test(st)) throw new UsageError('Start date must be a date.');
    // Midnight in India on that date.
    starts = new Date(`${st}T00:00:00+05:30`);
    if (isNaN(starts.getTime())) throw new UsageError('Start date must be a date.');
  } else starts = toDate(liveAt);
  return { channels: list.join(', '), months: m, starts, expires: starts ? addMonths(starts, m) : null };
}

/** Saves the usage rights on a deal and returns the stored row's usage fields. */
export async function saveUsage(dealId: string, input: { channels?: unknown; months?: unknown; starts?: unknown }, database: any = env.DB) {
  const d = await database.prepare('SELECT id, live_at FROM creator_deals WHERE id=?').bind(dealId).first();
  if (!d) throw new UsageError('That deal does not exist.');
  const u = cleanUsage(input, d.live_at);
  await database.prepare('UPDATE creator_deals SET usage_channels=?, usage_months=?, usage_starts_at=?, usage_expires_at=? WHERE id=?')
    .bind(u.channels, u.months, u.starts ? u.starts.toISOString() : null, u.expires ? u.expires.toISOString() : null, dealId).run();
  return database.prepare('SELECT usage_channels, usage_months, usage_starts_at, usage_expires_at, live_at FROM creator_deals WHERE id=?').bind(dealId).first();
}

/**
 * Rights saved before the post went live start on the live date. Stores that once the deal is live,
 * so reports and reminders can read usage_expires_at directly. Safe to call on every page view.
 */
export async function syncUsageStart(d: any, database: any = env.DB): Promise<boolean> {
  if (!d || !d.live_at || d.usage_starts_at || !d.usage_channels) return false;
  const months = Number(d.usage_months);
  const starts = toDate(d.live_at);
  if (!starts || !Number.isInteger(months) || months < 1) return false;
  const expires = addMonths(starts, months);
  const r = await database.prepare('UPDATE creator_deals SET usage_starts_at=?, usage_expires_at=? WHERE id=? AND usage_starts_at IS NULL AND live_at IS NOT NULL')
    .bind(starts.toISOString(), expires.toISOString(), d.id).run();
  if (r.meta?.changes) { d.usage_starts_at = starts; d.usage_expires_at = expires; }
  return Boolean(r.meta?.changes);
}
