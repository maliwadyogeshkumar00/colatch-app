// Disputes on a deal. Anyone on the deal (creator, brand, Colatch team) can raise one; the team
// resolves it with a written outcome. A dispute never moves money: if money must move, the
// resolution points finance to the deal room's cancel/refund steps, which go through the ledger.
import { env } from './env';
import { audit, can } from './security';
import { notify, teamInbox } from './notify';
import { scrubContacts } from './guard';

export const REASONS: Record<string, string> = {
  quality: 'Work quality', late: 'Late or missed deadline', payment: 'Payment', terms: 'Terms not followed', conduct: 'Conduct', other: 'Something else',
};

export class DisputeError extends Error {
  constructor(message: string, public code: 'not_found' | 'forbidden' | 'invalid_input' | 'duplicate' | 'invalid_state' = 'invalid_input') { super(message); }
}

export type DisputeActor =
  | { kind: 'creator'; id: string /* creators.id */ }
  | { kind: 'brand'; id: string /* campaigns.id of the share link */ }
  | { kind: 'team'; id: string; role: string };

export async function raiseDispute(dealId: string, actor: DisputeActor, reason: string, detail: string, database: any = env.DB) {
  const d = await database.prepare('SELECT d.id, d.creator_id, d.campaign_id, d.brand, k.title FROM creator_deals d LEFT JOIN campaigns k ON k.id = d.campaign_id WHERE d.id = ?').bind(String(dealId || '')).first();
  if (!d) throw new DisputeError('That deal does not exist.', 'not_found');
  const allowed = actor.kind === 'creator' ? d.creator_id === actor.id
    : actor.kind === 'brand' ? !!d.campaign_id && d.campaign_id === actor.id
    : can(actor.role, 'shortlist');
  if (!allowed) throw new DisputeError("You can't raise a dispute on this deal.", 'forbidden');
  if (!REASONS[reason]) throw new DisputeError('Choose what the dispute is about.');
  const text = scrubContacts(String(detail || '').trim()).text.slice(0, 2000);
  if (text.length < 10) throw new DisputeError('Describe what went wrong in a sentence or two (at least 10 characters).');
  const id = crypto.randomUUID();
  try {
    await database.prepare('INSERT INTO disputes (id, deal_id, raised_by_kind, raised_by_id, reason, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, d.id, actor.kind, actor.id, reason, text).run();
  } catch (e: any) {
    if (e?.code === '23505') throw new DisputeError('You already have an open dispute on this deal. The Colatch team will reply there.', 'duplicate');
    throw e;
  }
  await audit({ kind: actor.kind, id: actor.id }, 'dispute.raised', 'deal', d.id, { dispute: id, reason }, database);
  const by = actor.kind === 'creator' ? 'The creator' : actor.kind === 'brand' ? 'The brand' : 'A team member';
  await notify({ template: 'dispute_opened', to: teamInbox(), toKind: 'team', payload: { title: d.title || d.brand || 'a deal', by, reason: REASONS[reason], detail: text }, dedupeKey: `dispute:${id}` })
    .catch(() => null);
  return id;
}

export async function resolveDispute(id: string, member: { id?: string; email: string; role: string }, outcome: string, resolution: string, database: any = env.DB) {
  if (!can(member.role, 'shortlist')) throw new DisputeError("Your role can't resolve disputes.", 'forbidden');
  if (outcome !== 'resolved' && outcome !== 'rejected') throw new DisputeError('Choose an outcome.');
  const text = String(resolution || '').trim().slice(0, 2000);
  if (text.length < 10) throw new DisputeError('Write the outcome the parties will read (at least 10 characters).');
  const r = await database.prepare("UPDATE disputes SET status = ?, resolution = ?, resolved_by = ?, resolved_at = now() WHERE id = ? AND status = 'open' RETURNING id, deal_id, raised_by_kind, raised_by_id")
    .bind(outcome, text, member.email, String(id || '')).first();
  if (!r) throw new DisputeError('This dispute is already closed, or does not exist.', 'invalid_state');
  await audit({ kind: 'team', id: member.email }, `dispute.${outcome}`, 'deal', r.deal_id, { dispute: r.id }, database);
  const d = await database.prepare('SELECT d.brand, d.creator_id, k.title, k.client_email, k.client_name FROM creator_deals d LEFT JOIN campaigns k ON k.id = d.campaign_id WHERE d.id = ?').bind(r.deal_id).first();
  let to: string | null = null, name: string | null = null;
  if (r.raised_by_kind === 'creator') {
    const c = await database.prepare('SELECT c.name, a.email FROM creators c LEFT JOIN creator_accounts a ON a.creator_id = c.id WHERE c.id = ?').bind(r.raised_by_id).first();
    to = c?.email || null; name = c?.name || null;
  } else if (r.raised_by_kind === 'brand') {
    to = d?.client_email || null; name = d?.client_name || null;
  }
  if (to) await notify({ template: 'dispute_resolved', to, toKind: r.raised_by_kind, toId: r.raised_by_id, payload: { title: d?.title || d?.brand || 'your deal', outcome, resolution: text, name }, dedupeKey: `dispute-done:${r.id}` }).catch(() => null);
  return r;
}

/** Open dispute raised by this side on a deal, or null. */
export async function openDispute(dealId: string, side: 'creator' | 'brand' | 'team') {
  return env.DB.prepare("SELECT id, reason, detail, created_at FROM disputes WHERE deal_id = ? AND raised_by_kind = ? AND status = 'open'").bind(dealId, side).first();
}

/** Latest closed dispute for this side, so the raiser can read the outcome. */
export async function lastClosedDispute(dealId: string, side: 'creator' | 'brand') {
  return env.DB.prepare("SELECT id, status, resolution, resolved_at FROM disputes WHERE deal_id = ? AND raised_by_kind = ? AND status <> 'open' ORDER BY resolved_at DESC LIMIT 1").bind(dealId, side).first();
}
