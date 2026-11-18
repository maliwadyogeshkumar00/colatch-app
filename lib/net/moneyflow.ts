/**
 * Colatch Money Flow — one engine for every split of a brand's money.
 *
 * Brand payment → platform fee → agency commission(s) → taxes → creator earnings.
 *
 * Rules of the engine (each one is tested in tests/unit/moneyflow.test.js):
 *  1. Money is integers in the currency's minor unit (paise, cents). No floats ever touch an amount.
 *  2. Rates are basis points (1000 = 10%). Nothing about a rate is hard-coded here: every rate
 *     comes in as a rule, and rules come from admin settings or a signed agreement.
 *  3. The books always balance: what the brand pays equals the sum of every line paid out.
 *  4. One rule per party and side. A second platform fee, or an agency fee on a direct deal,
 *     is refused instead of silently charged twice.
 *  5. More specific rules win: agreement > account > country > default. Account and agreement
 *     overrides must name the agreement that authorises them, or they are ignored.
 *  6. Every line carries a plain-words reason, so a creator can see why each deduction exists.
 *  7. Rounding never creates or loses money: percentage lines are rounded half-up on the brand side
 *     and floored when carved out of a fixed budget; the remainder stays with the creator.
 *
 * Currency conversion is deliberately not here. A flow is computed in one currency; converting
 * it is a separate, recorded step with its own rate and source.
 */

export type DealKind = 'direct' | 'brand_agency' | 'creator_agency' | 'hybrid';
export type Party = 'brand' | 'platform' | 'brand_agency' | 'creator_agency' | 'creator' | 'tax_authority';
export type RuleParty = 'platform' | 'brand_agency' | 'creator_agency';
/** brand: charged to the brand (on top of the creator fee, or carved from a fixed budget).
 *  creator: deducted from the creator's gross fee. */
export type Side = 'brand' | 'creator';
export type RuleSource = 'default' | 'country' | 'account' | 'agreement';

export interface FeeRule {
  id: string;
  party: RuleParty;
  side: Side;
  label: string;
  /** Percentage in basis points (1000 = 10%). */
  bps?: number;
  /** Fixed amount in minor units, added to any percentage. */
  fixedMinor?: number;
  /** Deal kinds this rule applies to. Omit for all kinds the party is valid for. */
  appliesTo?: DealKind[];
  source: RuleSource;
  /** Required for account and agreement overrides. */
  agreementId?: string;
  /** Only for country rules: ISO 3166 alpha-2 code. */
  country?: string;
}

export interface TaxRule {
  id: string;
  label: string;
  /** Which line the tax is computed on. */
  on: 'platform' | 'brand_agency' | 'creator_agency' | 'creator';
  bps: number;
  /** charge: added to the brand's bill (e.g. GST/VAT on a service fee).
   *  withhold: deducted from the recipient and remitted to the tax authority (e.g. TDS). */
  mode: 'charge' | 'withhold';
}

export interface FlowInput {
  currency: string;
  /** creator_fee: amountMinor is the agreed creator fee; brand-side fees are added on top.
   *  budget: amountMinor is the brand's fixed budget; brand-side fees are carved out of it. */
  mode: 'creator_fee' | 'budget';
  amountMinor: number;
  kind: DealKind;
  rules: FeeRule[];
  taxes?: TaxRule[];
  country?: string;
  locale?: string;
}

export interface FlowLine {
  key: string;
  from: Party;
  to: Party;
  amountMinor: number;
  label: string;
  why: string;
  ruleId: string | null;
}

export interface Flow {
  currency: string;
  mode: FlowInput['mode'];
  kind: DealKind;
  brandPaysMinor: number;
  creatorGrossMinor: number;
  creatorNetMinor: number;
  platformMinor: number;
  brandAgencyMinor: number;
  creatorAgencyMinor: number;
  taxMinor: number;
  lines: FlowLine[];
  rulesUsed: FeeRule[];
  notes: string[];
}

export class MoneyFlowError extends Error {
  constructor(message: string) { super(message); this.name = 'MoneyFlowError'; }
}

/** Minor-unit exponents (ISO 4217). Unknown currencies are refused rather than guessed. */
export const MINOR_UNITS: Record<string, number> = {
  INR: 2, USD: 2, EUR: 2, GBP: 2, AED: 2, SGD: 2, AUD: 2, CAD: 2, CHF: 2, SAR: 2, HKD: 2, NZD: 2,
  ZAR: 2, BRL: 2, MXN: 2, SEK: 2, NOK: 2, DKK: 2, PLN: 2, THB: 2, MYR: 2, IDR: 2, PHP: 2,
  JPY: 0, KRW: 0, VND: 0, KWD: 3, BHD: 3, OMR: 3,
};

const VALID_PARTIES: Record<RuleParty, DealKind[]> = {
  platform: ['direct', 'brand_agency', 'creator_agency', 'hybrid'],
  brand_agency: ['brand_agency', 'hybrid'],
  creator_agency: ['creator_agency', 'hybrid'],
};
const RANK: Record<RuleSource, number> = { default: 0, country: 1, account: 2, agreement: 3 };
const PARTY_LABEL: Record<RuleParty, string> = { platform: 'Colatch platform fee', brand_agency: 'Brand agency fee', creator_agency: 'Creator agency commission' };

function int(n: unknown, what: string): number {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) throw new MoneyFlowError(`${what} must be a whole, non-negative number of minor units`);
  return n;
}
function bpsOf(n: unknown, what: string): number {
  if (n == null) return 0;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 10000) throw new MoneyFlowError(`${what} must be whole basis points between 0 and 10000`);
  return n;
}
/** amount × bps / 10000, exact in BigInt, rounded half-up or floored. */
function pctOf(amount: number, bps: number, round: 'half_up' | 'floor'): number {
  if (!bps) return 0;
  const num = BigInt(amount) * BigInt(bps);
  const q = num / 10000n, r = num % 10000n;
  return Number(round === 'half_up' && r * 2n >= 10000n ? q + 1n : q);
}

export function formatMinor(amountMinor: number, currency: string, locale = 'en-IN'): string {
  const exp = MINOR_UNITS[currency];
  const v = amountMinor / Math.pow(10, exp ?? 2);
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: exp ?? 2 }).format(v); }
  catch { return `${currency} ${v.toFixed(exp ?? 2)}`; }
}
const pctText = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0).replace(/\.?0+$/, '')}%`;

/**
 * Pick the rules that apply to one deal: drop rules for other deal kinds or countries, drop
 * unauthorised overrides, keep the most specific rule per party and side, and refuse anything
 * that would charge the same party twice or put an agency fee on a deal with no agency.
 */
export function resolveRules(candidates: FeeRule[], kind: DealKind, country?: string): { rules: FeeRule[]; notes: string[] } {
  const notes: string[] = [];
  const best = new Map<string, FeeRule>();
  for (const r of candidates) {
    if (!r || !VALID_PARTIES[r.party]) throw new MoneyFlowError(`Unknown fee party in rule ${r?.id}`);
    if (r.side !== 'brand' && r.side !== 'creator') throw new MoneyFlowError(`Rule ${r.id} must be charged to the brand or deducted from the creator`);
    if (r.appliesTo && !r.appliesTo.includes(kind)) continue;
    if (!VALID_PARTIES[r.party].includes(kind)) {
      if (r.appliesTo) throw new MoneyFlowError(`${PARTY_LABEL[r.party]} cannot apply to a ${kind.replace('_', ' ')} deal`);
      continue; // a general agency rule simply doesn't apply to deals without that agency
    }
    if (r.source === 'country' && (!r.country || (country && r.country.toUpperCase() !== country.toUpperCase()) || !country)) continue;
    if ((r.source === 'account' || r.source === 'agreement') && !r.agreementId) {
      notes.push(`Ignored override "${r.label}": it names no signed agreement.`);
      continue;
    }
    bpsOf(r.bps, `Rate in rule ${r.id}`);
    if (r.fixedMinor != null) int(r.fixedMinor, `Fixed amount in rule ${r.id}`);
    const key = `${r.party}:${r.side}`;
    const cur = best.get(key);
    if (!cur || RANK[r.source] > RANK[cur.source]) best.set(key, r);
    else if (RANK[r.source] === RANK[cur.source]) throw new MoneyFlowError(`Two ${r.source} rules for ${PARTY_LABEL[r.party]} (${cur.id}, ${r.id}): that would charge it twice`);
  }
  // One party is paid on one side only; otherwise the same agency is paid by both brand and creator.
  for (const p of Object.keys(VALID_PARTIES) as RuleParty[]) {
    if (best.has(`${p}:brand`) && best.has(`${p}:creator`)) throw new MoneyFlowError(`${PARTY_LABEL[p]} is set on both the brand and the creator side: pick one`);
  }
  return { rules: [...best.values()], notes };
}

const ORDER: RuleParty[] = ['platform', 'brand_agency', 'creator_agency'];

/** Compute the complete, balanced flow for one deal. */
export function computeFlow(input: FlowInput): Flow {
  const { currency, mode, kind } = input;
  if (!(currency in MINOR_UNITS)) throw new MoneyFlowError(`Unsupported currency ${currency}`);
  if (mode !== 'creator_fee' && mode !== 'budget') throw new MoneyFlowError('mode must be creator_fee or budget');
  const amount = int(input.amountMinor, 'Amount');
  const locale = input.locale || 'en-IN';
  const fmt = (n: number) => formatMinor(n, currency, locale);
  const { rules, notes } = resolveRules(input.rules || [], kind, input.country);
  const sorted = rules.slice().sort((a, b) => ORDER.indexOf(a.party) - ORDER.indexOf(b.party));
  const brandSide = sorted.filter((r) => r.side === 'brand');
  const creatorSide = sorted.filter((r) => r.side === 'creator');

  const lines: FlowLine[] = [];
  const paid: Record<RuleParty, number> = { platform: 0, brand_agency: 0, creator_agency: 0 };
  const srcText = (r: FeeRule) => r.source === 'default' ? 'standard rate' : r.source === 'country' ? `${r.country} rate` : `agreement ${r.agreementId}`;

  // 1. Brand-side fees.
  let creatorGross: number;
  const base = amount;
  let brandSideTotal = 0;
  for (const r of brandSide) {
    const v = pctOf(base, r.bps || 0, mode === 'budget' ? 'floor' : 'half_up') + (r.fixedMinor || 0);
    if (!v) continue;
    brandSideTotal += v;
    paid[r.party] += v;
    const parts = [r.bps ? `${pctText(r.bps)} of the ${fmt(base)} ${mode === 'budget' ? 'budget' : 'creator fee'}` : '', r.fixedMinor ? `${fmt(r.fixedMinor)} fixed` : ''].filter(Boolean).join(' + ');
    lines.push({ key: `${r.party}:brand`, from: 'brand', to: r.party, amountMinor: v, label: r.label || PARTY_LABEL[r.party], why: `${parts} (${srcText(r)})`, ruleId: r.id });
  }
  if (mode === 'budget') {
    if (brandSideTotal >= amount && amount > 0) throw new MoneyFlowError(`Fees of ${fmt(brandSideTotal)} use up the whole ${fmt(amount)} budget`);
    creatorGross = amount - brandSideTotal;
  } else {
    creatorGross = amount;
  }

  // 2. Creator-side deductions, all computed on the creator's gross fee.
  let creatorDeductions = 0;
  for (const r of creatorSide) {
    const v = pctOf(creatorGross, r.bps || 0, 'half_up') + (r.fixedMinor || 0);
    if (!v) continue;
    creatorDeductions += v;
    paid[r.party] += v;
    const parts = [r.bps ? `${pctText(r.bps)} of the ${fmt(creatorGross)} creator fee` : '', r.fixedMinor ? `${fmt(r.fixedMinor)} fixed` : ''].filter(Boolean).join(' + ');
    lines.push({ key: `${r.party}:creator`, from: 'creator', to: r.party, amountMinor: v, label: r.label || PARTY_LABEL[r.party], why: `Deducted from the creator's fee: ${parts} (${srcText(r)})`, ruleId: r.id });
  }
  if (creatorDeductions > creatorGross) throw new MoneyFlowError(`Deductions of ${fmt(creatorDeductions)} exceed the ${fmt(creatorGross)} creator fee`);

  // 3. Taxes. Charges go on top of the brand's bill; withholdings come out of the recipient.
  let charged = 0, withheldCreator = 0;
  const withheldParty: Record<RuleParty, number> = { platform: 0, brand_agency: 0, creator_agency: 0 };
  for (const t of input.taxes || []) {
    const bps = bpsOf(t.bps, `Tax rate ${t.id}`);
    const baseAmt = t.on === 'creator' ? creatorGross - creatorDeductions : paid[t.on as RuleParty] || 0;
    const v = pctOf(baseAmt, bps, 'half_up');
    if (!v) continue;
    const onText = t.on === 'creator' ? "the creator's earnings" : `the ${PARTY_LABEL[t.on as RuleParty].toLowerCase()}`;
    if (t.mode === 'charge') {
      charged += v;
      lines.push({ key: `tax:${t.id}`, from: 'brand', to: 'tax_authority', amountMinor: v, label: t.label, why: `${pctText(bps)} on ${onText} (${fmt(baseAmt)}), added to the brand's bill`, ruleId: t.id });
    } else if (t.mode === 'withhold') {
      if (t.on === 'creator') withheldCreator += v; else withheldParty[t.on as RuleParty] += v;
      lines.push({ key: `tax:${t.id}`, from: t.on === 'creator' ? 'creator' : (t.on as Party), to: 'tax_authority', amountMinor: v, label: t.label, why: `${pctText(bps)} withheld from ${onText} (${fmt(baseAmt)}) and paid to the tax authority`, ruleId: t.id });
    } else throw new MoneyFlowError(`Tax ${t.id} must be charge or withhold`);
  }

  const creatorNet = creatorGross - creatorDeductions - withheldCreator;
  if (creatorNet < 0) throw new MoneyFlowError('Creator earnings would be negative');
  lines.push({ key: 'creator:net', from: 'brand', to: 'creator', amountMinor: creatorNet, label: 'Creator earnings', why: `${fmt(creatorGross)} fee` + (creatorDeductions ? ` − ${fmt(creatorDeductions)} commission` : '') + (withheldCreator ? ` − ${fmt(withheldCreator)} tax withheld` : ''), ruleId: null });

  const brandPays = mode === 'budget' ? amount + charged : amount + brandSideTotal + charged;
  const out: Flow = {
    currency, mode, kind,
    brandPaysMinor: brandPays,
    creatorGrossMinor: creatorGross,
    creatorNetMinor: creatorNet,
    platformMinor: paid.platform - withheldParty.platform,
    brandAgencyMinor: paid.brand_agency - withheldParty.brand_agency,
    creatorAgencyMinor: paid.creator_agency - withheldParty.creator_agency,
    taxMinor: charged + withheldCreator + withheldParty.platform + withheldParty.brand_agency + withheldParty.creator_agency,
    lines, rulesUsed: sorted, notes,
  };
  assertBalanced(out);
  return out;
}

/** Throws unless every unit the brand pays is accounted for exactly once. */
export function assertBalanced(f: Flow): void {
  const outTotal = f.creatorNetMinor + f.platformMinor + f.brandAgencyMinor + f.creatorAgencyMinor + f.taxMinor;
  if (outTotal !== f.brandPaysMinor) throw new MoneyFlowError(`Flow does not balance: brand pays ${f.brandPaysMinor}, paid out ${outTotal}`);
}

/**
 * Read commission defaults from the admin settings JSON (app_settings key 'money_flow').
 * Shape: { "rules": FeeRule[], "taxes": { "<COUNTRY>": TaxRule[] } }.
 * Returns empty lists when nothing is configured: the platform then charges nothing rather than
 * a guessed rate, and the admin screen shows "not configured".
 */
export function rulesFromSettings(json: string | null | undefined): { rules: FeeRule[]; taxes: Record<string, TaxRule[]>; configured: boolean } {
  if (!json) return { rules: [], taxes: {}, configured: false };
  let v: any;
  try { v = JSON.parse(json); } catch { throw new MoneyFlowError('Money flow settings are not valid JSON'); }
  const rules: FeeRule[] = Array.isArray(v?.rules) ? v.rules : [];
  const taxes: Record<string, TaxRule[]> = v?.taxes && typeof v.taxes === 'object' ? v.taxes : {};
  for (const r of rules) { bpsOf(r.bps, `Rate in rule ${r.id}`); if (r.fixedMinor != null) int(r.fixedMinor, `Fixed amount in rule ${r.id}`); }
  return { rules, taxes, configured: rules.length > 0 };
}
