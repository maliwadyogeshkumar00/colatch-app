/**
 * Pre-publish brand-safety and ad-rule checks on a brief (India).
 * Flags are for the Colatch team; they never block on their own.
 * Based on ASCI influencer guidelines, the Department of Consumer Affairs endorsement
 * guidelines, and SEBI rules for finance content. Not legal advice — the team decides.
 */
export interface Flag { level: 'block' | 'stop' | 'check'; title: string; detail: string; }

const RULES: Array<{ re: RegExp; flag: Flag }> = [
  { re: /\b(betting|bet\b|satta|casino|poker|rummy|real[- ]money|fantasy (cricket|sports|app)|gambl\w*|teen ?patti|aviator)\b/i,
    flag: { level: 'block', title: 'Betting or real-money gaming', detail: 'Advertising real-money games and betting is an offence under the Online Gaming Act, in force since May 2026, and creators are liable too. Colatch does not run these campaigns.' } },
  { re: /\b(crypto\w*|bitcoin|token sale|nft|web3)\b/i,
    flag: { level: 'check', title: 'Crypto / VDA', detail: 'Virtual digital asset ads need the ASCI risk disclaimer, and creators should not promise returns.' } },
  { re: /\b(stock tips?|trading (course|call|signal)s?|guaranteed returns?|mutual fund|demat|intraday|f&o|options trading|ipo)\b/i,
    flag: { level: 'check', title: 'Finance content (SEBI)', detail: 'Since October 2024, SEBI-regulated brands may not work with unregistered finfluencers, and creators giving investment advice must be SEBI-registered. Check registration first.' } },
  { re: /\b(alcohol|whisk(e)?y|vodka|beer|wine|rum|liquor|surrogate|tobacco|cigarette|vape|gutkha|pan masala)\b/i,
    flag: { level: 'stop', title: 'Alcohol / tobacco (incl. surrogate)', detail: 'Direct ads are banned and surrogate ads (soda, music CDs) are tightly policed. Get legal sign-off and keep creators aged 25+.' } },
  { re: /\b(cures?|weight ?loss|fat ?burn|fairness|skin ?whiten\w*|diabet\w*|immunity boost\w*|ayurvedic medicine|supplement|clinically proven)\b/i,
    flag: { level: 'check', title: 'Health or efficacy claims', detail: 'Health creators should have the right qualification, and claims need proof from the brand. Avoid "cure" and "fairness" language.' } },
  { re: /\b(kids?|children|toddler|baby|school ?students?|minor|under ?18|teen(ager)?s?)\b/i,
    flag: { level: 'check', title: 'Children involved', detail: 'Minor creators need verified parental consent (DPDP Act), and ads aimed at children have stricter ASCI rules.' } },
  { re: /\b(political|election|party|candidate|vote)\b/i,
    flag: { level: 'check', title: 'Political content', detail: 'Political ads have separate disclosure and Election Commission rules. Most brands should avoid them.' } },
];

export function checkBrief(text: string): Flag[] {
  const t = String(text || '');
  const out: Flag[] = [];
  for (const r of RULES) if (r.re.test(t) && !out.some((f) => f.title === r.flag.title)) out.push(r.flag);
  return out;
}

/** The disclosure line every creator sees on every brief. */
export const DISCLOSURE_LINE = 'Start the caption with "Ad" or "Paid partnership" and turn on Instagram\'s paid-partnership label. This is required under ASCI rules even for product-only deals.';
