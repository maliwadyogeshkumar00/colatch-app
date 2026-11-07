import { match, list, type MatchCampaign } from './match';
import { int, str, type CreatorRow } from './creators';
import type { BriefNeeds } from './brief';

export interface CampaignRow extends MatchCampaign {
  id: string; slug: string; title: string; brand: string | null; brief: string | null; raw_brief: string | null;
  deliverables: string | null; creators_needed: number | null; budget_note: string | null; budget_total: number | null;
  deadline: string | null; shoot_date: string | null; status: string; source: string; client_name: string | null;
  client_company: string | null; client_email: string | null; client_phone: string | null; ai_notes: string | null; created_at: string;
  pay_type: string | null; revisions: number | null; usage_rights: string | null; payment_days: number | null;
  mandatories: string | null; exclusions: string | null; brand_url: string | null; promised_cpv: number | null; shortlist_due: string | null; approve_hours: number | null;
  brand_category: string | null; reward_value: number | null; commission_pct: number | null; funded: number | null; ref_code: string | null;
}

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { pending: 'Waiting for approval', open: 'Open', closed: 'Closed', rejected: 'Rejected' };

/** Structured fields shared by the team form and the client brief. */
export function campaignFieldsFromForm(f: FormData) {
  const many = (k: string) => {
    const all = f.getAll(k).map(String).flatMap((v) => list(v));
    return all.length ? [...new Set(all)].join(', ') : null;
  };
  return {
    title: str(f.get('title')),
    brand: str(f.get('brand')),
    brief: str(f.get('brief')),
    deliverables: str(f.get('deliverables')),
    talent_types: many('talent_types'),
    niche: many('niche'),
    city: many('city'),
    languages: many('languages'),
    gender: str(f.get('gender')),
    min_followers: int(f.get('min_followers')),
    max_followers: int(f.get('max_followers')),
    creators_needed: int(f.get('creators_needed')),
    budget_note: str(f.get('budget_note')),
    budget_total: int(f.get('budget_total')),
    deadline: str(f.get('deadline')),
    shoot_date: str(f.get('shoot_date')),
    pay_type: ['cash', 'barter', 'cash_product', 'ticket', 'giveaway', 'commission'].includes(String(f.get('pay_type'))) ? String(f.get('pay_type')) : 'cash',
    brand_category: str(f.get('brand_category')),
    reward_value: int(f.get('reward_value')),
    commission_pct: (() => { const n = parseFloat(String(f.get('commission_pct') ?? '')); return isFinite(n) && n > 0 && n < 100 ? n : null; })(),
    funded: f.get('funded') ? 1 : 0,
    revisions: int(f.get('revisions')) ?? 2,
    usage_rights: str(f.get('usage_rights')),
    payment_days: int(f.get('payment_days')) ?? 30,
    approve_hours: int(f.get('approve_hours')) ?? 72,
    mandatories: str(f.get('mandatories')),
    exclusions: str(f.get('exclusions')),
    brand_url: (() => { const u = str(f.get('brand_url')); return u && /^https?:\/\//.test(u) ? u : u ? 'https://' + u : null; })(),
    promised_cpv: (() => { const n = parseFloat(String(f.get('promised_cpv') ?? '')); return isFinite(n) && n > 0 ? n : null; })(),
  };
}

export function needsToFields(n: BriefNeeds) {
  return {
    title: n.title, brief: n.creator_brief, deliverables: n.deliverables,
    talent_types: n.talent_types.join(', ') || null, niche: n.niche.join(', ') || null, city: n.city.join(', ') || null,
    languages: n.languages.join(', ') || null, gender: n.gender, min_followers: n.min_followers, max_followers: n.max_followers,
    creators_needed: n.creators_needed, budget_total: n.budget_total,
  };
}

/** Run every creator in the database through the matching engine for one campaign. */
export async function rankCreators(env: Env, k: MatchCampaign, limit = 60) {
  const rows = (await env.DB.prepare("SELECT * FROM creators WHERE status <> 'blacklisted' LIMIT 5000").all<CreatorRow & any>()).results ?? [];
  return rows
    .map((c) => ({ c, m: match(c, k) }))
    .filter((x) => x.m.eligible)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, limit);
}

/** What creators see as requirement chips. */
export function requirementChips(k: CampaignRow): string[] {
  const out: string[] = [];
  list(k.talent_types).forEach((t) => out.push(t));
  if (k.min_followers || k.max_followers) out.push(`${k.min_followers ? short(k.min_followers) : '0'}${k.max_followers ? '–' + short(k.max_followers) : '+'} followers`);
  list(k.city).forEach((c) => out.push(c));
  list(k.languages).forEach((l) => out.push(l));
  if (k.gender) out.push(k.gender);
  return out;
}
const short = (n: number) => (n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export const PAY_LABEL: Record<string, string> = {
  cash: 'Paid', cash_product: 'Paid + product', barter: 'Product only', ticket: 'Event tickets', giveaway: 'Giveaway', commission: 'Commission on sales',
};
/** Reward types where the creator gets no fixed cash fee. Cash-only creators never see these. */
export const NON_CASH = ['barter', 'ticket', 'giveaway', 'commission'];
export function rewardLine(k: { pay_type?: string | null; reward_value?: number | null; commission_pct?: number | null; budget_note?: string | null }): string {
  const v = k.reward_value ? '₹' + Math.round(k.reward_value).toLocaleString('en-IN') : '';
  switch (k.pay_type) {
    case 'barter': return v ? `Products worth ${v}` : 'Products from the brand';
    case 'ticket': return v ? `Event tickets worth ${v}` : 'Event tickets / passes';
    case 'giveaway': return v ? `Giveaway prize worth ${v} for your followers` : 'Run a giveaway for your followers';
    case 'commission': return k.commission_pct ? `${k.commission_pct}% of every sale from your link` : 'Commission on sales from your link';
    case 'cash_product': return (k.budget_note || 'Paid') + (v ? ` + products worth ${v}` : ' + products');
    default: return k.budget_note || 'Paid';
  }
}

/** Days left to apply, for countdown chips. */
export function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const d = Math.ceil((Date.parse(deadline + 'T23:59:59+05:30') - Date.now()) / 864e5);
  return isFinite(d) ? d : null;
}

/** Why a creator wasn't picked, with one tip they can act on. */
export const REJECT_REASONS: Record<string, [string, string]> = {
  budget: ['Your quote was above the brand budget', 'Briefs at this size usually land closer to the rate guide. Try quoting a package (reel + 2 stories) instead of a single reel.'],
  city: ['The brand needed a different city or language mix', 'Add every city you can shoot in and every language you create in to your profile.'],
  style: ['Your content style was not the look the brand wanted', 'Put 2–3 reels in your profile that are closest to the brands you want to work with.'],
  audience: ['Your audience did not match the brand target', 'Brands weigh audience fit heavily. Connect or verify your account so they can see your real audience.'],
  filled: ['The brief was filled before we got to you', 'Apply in the first 24 hours: early applicants are reviewed first.'],
  quality: ['The profile needed more proof', 'Verify your account and add views per reel. Profiles with real numbers get picked far more often.'],
};
