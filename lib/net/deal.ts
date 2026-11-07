import { inr } from './creators';

/** The money/status rail shown at the top of every deal, for both sides. */
export const RAIL = [
  { key: 'agreed', label: 'Terms agreed' },
  { key: 'funded', label: 'Brand funded' },
  { key: 'draft', label: 'Draft approved' },
  { key: 'live', label: 'Live verified' },
  { key: 'released', label: 'Payment released' },
  { key: 'paid', label: 'Paid to you' },
] as const;

export interface DealRow {
  id: string; creator_id: string; campaign_id: string | null; brand: string | null; deliverable: string | null; stage: string;
  fee: number | null; expected_views: number | null; actual_views: number | null; post_url: string | null; go_live_date: string | null;
  notes: string | null; created_at: string; updated_at: string; application_id: string | null; pay_status: string; funded_at: string | null;
  paid_at: string | null; utr: string | null; tds_amount: number | null; sow_accepted_at: string | null; revisions_included: number;
  revisions_used: number; draft_url: string | null; draft_status: string; draft_submitted_at: string | null; auto_approve_at: string | null;
  checklist_json: string | null; live_at: string | null; track_code: string | null; clicks: number; orders: number | null;
  likes: number | null; comments: number | null;
  market_rate?: number | null; reward_value?: number | null; sales_value?: number | null; brand_signoff_at?: string | null; proof_public?: number | null;
}

/** How far along the rail a deal is (index of the last completed step, -1 = nothing yet). */
export function railIndex(d: DealRow): number {
  if (d.pay_status === 'paid') return 5;
  if (d.pay_status === 'released') return 4;
  if (d.live_at) return 3;
  if (d.draft_status === 'approved') return 2;
  if (d.pay_status === 'funded') return 1;
  if (d.sow_accepted_at) return 0;
  return -1;
}

/** What is blocking the deal right now, in one line, and who owns the next move. */
export function nextStep(d: DealRow): { who: 'creator' | 'brand' | 'team'; text: string } {
  if (!d.sow_accepted_at) return { who: 'creator', text: 'Creator to accept the deal terms' };
  if (d.pay_status === 'unfunded') return { who: 'brand', text: 'Waiting for the brand to fund this deal' };
  if (d.draft_status === 'none') return { who: 'creator', text: 'Creator to submit the draft' };
  if (d.draft_status === 'changes') return { who: 'creator', text: 'Creator to submit the revised draft' };
  if (d.draft_status === 'submitted') return { who: 'brand', text: 'Brand to review the draft' };
  if (!d.live_at) return { who: 'creator', text: 'Creator to post and share the live link' };
  if (d.pay_status === 'funded') return { who: 'team', text: 'Team to verify the post and release payment' };
  if (d.pay_status === 'released') return { who: 'team', text: 'Team to send the payout and add the UTR' };
  return { who: 'team', text: 'Done. Add final results' };
}

export function feePct(env: Env): number {
  const n = Number(env.COLATCH_FEE_PCT);
  return isFinite(n) && n >= 0 && n < 60 ? n : 15;
}

/**
 * The fee a brand actually pays on a creator, with the reason in plain words.
 *  - Repeat booking: this brand already paid a deal with this creator through Colatch → 12%.
 *  - Loyalty ladder: 1 point off per ₹5L of creator fees paid in the last 365 days, floor 10%.
 * The lower of the two applies. Keeps feePct(env) as the base for everyone else.
 */
export async function brandFeePct(env: Env, clientEmail: string | null | undefined, creatorId?: string | null, excludeCampaignId?: string | null): Promise<{ pct: number; reason: string | null; spent: number; repeat: boolean }> {
  const base = feePct(env);
  const email = String(clientEmail || '').trim().toLowerCase();
  if (!email) return { pct: base, reason: null, spent: 0, repeat: false };
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(d.fee),0) AS spent FROM creator_deals d JOIN campaigns k ON k.id=d.campaign_id WHERE LOWER(k.client_email)=? AND d.pay_status='paid' AND d.paid_at >= datetime('now','-365 days') AND k.id <> ?"
  ).bind(email, excludeCampaignId || '').first<{ spent: number }>();
  const spent = Number(row?.spent || 0);
  let pct = base, reason: string | null = null;
  const steps = Math.floor(spent / 500000);
  if (steps > 0) {
    const loyal = Math.max(10, base - steps);
    if (loyal < pct) { pct = loyal; reason = `Loyalty rate ${loyal}%: ${inr(steps * 500000)}+ spent this year`; }
  }
  let repeat = false;
  if (creatorId) {
    const r = await env.DB.prepare(
      "SELECT d.id FROM creator_deals d JOIN campaigns k ON k.id=d.campaign_id WHERE LOWER(k.client_email)=? AND d.creator_id=? AND d.pay_status='paid' AND k.id <> ? LIMIT 1"
    ).bind(email, creatorId, excludeCampaignId || '').first<{ id: string }>();
    if (r) { repeat = true; if (12 < pct) { pct = 12; reason = 'Repeat booking rate 12%'; } }
  }
  return { pct, reason, spent, repeat };
}

/** Rush shortlist surcharge, as a % of the creator fee. */
export const RUSH_PCT = 5;

/** Brand-side all-in price. GST 18% on Colatch's fee; creator GST only if the creator is GST-registered.
 *  Pass `pctOverride` (from brandFeePct) and `rush` to price loyalty, repeat and rush correctly. */
export function quote(env: Env, creatorFee: number, creatorGst: boolean, pctOverride?: number | null, rush = false) {
  const basePct = pctOverride != null ? pctOverride : feePct(env);
  const pct = basePct + (rush ? RUSH_PCT : 0);
  const colatch = Math.round((creatorFee * pct) / 100);
  const gstOnColatch = Math.round(colatch * 0.18);
  const gstOnCreator = creatorGst ? Math.round(creatorFee * 0.18) : 0;
  const rushFee = rush ? Math.round((creatorFee * RUSH_PCT) / 100) : 0;
  return { creatorFee, pct, basePct, rushFee, colatch, gstOnColatch, gstOnCreator, total: creatorFee + colatch + gstOnColatch + gstOnCreator };
}

/** What the creator takes home. TDS is 10% once fees from one payer cross ₹50,000 in a financial year. */
export function takeHome(fee: number, fyPaidSoFar: number) {
  const crosses = fyPaidSoFar + fee > 50_000;
  const tds = crosses ? Math.round(fee * 0.1) : 0;
  return { fee, tds, net: fee - tds, crosses };
}

export function fyStart(now = new Date()): string {
  const y = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${y}-04-01`;
}

export function makeTrackCode(handle: string): string {
  const base = handle.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8) || 'CREATOR';
  const rnd = [...crypto.getRandomValues(new Uint8Array(2))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${base}${rnd}`;
}

export async function logEvent(env: Env, dealId: string, actor: string, kind: string, note: string | null = null) {
  await env.DB.prepare('INSERT INTO deal_events (id, deal_id, actor, kind, note) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), dealId, actor, kind, note).run();
}

/** Drafts the brand hasn't reviewed in time are approved automatically. Runs whenever a deal is opened. */
export async function applyAutoApprove(env: Env, d: DealRow): Promise<boolean> {
  if (d.draft_status === 'submitted' && d.auto_approve_at && Date.parse(d.auto_approve_at) < Date.now()) {
    await env.DB.prepare("UPDATE creator_deals SET draft_status='approved', updated_at=datetime('now') WHERE id=?").bind(d.id).run();
    await logEvent(env, d.id, 'system', 'approved', 'Auto-approved: the review window passed without feedback');
    d.draft_status = 'approved';
    return true;
  }
  return false;
}

export function countdown(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 36e5), dd = Math.floor(h / 24);
  return dd ? `${dd}d ${h % 24}h` : `${h}h ${Math.floor((ms % 36e5) / 6e4)}m`;
}

export function checklist(json: string | null): Record<string, boolean> {
  try { return JSON.parse(json || '{}') || {}; } catch { return {}; }
}

export const lines = (s: string | null | undefined) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

/** Ready-made WhatsApp nudges per step (team sends; nothing is sent automatically). */
export function nudge(d: DealRow, creatorName: string, origin: string): string {
  const link = `${origin}/creator/deals/${d.id}`;
  const n = nextStep(d);
  const map: Record<string, string> = {
    'Creator to accept the deal terms': `Hi ${creatorName}, your ${d.brand} deal is ready. Please review and accept the terms here: ${link}`,
    'Creator to submit the draft': `Hi ${creatorName}, the ${d.brand} deal is funded and good to go. Share your draft link here when ready: ${link}`,
    'Creator to submit the revised draft': `Hi ${creatorName}, the brand left feedback on your draft. Details and upload here: ${link}`,
    'Creator to post and share the live link': `Hi ${creatorName}, your draft is approved! Please post and paste the live link here so we can start your payment clock: ${link}`,
  };
  return map[n.text] ?? `Hi ${creatorName}, update on your ${d.brand} deal: ${link}`;
}

export const money = inr;
