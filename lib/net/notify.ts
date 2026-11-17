// Notification outbox.
//
// Every notification is written to the `notifications` table first, with a dedupe key so the same
// event never produces two messages. Then we try to deliver it:
//  - email goes out through Resend's HTTP API when RESEND_API_KEY and EMAIL_FROM are set;
//  - without them the row is marked `not_configured` (never `sent`);
//  - WhatsApp stays `not_configured` until an official provider and approved templates exist.
// Failures keep the error and can be retried from the team desk (Notifications page).
import { env } from './env';
import { logError } from './security';

export type Template =
  | 'creator_welcome' | 'brief_received' | 'new_application' | 'shortlist_ready' | 'creator_shortlisted'
  | 'creator_approved' | 'creator_declined' | 'deal_created' | 'draft_submitted' | 'changes_requested'
  | 'draft_approved' | 'post_live' | 'payout_eligible' | 'payout_sent' | 'brand_payment_recorded'
  | 'referral_earned' | 'password_reset' | 'team_invite' | 'account_alert'
  | 'verify_email' | 'brand_welcome' | 'new_brand' | 'dispute_opened' | 'dispute_resolved'
  // Scheduled reminders (lib/net/jobs.ts)
  | 'reminder_brand_unpaid' | 'reminder_brand_unpaid_team' | 'reminder_draft_due' | 'reminder_post_due' | 'reminder_payout_stuck'
  | 'usage_expiring' | 'usage_expired';

type Rendered = { subject: string; text: string };

function siteUrl(): string {
  return (env.SITE_URL || process.env.SITE_URL || 'https://colatch-app.vercel.app').replace(/\/$/, '');
}

/** Plain-text emails: they render everywhere and nothing in them can run. */
export function render(t: Template, p: Record<string, any>): Rendered {
  const u = (path: string) => `${siteUrl()}${path}`;
  const sign = '\n\nColatch\nmarketing@colatch.com';
  switch (t) {
    case 'creator_welcome': return { subject: 'Welcome to Colatch', text: `Hi ${p.name || 'there'},\n\nYour Colatch creator profile is live. You will only see briefs that fit what you do.\n\nOpen your briefs: ${u('/creator')}${sign}` };
    case 'brief_received': return { subject: `We got your brief: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nThanks for your brief "${p.title}". Your shortlist will be ready by ${p.due || 'within 2 working days'}.\n\nTrack it here: ${u(`/shortlist/${p.token}`)}${sign}` };
    case 'new_application': return { subject: `New applicant: ${p.creator} for ${p.title}`, text: `${p.creator} applied to "${p.title}" (match ${p.score ?? '-'}).\n\nReview: ${u(`/team/campaigns/${p.campaignId}`)}` };
    case 'shortlist_ready': return { subject: `Your shortlist is ready: ${p.title}`, text: `Hi ${p.name || 'there'},\n\n${p.count} creators are ready for "${p.title}". Approve the ones you want: ${u(`/shortlist/${p.token}`)}${sign}` };
    case 'creator_shortlisted': return { subject: `You're shortlisted: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nYou made the shortlist for "${p.title}". The brand decides next; we'll tell you as soon as they do.\n\nYour applications: ${u('/creator/applications')}${sign}` };
    case 'creator_approved': return { subject: `The brand picked you: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nGood news: the brand approved you for "${p.title}". Open the deal to read and accept the terms: ${u(`/creator/deals/${p.dealId}`)}${sign}` };
    case 'creator_declined': return { subject: `Update on ${p.title}`, text: `Hi ${p.name || 'there'},\n\nThe brand went another way on "${p.title}"${p.reason ? ` (${p.reason})` : ''}. New briefs that fit you: ${u('/creator')}${sign}` };
    case 'deal_created': return { subject: `Deal ready to accept: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nYour deal for "${p.title}" is ready. Review and accept the terms: ${u(`/creator/deals/${p.dealId}`)}${sign}` };
    case 'draft_submitted': return { subject: `Draft ready to review: ${p.creator}`, text: `${p.creator} submitted a draft for "${p.title}". Review it here: ${p.reviewUrl ? p.reviewUrl : u(`/team/deals/${p.dealId}`)}` };
    case 'changes_requested': return { subject: `Changes requested: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nThe brand asked for changes on your draft for "${p.title}":\n\n${p.note || ''}\n\nUpload the new version: ${u(`/creator/deals/${p.dealId}`)}${sign}` };
    case 'draft_approved': return { subject: `Draft approved: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nYour draft for "${p.title}" is approved. Post it and paste the live link here: ${u(`/creator/deals/${p.dealId}`)}${sign}` };
    case 'post_live': return { subject: `Live post to verify: ${p.creator}`, text: `${p.creator} posted for "${p.title}": ${p.postUrl}\n\nVerify: ${u(`/team/deals/${p.dealId}`)}` };
    case 'payout_eligible': return { subject: `Payout due: ${p.creator}`, text: `${p.creator}'s post for "${p.title}" is verified. Payout of ${p.amount} is due. Record it: ${u(`/team/deals/${p.dealId}`)}` };
    case 'payout_sent': return { subject: `Payment sent: ${p.amount}`, text: `Hi ${p.name || 'there'},\n\nWe sent ${p.amount} for "${p.title}". Bank reference (UTR): ${p.utr}.${p.tds ? `\nTDS deducted: ${p.tds}.` : ''}\n\nYour earnings: ${u('/creator/earnings')}${sign}` };
    case 'brand_payment_recorded': return { subject: `Payment received: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nWe recorded your payment of ${p.amount} for "${p.title}" (reference ${p.utr || '-'}). Track your campaign: ${u(`/shortlist/${p.token}`)}${sign}` };
    case 'referral_earned': return { subject: `You earned ${p.amount} on Colatch`, text: `Hi ${p.name || 'there'},\n\n${p.reason}. ${p.amount} has been added to your Colatch earnings: ${u('/creator/earnings')}${sign}` };
    case 'password_reset': return { subject: 'Reset your Colatch password', text: `Use this link to set a new password. It works once and expires in 2 hours:\n\n${p.link}\n\nIf you did not ask for this, ignore this email.${sign}` };
    case 'team_invite': return { subject: 'You have been added to the Colatch team desk', text: `Hi ${p.name || 'there'},\n\n${p.by} added you to the Colatch team desk as ${p.role}. Set your password with this link (expires in 2 hours): ${p.link}${sign}` };
    case 'verify_email': return { subject: 'Confirm your email for Colatch', text: `Confirm this is your email address by opening this link. It works once and expires in 48 hours:\n\n${p.link}\n\nIf you did not sign up for Colatch, ignore this email.${sign}` };
    case 'brand_welcome': return { subject: 'Your Colatch brand account is ready', text: `Hi ${p.name || 'there'},\n\nYour Colatch account is set up. Post a brief, approve creators and follow every deal and payment in one place: ${u('/brand')}${sign}` };
    case 'new_brand': return { subject: `New brand account: ${p.company || p.email}`, text: `${p.name || ''} (${p.email}) created a brand account${p.company ? ` for ${p.company}` : ''}.\n\nVerify the brand: ${u('/team/brands')}` };
    case 'dispute_opened': return { subject: `Dispute raised: ${p.title}`, text: `${p.by} raised a dispute on "${p.title}": ${p.reason}\n\n${p.detail || ''}\n\nReview it: ${u('/team/disputes')}` };
    case 'dispute_resolved': return { subject: `Dispute ${p.outcome}: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nThe Colatch team ${p.outcome} the dispute on "${p.title}".\n\n${p.resolution || ''}${sign}` };
    case 'account_alert': return { subject: p.subject || 'Colatch account alert', text: `${p.text || ''}${sign}` };
    // Scheduled reminders (lib/net/jobs.ts). Each is sent once per deal and date.
    case 'reminder_brand_unpaid': return { subject: `Payment pending: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nThe creator accepted the terms for "${p.title}" ${p.days} day${Number(p.days) === 1 ? '' : 's'} ago. Work starts once your payment is received, so the post date doesn't slip.\n\nPayment details and your campaign: ${u(`/shortlist/${p.token}`)}\n\nAlready paid? Reply with the bank reference (UTR) and we'll match it.${sign}` };
    case 'reminder_brand_unpaid_team': return { subject: `Brand hasn't paid: ${p.title}`, text: `${p.creator} accepted the terms for "${p.title}" ${p.days} day${Number(p.days) === 1 ? '' : 's'} ago and the brand payment is not recorded yet. The brand was reminded too.\n\nFollow up: ${u(`/team/deals/${p.dealId}`)}` };
    case 'reminder_draft_due': return { subject: `Draft due soon: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nYour draft for "${p.title}" is due before the go-live date${p.due ? ` (${p.due})` : ''}. Upload it so the brand has time to review: ${u(`/creator/deals/${p.dealId}`)}${sign}` };
    case 'reminder_post_due': return { subject: `Time to post: ${p.title}`, text: `Hi ${p.name || 'there'},\n\nYour draft for "${p.title}" is approved and the go-live date${p.due ? ` (${p.due})` : ''} is here. Post it and paste the live link so we can verify it and release your payment: ${u(`/creator/deals/${p.dealId}`)}${sign}` };
    case 'reminder_payout_stuck': return { subject: `Payout approved, not sent: ${p.creator}`, text: `The payout of ${p.amount} to ${p.creator} for "${p.title}" was approved ${p.days} day${Number(p.days) === 1 ? '' : 's'} ago but is not recorded as sent.\n\nSend it and record the UTR: ${u(`/team/deals/${p.dealId}`)}` };
    case 'usage_expiring': return { subject: `Usage rights end in ${p.days} day${Number(p.days) === 1 ? '' : 's'}: ${p.title}`, text: `${p.team ? '' : `Hi ${p.name || 'there'},\n\n`}The usage rights for ${p.creator}'s content on "${p.title}" end on ${p.expires}${p.channels ? ` (${p.channels})` : ''}. After that date the content should come down from paid and owned channels, unless the rights are extended.\n\n${p.team ? `Deal: ${u(`/team/deals/${p.dealId}`)}` : `To extend, reply to this email. Your campaign: ${u(`/shortlist/${p.token}`)}${sign}`}` };
    case 'usage_expired': return { subject: `Usage rights ended: ${p.title}`, text: `${p.team ? '' : `Hi ${p.name || 'there'},\n\n`}The usage rights for ${p.creator}'s content on "${p.title}" ended on ${p.expires}${p.channels ? ` (${p.channels})` : ''}. Please take the content down from ads and owned channels, or ask us to extend the rights.\n\n${p.team ? `Deal: ${u(`/team/deals/${p.dealId}`)}` : `Your campaign: ${u(`/shortlist/${p.token}`)}${sign}`}` };
  }
}

export type EmailConfig = { ready: boolean; missing: string[] };
export function emailConfig(): EmailConfig {
  const missing = [];
  if (!(env.RESEND_API_KEY || process.env.RESEND_API_KEY)) missing.push('RESEND_API_KEY');
  if (!(env.EMAIL_FROM || process.env.EMAIL_FROM)) missing.push('EMAIL_FROM');
  return { ready: missing.length === 0, missing };
}

/** Team inbox for internal alerts (new applicants, drafts, live posts, payouts due). */
export const teamInbox = () => env.TEAM_ALERTS_EMAIL || process.env.TEAM_ALERTS_EMAIL || 'marketing@colatch.com';

async function deliverEmail(to: string, msg: Rendered): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const key = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
  const from = env.EMAIL_FROM || process.env.EMAIL_FROM;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: msg.subject, text: msg.text }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const body: any = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${String(body?.message || body?.name || 'error').slice(0, 200)}` };
    return { ok: true, id: body?.id };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

/**
 * Queue a notification and try to deliver it now. Never throws: a notification problem must not
 * break the action that triggered it. Returns the outbox status.
 */
export async function notify(opts: {
  template: Template; to: string | null | undefined; toKind: 'creator' | 'brand' | 'team'; toId?: string | null;
  payload: Record<string, any>; dedupeKey: string; channel?: 'email' | 'whatsapp';
  /** Values used for this delivery only and never stored (e.g. a password-reset link). Such rows can't be retried. */
  secret?: Record<string, any>;
}): Promise<string> {
  const channel = opts.channel || 'email';
  try {
    const to = String(opts.to || '').trim();
    if (!to) return 'skipped';
    const ins = await env.DB.prepare(
      `INSERT INTO notifications (channel, to_kind, to_id, to_address, template, payload, dedupe_key, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued') ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`
    ).bind(channel, opts.toKind, opts.toId ?? null, to, opts.template, JSON.stringify(opts.payload || {}), opts.dedupeKey).first();
    if (!ins) return 'duplicate';
    return await attempt(Number(ins.id), opts.secret);
  } catch (e: any) {
    await logError('notify/queue', e, { template: opts.template });
    return 'failed';
  }
}

/** Try (or retry) delivery of one outbox row. */
export async function attempt(id: number, secret?: Record<string, any>): Promise<string> {
  const n = await env.DB.prepare('SELECT * FROM notifications WHERE id = ?').bind(id).first();
  if (!n || n.status === 'sent') return n?.status || 'missing';
  if (!secret && (n.template === 'password_reset' || n.template === 'team_invite' || n.template === 'verify_email')) {
    // The link was never stored, so it can't be re-sent. A new reset link has to be made instead.
    return n.status;
  }
  if (n.channel === 'whatsapp') {
    await env.DB.prepare("UPDATE notifications SET status='not_configured', last_error=? WHERE id=?").bind('WhatsApp provider and approved templates are not set up yet', id).run();
    return 'not_configured';
  }
  const cfg = emailConfig();
  if (!cfg.ready) {
    await env.DB.prepare("UPDATE notifications SET status='not_configured', last_error=? WHERE id=?").bind(`Email not set up: missing ${cfg.missing.join(', ')}`, id).run();
    return 'not_configured';
  }
  const payload = typeof n.payload === 'string' ? JSON.parse(n.payload) : n.payload || {};
  const res = await deliverEmail(n.to_address, render(n.template, { ...payload, ...(secret || {}) }));
  if (res.ok) {
    await env.DB.prepare("UPDATE notifications SET status='sent', attempts=attempts+1, sent_at=now(), last_error=NULL WHERE id=?").bind(id).run();
    return 'sent';
  }
  await env.DB.prepare("UPDATE notifications SET status='failed', attempts=attempts+1, last_error=? WHERE id=?").bind((res as any).error, id).run();
  await logError('notify/deliver', new Error((res as any).error), { id, template: n.template });
  return 'failed';
}
