/**
 * Keeps brand ↔ creator contact on Colatch until a deal is signed.
 * Redacts phone numbers, emails, Instagram handles, links and "DM me / WhatsApp me" lines
 * from anything one side writes for the other to read (briefs, pitches, notes, feedback).
 */

const HIDDEN = '[contact hidden by Colatch]';

const PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g,                                       // emails
  /(?:\+?91[\s-]?)?(?:\(?0?\)?[\s-]?)?[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, // Indian mobiles in any spacing
  /\b\d[\d\s-]{8,}\d\b/g,                                            // long digit runs (other phone formats)
  /\b(?:https?:\/\/|www\.)\S+/gi,                                    // links
  /\b(?:wa\.me|t\.me|bit\.ly|linktr\.ee|instagram\.com|facebook\.com|fb\.me)\/\S*/gi,
  /(?:^|\s)@[A-Za-z0-9._]{3,30}\b/g,                                 // @handles
  /\b(?:whats\s?app|watsapp|wapp|telegram|call|ping|dm|text|message)\s+(?:me|us)\b[^.\n]*/gi, // "DM me on…"
];

export interface Scrub { text: string; found: number; }

export function scrubContacts(input: string | null | undefined, allow: string[] = []): Scrub {
  let text = String(input ?? '');
  let found = 0;
  for (const re of PATTERNS) {
    text = text.replace(re, (m) => {
      const t = m.trim();
      if (allow.some((a) => a && t.toLowerCase().includes(a.toLowerCase()))) return m;
      found++;
      return (m.startsWith(' ') || m.startsWith('\n') ? m[0] : '') + HIDDEN;
    });
  }
  text = text.replace(new RegExp(`(?:${HIDDEN.replace(/[[\]]/g, '\\$&')}\\s*){2,}`, 'g'), HIDDEN + ' ');
  return { text: text.trim(), found };
}

/** Brand name creators see before they accept the deal terms. */
export function blindBrand(k: { brand_category?: string | null; niche?: string | null }): string {
  if (k.brand_category) return k.brand_category;
  const n = String(k.niche || '').split(',')[0].trim();
  return n ? `A ${n.toLowerCase()} brand` : 'A verified brand';
}
