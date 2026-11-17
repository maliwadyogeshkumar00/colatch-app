/**
 * Audience demographics per creator (schema v6: creators.audience JSONB, audience_source, audience_updated_at).
 *
 * Until an official Instagram API is connected, creators type the split from their own Instagram Insights:
 * top cities with %, gender split and age bands. The team can mark a split "checked against screenshot".
 * Everything here is pure (no database), so the deal room and the finder can import it freely.
 *
 * Stored shape (version 1):
 *   { v: 1, cities: [{ name, pct }], gender: { women, men, other } | null, age: { '13-17': n, ... } | null,
 *     top_city: string | null, core_age: string | null }
 * top_city and core_age are derived on save so SQL filters can use them directly.
 */

export const AGE_BANDS = ['13-17', '18-24', '25-34', '35-44', '45+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export const GENDER_KEYS = ['women', 'men', 'other'] as const;
export const MAX_CITIES = 5;
/** Insights rounds each figure, so a group may total 97–103 and still be right. */
export const SUM_TOLERANCE = 3;
export const AUDIENCE_SOURCES = ['self_reported', 'team_checked'] as const;

export interface AudienceCity { name: string; pct: number }
export interface Audience {
  v: 1;
  cities: AudienceCity[];
  gender: { women: number; men: number; other: number } | null;
  age: Record<AgeBand, number> | null;
  top_city: string | null;
  core_age: AgeBand | null;
}

/** Form field names, shared by the creator form and the parser. */
export const ageField = (b: string) => 'age_' + b.replace('+', 'plus').replace('-', '_');
export const cityField = (i: number) => `aud_city_${i}`;
export const cityPctField = (i: number) => `aud_city_pct_${i}`;
export const genderField = (k: string) => `aud_${k}`;

type Getter = { get(k: string): unknown };
const getter = (src: Getter | Record<string, unknown>): ((k: string) => unknown) =>
  typeof (src as Getter).get === 'function' ? (k) => (src as Getter).get(k) : (k) => (src as Record<string, unknown>)[k];

/** "31", "31.5", "31%", " 31 % " → 31.5; blank → null; anything else → NaN. */
export function pct(v: unknown): number | null {
  const s = String(v ?? '').replace(/%/g, '').replace(',', '.').trim();
  if (!s) return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: number[]) => round1(xs.reduce((a, b) => a + b, 0));
const cleanCity = (s: unknown) => String(s ?? '').replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

/**
 * Read the audience form. Returns the audience to store, or the problems to show the creator.
 * Every group is optional, but at least one must be filled; a filled group must be complete and add up.
 */
export function parseAudience(src: Getter | Record<string, unknown>): { audience: Audience | null; errors: string[] } {
  const g = getter(src);
  const errors: string[] = [];
  const bad = (n: number | null) => n != null && (isNaN(n) || n < 0 || n > 100);

  // Cities: up to 5, each with a share. Top cities never cover everyone, so they only need to total 100 or less.
  const cities: AudienceCity[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= MAX_CITIES; i++) {
    const name = cleanCity(g(cityField(i)));
    const p = pct(g(cityPctField(i)));
    if (!name && p == null) continue;
    if (!name) { errors.push(`City ${i}: add the city name for ${p}%.`); continue; }
    if (p == null) { errors.push(`City ${i}: add the % for ${name}.`); continue; }
    if (bad(p)) { errors.push(`City ${i}: the % must be a number from 0 to 100.`); continue; }
    if (seen.has(name.toLowerCase())) { errors.push(`${name} is listed twice.`); continue; }
    seen.add(name.toLowerCase());
    cities.push({ name, pct: round1(p as number) });
  }
  if (cities.length && sum(cities.map((c) => c.pct)) > 100 + SUM_TOLERANCE)
    errors.push(`Your top cities add up to ${sum(cities.map((c) => c.pct))}%. They can't be more than 100%.`);
  cities.sort((a, b) => b.pct - a.pct);

  // Gender: women + men + other ≈ 100.
  const gv = GENDER_KEYS.map((k) => pct(g(genderField(k))));
  let gender: Audience['gender'] = null;
  if (gv.some((x) => x != null)) {
    if (gv.some(bad)) errors.push('Gender: each % must be a number from 0 to 100.');
    else {
      const [women, men, other] = gv.map((x) => round1(x ?? 0));
      const t = sum([women, men, other]);
      if (Math.abs(t - 100) > SUM_TOLERANCE) errors.push(`Gender adds up to ${t}%. It should be about 100% (women + men + other).`);
      else gender = { women, men, other };
    }
  }

  // Age bands ≈ 100.
  const av = AGE_BANDS.map((b) => pct(g(ageField(b))));
  let age: Audience['age'] = null;
  if (av.some((x) => x != null)) {
    if (av.some(bad)) errors.push('Age: each % must be a number from 0 to 100.');
    else {
      const vals = av.map((x) => round1(x ?? 0));
      const t = sum(vals);
      if (Math.abs(t - 100) > SUM_TOLERANCE) errors.push(`Age groups add up to ${t}%. They should be about 100%.`);
      else age = Object.fromEntries(AGE_BANDS.map((b, i) => [b, vals[i]])) as Record<AgeBand, number>;
    }
  }

  if (!errors.length && !cities.length && !gender && !age) errors.push('Fill in at least one part: top cities, gender or age.');
  if (errors.length) return { audience: null, errors };
  return { audience: build(cities, gender, age), errors: [] };
}

function build(cities: AudienceCity[], gender: Audience['gender'], age: Audience['age']): Audience {
  return { v: 1, cities, gender, age, top_city: cities[0]?.name ?? null, core_age: age ? coreAgeOf(age) : null };
}

function coreAgeOf(age: Record<string, number>): AgeBand | null {
  let best: AgeBand | null = null, hi = 0;
  for (const b of AGE_BANDS) if ((age[b] ?? 0) > hi) { hi = age[b]; best = b; }
  return best;
}

/**
 * Turn whatever the database returned (JSONB object, JSON string, null, or junk) into a clean Audience or null.
 * Re-validates, so a hand-edited row can never break a page.
 */
export function readAudience(raw: unknown): Audience | null {
  let a: any = raw;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { return null; } }
  if (!a || typeof a !== 'object') return null;
  const num = (x: unknown) => { const n = Number(x); return isFinite(n) && n >= 0 && n <= 100 ? round1(n) : null; };
  const cities = (Array.isArray(a.cities) ? a.cities : [])
    .map((c: any) => ({ name: cleanCity(c?.name), pct: num(c?.pct) }))
    .filter((c: any) => c.name && c.pct != null)
    .slice(0, MAX_CITIES)
    .sort((x: AudienceCity, y: AudienceCity) => y.pct - x.pct) as AudienceCity[];
  let gender: Audience['gender'] = null;
  if (a.gender && typeof a.gender === 'object') {
    const [women, men, other] = GENDER_KEYS.map((k) => num(a.gender[k]) ?? 0);
    if (women + men + other > 0) gender = { women, men, other };
  }
  let age: Audience['age'] = null;
  if (a.age && typeof a.age === 'object') {
    const vals = AGE_BANDS.map((b) => num(a.age[b]) ?? 0);
    if (vals.some((v) => v > 0)) age = Object.fromEntries(AGE_BANDS.map((b, i) => [b, vals[i]])) as Record<AgeBand, number>;
  }
  if (!cities.length && !gender && !age) return null;
  return build(cities, gender, age);
}

/** Form defaults for the creator's audience form. */
export function audienceFormValues(raw: unknown): Record<string, string> {
  const a = readAudience(raw);
  const out: Record<string, string> = {};
  if (!a) return out;
  a.cities.forEach((c, i) => { out[cityField(i + 1)] = c.name; out[cityPctField(i + 1)] = String(c.pct); });
  if (a.gender) GENDER_KEYS.forEach((k) => { out[genderField(k)] = String(a.gender![k]); });
  if (a.age) AGE_BANDS.forEach((b) => { out[ageField(b)] = String(a.age![b]); });
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "16 Nov 2026" in India time. Fixed month names, so every Node/ICU version prints the same. */
export function shortDate(v: unknown): string {
  if (v == null || v === '') return '';
  // Accepts a Date, ISO text, Postgres timestamptz text ("2026-11-16 10:00:00.5+00") or the app's UTC text ("2026-11-16 10:00:00").
  let t = String(v).trim().replace(' ', 'T');
  if (t.includes('T')) {
    t = t.replace(/(T[\d:.]+[+-]\d{2})$/, '$1:00');
    if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(t)) t += 'Z';
  }
  const d = v instanceof Date ? v : new Date(t);
  if (isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/** The label shown wherever the split appears, e.g. "Self-reported from Instagram Insights · updated 16 Nov 2026". */
export function audienceSourceLabel(creator: { audience_source?: string | null; audience_updated_at?: unknown }): string {
  const when = shortDate(creator?.audience_updated_at);
  const base = creator?.audience_source === 'team_checked'
    ? 'From Instagram Insights, checked against a screenshot by Colatch'
    : 'Self-reported from Instagram Insights';
  return when ? `${base} · updated ${when}` : base;
}

/** Lines ready to render: [{ label, pct }] per group, largest first for cities. */
export function formatAudience(raw: unknown): null | {
  cities: Array<{ label: string; pct: number }>;
  gender: Array<{ label: string; pct: number }>;
  age: Array<{ label: string; pct: number }>;
} {
  const a = readAudience(raw);
  if (!a) return null;
  return {
    cities: a.cities.map((c) => ({ label: c.name, pct: c.pct })),
    gender: a.gender ? [{ label: 'Women', pct: a.gender.women }, { label: 'Men', pct: a.gender.men }, { label: 'Other', pct: a.gender.other }].filter((x) => x.pct > 0) : [],
    age: a.age ? AGE_BANDS.map((b) => ({ label: b, pct: a.age![b] })) : [],
  };
}

const fmt = (n: number) => String(Math.round(n));

/**
 * One short line for cards and deal rooms, e.g. "62% women · 18-24 · Mumbai 31%". Empty string when there is no data.
 * Accepts a creator row ({ audience }) or the audience itself.
 */
export function audienceSummary(creator: unknown): string {
  const raw = creator && typeof creator === 'object' && 'audience' in (creator as any) ? (creator as any).audience : creator;
  const a = readAudience(raw);
  if (!a) return '';
  const parts: string[] = [];
  if (a.gender) {
    const { women, men } = a.gender;
    if (women >= men && women > 0) parts.push(`${fmt(women)}% women`);
    else if (men > 0) parts.push(`${fmt(men)}% men`);
  }
  if (a.core_age) parts.push(a.core_age);
  if (a.cities[0]) parts.push(`${a.cities[0].name} ${fmt(a.cities[0].pct)}%`);
  return parts.join(' · ');
}

/**
 * How alike two audiences are, 0–1, from gender and age splits (the parts every creator can read off Insights),
 * plus a small bonus for shared top cities. null when the two have nothing comparable.
 */
export function audienceSimilarity(x: unknown, y: unknown): number | null {
  const a = readAudience(x), b = readAudience(y);
  if (!a || !b) return null;
  const parts: number[] = [];
  if (a.gender && b.gender) parts.push(1 - GENDER_KEYS.reduce((s, k) => s + Math.abs(a.gender![k] - b.gender![k]), 0) / 200);
  if (a.age && b.age) parts.push(1 - AGE_BANDS.reduce((s, k) => s + Math.abs(a.age![k] - b.age![k]), 0) / 200);
  if (a.cities.length && b.cities.length) {
    const B = new Set(b.cities.map((c) => c.name.toLowerCase()));
    const shared = a.cities.filter((c) => B.has(c.name.toLowerCase())).length;
    parts.push(shared / Math.min(a.cities.length, b.cities.length));
  }
  if (!parts.length) return null;
  return Math.max(0, Math.min(1, parts.reduce((s, v) => s + v, 0) / parts.length));
}
