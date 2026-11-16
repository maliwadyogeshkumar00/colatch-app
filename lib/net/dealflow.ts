// The deal state machine. Every change to a deal's progress or money goes through `transition()`.
//
// Why: a deal used to be changed by scattered UPDATE statements with no checks, so a deal could be
// marked paid without being funded, paid twice, or approved twice. Here each step:
//   1. locks the deal row (SELECT ... FOR UPDATE) inside one transaction,
//   2. checks the step is allowed from the deal's current state and by this kind of user,
//   3. writes the change, a deal_events row, an audit_log row and (for money) an append-only
//      finance_ledger row with an idempotency key,
//   4. commits, then sends notifications (a notification failure never undoes the step).
//
// Money is recorded, never moved: "funded" and "paid" mean a team member with the finance role
// confirmed a real bank transfer and typed its reference. Nothing here talks to a bank.
import { env } from './env';
import { audit, logError } from './security';
import { notify, teamInbox } from './notify';
import { scrubContacts } from './guard';
import { inr } from './creators';

export type Actor =
  | { kind: 'team'; id: string; role: string }
  | { kind: 'creator'; id: string /* creators.id */ }
  | { kind: 'brand'; id: string /* campaigns.id the share link belongs to */ }
  | { kind: 'system'; id: 'system' };

export type Step =
  | 'accept_terms' | 'edit_terms' | 'record_funding' | 'submit_draft' | 'request_changes' | 'approve_draft'
  | 'submit_live_link' | 'verify_live' | 'approve_payout' | 'record_payout' | 'brand_signoff' | 'cancel'
  | 'record_refund' | 'save_results' | 'auto_approve';

export class FlowError extends Error {
  constructor(message: string, public code: 'not_found' | 'forbidden' | 'invalid_state' | 'invalid_input' | 'duplicate' = 'invalid_state') { super(message); }
}

/** Rupees (as typed or stored, may include decimals) to integer paise. Rejects junk instead of guessing. */
export function toPaise(rupees: unknown): number | null {
  if (rupees === null || rupees === undefined || rupees === '') return null;
  const s = String(rupees).replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const p = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(p) ? p : null;
}
export const paiseToRupees = (p: number) => p / 100;
export const formatPaise = (p: number | null | undefined) => (p == null ? '—' : inr(Math.round(p) / 100));

const TEAM_PERM: Partial<Record<Step, 'shortlist' | 'finance' | 'owner_admin'>> = {
  edit_terms: 'shortlist', request_changes: 'shortlist', approve_draft: 'shortlist', verify_live: 'shortlist', save_results: 'shortlist',
  record_funding: 'finance', approve_payout: 'finance', record_payout: 'finance', record_refund: 'finance',
  cancel: 'owner_admin',
};
const CREATOR_STEPS: Step[] = ['accept_terms', 'submit_draft', 'submit_live_link'];
const BRAND_STEPS: Step[] = ['request_changes', 'approve_draft', 'brand_signoff'];

function allowedActor(step: Step, a: Actor, d: any): boolean {
  if (step === 'auto_approve') return a.kind === 'system';
  if (a.kind === 'creator') return CREATOR_STEPS.includes(step) && d.creator_id === a.id;
  if (a.kind === 'brand') return BRAND_STEPS.includes(step) && !!d.campaign_id && d.campaign_id === a.id;
  if (a.kind === 'team') {
    const need = TEAM_PERM[step];
    if (!need) return false;
    const r = a.role;
    if (need === 'owner_admin') return r === 'owner' || r === 'admin';
    if (need === 'finance') return r === 'owner' || r === 'admin' || r === 'finance';
    return r === 'owner' || r === 'admin' || r === 'shortlist';
  }
  return false;
}

const closed = (d: any) => d.stage === 'cancelled' || d.pay_status === 'refunded';

type Input = Record<string, any>;
type Effect = { set: Record<string, any>; event: { kind: string; note?: string | null }; ledger?: any; after?: (d: any) => Promise<void> };

/** Pure check of one step against a deal row. Returns the change to make, or throws FlowError. */
export function plan(step: Step, d: any, input: Input, now = new Date()): Effect {
  const req = (cond: any, msg: string) => { if (!cond) throw new FlowError(msg); };
  switch (step) {
    case 'accept_terms':
      req(!closed(d), 'This deal was cancelled.');
      req(!d.sow_accepted_at, 'You already accepted these terms.');
      return { set: { sow_accepted_at: '@now' }, event: { kind: 'sow', note: 'Accepted the deal terms' } };

    case 'edit_terms': {
      req(!closed(d), 'This deal was cancelled.');
      req(d.pay_status === 'unfunded', 'Terms are locked once the brand has paid. Cancel and refund instead, or add a note.');
      const fee = input.fee == null || input.fee === '' ? null : Number(input.fee);
      if (fee != null) req(Number.isInteger(fee) && fee > 0 && fee < 1e8, 'Fee must be a whole number of rupees above zero.');
      const rev = input.revisions_included == null || input.revisions_included === '' ? d.revisions_included : Number(input.revisions_included);
      req(Number.isInteger(rev) && rev >= 0 && rev <= 10, 'Revision rounds must be 0 to 10.');
      return {
        set: { brand: input.brand ?? d.brand, deliverable: input.deliverable ?? d.deliverable, fee: fee ?? d.fee, expected_views: input.expected_views ?? d.expected_views, revisions_included: rev, go_live_date: input.go_live_date ?? d.go_live_date, sow_accepted_at: fee != null && fee !== d.fee ? null : d.sow_accepted_at },
        event: { kind: 'note', note: fee != null && fee !== d.fee ? `Terms updated; fee changed to ${inr(fee)}, so the creator must accept again` : 'Terms updated' },
      };
    }

    case 'record_funding': {
      req(!closed(d), 'This deal was cancelled.');
      req(d.pay_status === 'unfunded', 'Payment for this deal is already recorded.');
      req(Number(d.fee) > 0, 'Set the creator fee before recording the brand payment.');
      const amount = toPaise(input.amount);
      req(amount && amount > 0, 'Enter the amount received, in rupees.');
      const ref = String(input.reference || '').trim();
      req(ref.length >= 4, 'Enter the bank reference (UTR) of the brand payment.');
      return {
        // Freeze the price the brand paid against, so receipts and reports never move afterwards.
        set: { pay_status: 'funded', funded_at: '@now', fee_pct: input.__pct ?? null, brand_paid_paise: amount, stage: ['shortlisted', 'contacted', 'negotiating'].includes(d.stage) ? 'confirmed' : d.stage },
        event: { kind: 'funded', note: `Brand payment received: ${formatPaise(amount)} (ref ${ref})` + (input.__expectedPaise && input.__expectedPaise !== amount ? `. Quoted all-in was ${formatPaise(input.__expectedPaise)}: check the difference` : '') },
        ledger: { kind: 'brand_payment_received', amount_paise: amount, utr: ref, method: input.method || 'bank_transfer', key: `fund:${d.id}` },
      };
    }

    case 'submit_draft': {
      req(!closed(d), 'This deal was cancelled.');
      req(d.sow_accepted_at, 'Accept the deal terms first.');
      req(d.pay_status !== 'unfunded', 'Wait until the brand has paid before sending a draft. We will tell you.');
      req(['none', 'changes'].includes(d.draft_status), d.draft_status === 'submitted' ? 'Your draft is already with the brand.' : 'The draft is already approved.');
      const url = String(input.draft_url || '').trim();
      req(/^https:\/\/\S{6,}$/.test(url), 'Paste a full https:// link to your draft (Google Drive, Dropbox or similar).');
      const hours = Number(input.approve_hours) > 0 ? Number(input.approve_hours) : 48;
      return {
        set: { draft_url: url.slice(0, 500), draft_status: 'submitted', draft_submitted_at: '@now', auto_approve_at: new Date(now.getTime() + hours * 36e5).toISOString(), checklist_json: input.checklist_json ?? d.checklist_json },
        event: { kind: 'draft', note: url.slice(0, 500) },
      };
    }

    case 'request_changes': {
      req(!closed(d), 'This deal was cancelled.');
      req(d.draft_status === 'submitted', 'There is no draft waiting for review.');
      const note = scrubContacts(String(input.note || '').trim()).text;
      req(note.length >= 3, 'Write the feedback the creator should act on.');
      const extra = Number(d.revisions_used) >= Number(d.revisions_included);
      return {
        set: { draft_status: 'changes', revisions_used: Number(d.revisions_used || 0) + 1, auto_approve_at: null },
        event: { kind: 'changes', note: (extra ? '[Extra round beyond what is included] ' : '') + note.slice(0, 1000) },
      };
    }

    case 'approve_draft':
    case 'auto_approve':
      req(!closed(d), 'This deal was cancelled.');
      req(d.draft_status === 'submitted', d.draft_status === 'approved' ? 'This draft is already approved.' : 'There is no draft waiting for review.');
      if (step === 'auto_approve') req(d.auto_approve_at && Date.parse(d.auto_approve_at) <= now.getTime(), 'The review window has not passed yet.');
      return { set: { draft_status: 'approved', auto_approve_at: null }, event: { kind: 'approved', note: step === 'auto_approve' ? 'Auto-approved: the review window passed without feedback' : input.note || null } };

    case 'submit_live_link': {
      req(!closed(d), 'This deal was cancelled.');
      req(d.draft_status === 'approved', 'Your draft has to be approved before you post.');
      req(!d.live_at, 'Your post is already verified.');
      const url = String(input.post_url || '').trim();
      req(/^https:\/\/(www\.)?(instagram\.com|youtube\.com|youtu\.be|facebook\.com|x\.com|twitter\.com|linkedin\.com|moj|sharechat\.com|snapchat\.com)\S*/i.test(url) || /^https:\/\/\S{8,}$/.test(url), 'Paste the full https:// link to your live post.');
      return { set: { post_url: url.slice(0, 500) }, event: { kind: 'live_link', note: url.slice(0, 500) } };
    }

    case 'verify_live': {
      req(!closed(d), 'This deal was cancelled.');
      req(d.draft_status === 'approved', 'The draft must be approved before the post can be verified.');
      req(!d.live_at, 'This post is already verified.');
      const url = String(input.post_url || d.post_url || '').trim();
      req(/^https:\/\/\S{8,}$/.test(url), 'Add the live post link.');
      return { set: { post_url: url.slice(0, 500), live_at: '@now', stage: 'live' }, event: { kind: 'live', note: url.slice(0, 500) } };
    }

    case 'approve_payout':
      req(!closed(d), 'This deal was cancelled.');
      req(d.live_at, 'The live post has to be verified first.');
      req(d.pay_status === 'funded', d.pay_status === 'unfunded' ? 'The brand payment has not been recorded yet.' : 'This payout is already approved.');
      return { set: { pay_status: 'released' }, event: { kind: 'released', note: input.note || null } };

    case 'record_payout': {
      req(!closed(d), 'This deal was cancelled.');
      req(d.pay_status === 'released', d.pay_status === 'paid' ? 'This creator is already marked paid.' : 'Approve the payout first.');
      const net = toPaise(input.amount);
      req(net && net > 0, 'Enter the amount actually sent to the creator, in rupees.');
      const tds = toPaise(input.tds || 0) ?? -1;
      req(tds >= 0, 'TDS must be a rupee amount (0 if none).');
      const feeP = Math.round(Number(d.fee || 0) * 100);
      req(net + tds <= feeP, `Amount sent plus TDS can't be more than the agreed fee of ${inr(Number(d.fee))}.`);
      const utr = String(input.utr || '').trim().toUpperCase();
      req(/^[A-Z0-9]{6,30}$/.test(utr), 'Enter the bank reference (UTR): 6 to 30 letters and numbers.');
      return {
        set: { pay_status: 'paid', paid_at: '@now', utr, tds_amount: Math.round(tds / 100), stage: 'paid' },
        event: { kind: 'paid', note: `Sent ${formatPaise(net)}${tds ? `, TDS ${formatPaise(tds)}` : ''}, UTR ${utr}` },
        ledger: { kind: 'creator_payout_sent', amount_paise: net, tds_paise: tds, utr, method: input.method || 'bank_transfer', key: `payout:${d.id}` },
      };
    }

    case 'brand_signoff':
      req(d.live_at, 'You can sign off once the post is live and verified.');
      req(!d.brand_signoff_at, 'You already signed this off.');
      return { set: { brand_signoff_at: '@now', proof_public: input.public ? 1 : 0 }, event: { kind: 'signoff', note: 'Brand signed off the work' } };

    case 'cancel':
      req(!closed(d), 'This deal is already cancelled.');
      req(d.pay_status !== 'paid' && d.pay_status !== 'released', 'The creator payout is approved or sent; this deal can no longer be cancelled.');
      req(String(input.reason || '').trim().length >= 3, 'Give a short reason for cancelling.');
      return { set: { stage: 'cancelled' }, event: { kind: 'cancelled', note: String(input.reason).trim().slice(0, 300) + (d.pay_status === 'funded' ? ' (brand money still held: record the refund)' : '') } };

    case 'record_refund': {
      req(d.stage === 'cancelled', 'Cancel the deal before recording a refund.');
      req(d.pay_status === 'funded', 'There is no brand payment to refund on this deal.');
      const amt = toPaise(input.amount);
      req(amt && amt > 0, 'Enter the amount refunded, in rupees.');
      const utr = String(input.utr || '').trim().toUpperCase();
      req(/^[A-Z0-9]{6,30}$/.test(utr), 'Enter the bank reference (UTR) of the refund.');
      return {
        set: { pay_status: 'refunded' },
        event: { kind: 'refunded', note: `Refunded ${formatPaise(amt)} to the brand, UTR ${utr}` },
        ledger: { kind: 'brand_refund_sent', amount_paise: amt, utr, method: 'bank_transfer', key: `refund:${d.id}` },
      };
    }

    case 'save_results': {
      req(d.live_at, 'Results can be added once the post is live.');
      const n = (k: string) => { const v = input[k]; if (v === '' || v == null) return d[k]; const x = Number(String(v).replace(/[^\d]/g, '')); return Number.isFinite(x) ? x : d[k]; };
      return {
        set: { actual_views: n('actual_views'), likes: n('likes'), comments: n('comments'), orders: n('orders'), clicks: n('clicks') ?? d.clicks, sales_value: n('sales_value'), reward_value: n('reward_value'), market_rate: n('market_rate') },
        event: { kind: 'results', note: null },
      };
    }
  }
  throw new FlowError('Unknown step.', 'invalid_input');
}

const NOTIFY_ON: Partial<Record<Step, true>> = { submit_draft: true, request_changes: true, approve_draft: true, auto_approve: true, submit_live_link: true, verify_live: true, record_payout: true, record_funding: true };

/**
 * Apply one step to a deal. Returns the updated deal. Throws FlowError with a message a person can act on.
 */
export async function transition(dealId: string, step: Step, actor: Actor, input: Input = {}): Promise<any> {
  // Keys starting with __ are set only here (e.g. the frozen price); callers can never supply them.
  input = Object.fromEntries(Object.entries(input || {}).filter(([k]) => !k.startsWith('__')));
  const result = await env.DB.tx(async (t: any) => {
    const d = await t.prepare('SELECT * FROM creator_deals WHERE id = ? FOR UPDATE').bind(String(dealId || '')).first();
    if (!d) throw new FlowError('That deal does not exist.', 'not_found');
    if (!allowedActor(step, actor, d)) throw new FlowError("You don't have permission to do that on this deal.", 'forbidden');
    if (step === 'record_funding' && d.pay_status === 'unfunded' && Number(d.fee) > 0) {
      const { priceDeal } = await import('./pricing');
      const k = d.campaign_id ? await t.prepare('SELECT id, client_email, rush FROM campaigns WHERE id = ?').bind(d.campaign_id).first() : {};
      const p = await priceDeal(env, { ...d, fee_pct: null }, k || {});
      if (p) input = { ...input, __pct: p.pct, __expectedPaise: p.total * 100 };
    }
    const eff = plan(step, d, input);
    const cols = Object.keys(eff.set);
    const sets = cols.map((c) => (eff.set[c] === '@now' ? `${c}=datetime('now')` : `${c}=?`));
    const vals = cols.filter((c) => eff.set[c] !== '@now').map((c) => eff.set[c]);
    await t.prepare(`UPDATE creator_deals SET ${sets.join(', ')}, updated_at=datetime('now') WHERE id=?`).bind(...vals, d.id).run();
    const who = actor.kind === 'team' ? 'team' : actor.kind;
    await t.prepare('INSERT INTO deal_events (id, deal_id, actor, kind, note) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), d.id, who, eff.event.kind, eff.event.note ?? null).run();
    if (eff.ledger) {
      try {
        await t.prepare('INSERT INTO finance_ledger (kind, campaign_id, deal_id, amount_paise, tds_paise, utr, method, note, actor_id, idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .bind(eff.ledger.kind, d.campaign_id, d.id, eff.ledger.amount_paise, eff.ledger.tds_paise || 0, eff.ledger.utr || null, eff.ledger.method || null, eff.event.note ?? null, actor.id, eff.ledger.key).run();
      } catch (e: any) {
        if (e?.code === '23505') throw new FlowError(/utr/i.test(String(e?.constraint || e?.detail)) ? 'That bank reference (UTR) is already recorded on another payment.' : 'This payment is already recorded.', 'duplicate');
        throw e;
      }
    }
    if (step === 'record_payout') {
      const { accrueOnPaidTx } = await import('./referral');
      await accrueOnPaidTx(t, d.id);
    }
    await audit({ kind: actor.kind === 'system' ? 'system' : actor.kind, id: actor.id }, `deal.${step}`, 'deal', d.id, { before: { stage: d.stage, pay_status: d.pay_status, draft_status: d.draft_status }, set: eff.set, ledger: eff.ledger ? { kind: eff.ledger.kind, amount_paise: eff.ledger.amount_paise } : undefined }, t);
    return t.prepare('SELECT * FROM creator_deals WHERE id = ?').bind(d.id).first();
  });
  if (NOTIFY_ON[step]) await notifyFor(step, result, input).catch((e) => logError('dealflow/notify', e, { step, deal: result?.id }));
  return result;
}

async function notifyFor(step: Step, d: any, input: Input) {
  const c = await env.DB.prepare('SELECT c.name, a.email FROM creators c LEFT JOIN creator_accounts a ON a.creator_id = c.id WHERE c.id = ?').bind(d.creator_id).first();
  const k = d.campaign_id ? await env.DB.prepare('SELECT title, client_email, client_name, share_token FROM campaigns WHERE id = ?').bind(d.campaign_id).first() : null;
  const title = k?.title || d.brand || 'your campaign';
  const base = { title, dealId: d.id, name: c?.name, creator: c?.name };
  const key = (s: string) => `${s}:${d.id}:${d.updated_at}`;
  switch (step) {
    case 'submit_draft':
      await notify({ template: 'draft_submitted', to: teamInbox(), toKind: 'team', payload: base, dedupeKey: key('draft_team') });
      if (k?.client_email) await notify({ template: 'draft_submitted', to: k.client_email, toKind: 'brand', payload: { ...base, reviewUrl: `${process.env.SITE_URL || 'https://colatch-app.vercel.app'}/shortlist/${k.share_token}` }, dedupeKey: key('draft_brand') });
      break;
    case 'request_changes':
      await notify({ template: 'changes_requested', to: c?.email, toKind: 'creator', toId: d.creator_id, payload: { ...base, note: input.note }, dedupeKey: key('changes') });
      break;
    case 'approve_draft':
    case 'auto_approve':
      await notify({ template: 'draft_approved', to: c?.email, toKind: 'creator', toId: d.creator_id, payload: base, dedupeKey: `approved:${d.id}` });
      break;
    case 'submit_live_link':
      await notify({ template: 'post_live', to: teamInbox(), toKind: 'team', payload: { ...base, postUrl: d.post_url }, dedupeKey: key('live_link') });
      break;
    case 'verify_live':
      await notify({ template: 'payout_eligible', to: teamInbox(), toKind: 'team', payload: { ...base, amount: inr(Number(d.fee || 0)) }, dedupeKey: `eligible:${d.id}` });
      break;
    case 'record_payout':
      await notify({ template: 'payout_sent', to: c?.email, toKind: 'creator', toId: d.creator_id, payload: { ...base, amount: formatPaise(toPaise(input.amount)), utr: d.utr, tds: d.tds_amount ? inr(d.tds_amount) : null }, dedupeKey: `payout:${d.id}` });
      break;
    case 'record_funding':
      if (k?.client_email) await notify({ template: 'brand_payment_recorded', to: k.client_email, toKind: 'brand', payload: { ...base, name: k.client_name, amount: formatPaise(toPaise(input.amount)), utr: input.reference, token: k.share_token }, dedupeKey: `funded:${d.id}` });
      break;
  }
}
