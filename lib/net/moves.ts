// "Whose move is it?" for a deal, worked out by asking the deal state machine itself.
// Every home screen (creator, brand, team) reads this, so a screen can never show a move the
// server would refuse, or miss one it expects.
import { plan, FlowError, type Step } from './dealflow';

export type Owner = 'creator' | 'brand' | 'finance' | 'team';
export type Move = { step: Step; owner: Owner; label: string; forCreator: string; forBrand: string; forTeam: string; index: number };

// The deal's main line, in order. Sample inputs pass plan()'s input checks, so only the deal's
// state decides which step is open.
const LINE: { step: Step; owner: Owner; label: string; forCreator: string; forBrand: string; forTeam: string; input?: Record<string, string> }[] = [
  { step: 'accept_terms', owner: 'creator', label: 'Accept terms', forCreator: 'Read and accept the terms', forBrand: 'Creator is reviewing the terms', forTeam: 'Creator to accept the terms' },
  { step: 'record_funding', owner: 'finance', label: 'Brand pays', forCreator: 'Waiting for the brand payment', forBrand: 'Pay Colatch to start the work', forTeam: 'Record the brand payment', input: { amount: '1', reference: 'CHECK1234' } },
  { step: 'submit_draft', owner: 'creator', label: 'Draft', forCreator: 'Upload your draft', forBrand: 'Creator is making the draft', forTeam: 'Creator to submit the draft', input: { draft_url: 'https://example.com/d' } },
  { step: 'approve_draft', owner: 'brand', label: 'Approve draft', forCreator: 'Brand is reviewing your draft', forBrand: 'Review the draft', forTeam: 'Brand to review the draft' },
  { step: 'submit_live_link', owner: 'creator', label: 'Live link', forCreator: 'Post it and add the live link', forBrand: 'Creator is posting', forTeam: 'Creator to post and share the link', input: { post_url: 'https://example.com/p' } },
  { step: 'verify_live', owner: 'team', label: 'Verify live', forCreator: 'Colatch is checking your post', forBrand: 'Colatch is checking the post', forTeam: 'Verify the live post' },
  { step: 'approve_payout', owner: 'finance', label: 'Approve payout', forCreator: 'Payout is being approved', forBrand: 'Post verified', forTeam: 'Approve the payout' },
  { step: 'record_payout', owner: 'finance', label: 'Paid', forCreator: 'Payment on the way', forBrand: 'Post verified', forTeam: 'Send the payout and record the UTR', input: { amount: '1', utr: 'CHECK12345' } },
];

/** The labels of the main line, for progress rails. */
export const RAIL = LINE.map((s) => ({ step: s.step, label: s.label, owner: s.owner }));

/** The next open step on a deal, or null when it is closed, cancelled or paid. */
export function nextMove(d: any, now = new Date()): Move | null {
  if (!d || d.stage === 'cancelled' || d.pay_status === 'refunded' || d.pay_status === 'paid') return null;
  for (let i = 0; i < LINE.length; i++) {
    const s = LINE[i];
    // A posted link waits for the team's check; the creator can still replace it, but it isn't their move.
    if (s.step === 'submit_live_link' && d.post_url) continue;
    try {
      plan(s.step, d, s.input || {}, now);
      return { step: s.step, owner: s.owner, label: s.label, forCreator: s.forCreator, forBrand: s.forBrand, forTeam: s.forTeam, index: i };
    } catch (e) {
      if (!(e instanceof FlowError)) throw e;
    }
  }
  // Nothing on the main line is open: the terms themselves need setting (no fee yet).
  return { step: 'edit_terms', owner: 'team', label: 'Set terms', forCreator: 'Colatch is setting the terms', forBrand: 'Colatch is setting the terms', forTeam: 'Set the fee and terms', index: 0 };
}

/** How many steps of the main line are done (0–8). Paid deals are 8. */
export function stepsDone(d: any, now = new Date()): number {
  if (d?.pay_status === 'paid') return LINE.length;
  const m = nextMove(d, now);
  return m ? m.index : 0;
}

/** True when this viewer is the one who acts next. */
export function isMine(m: Move | null, viewer: 'creator' | 'brand' | { role: string }): boolean {
  if (!m) return false;
  if (viewer === 'creator' || viewer === 'brand') return m.owner === viewer;
  const r = viewer.role;
  if (m.owner === 'finance') return r === 'owner' || r === 'admin' || r === 'finance';
  if (m.owner === 'team') return r === 'owner' || r === 'admin' || r === 'shortlist';
  return false; // creator and brand moves are theirs; the team only follows up
}
