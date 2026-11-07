import { SKILLS, LANGUAGES, CITIES } from './match';
import { NICHES } from './creators';

/** Structured needs pulled out of a client's free-text brief. */
export interface BriefNeeds {
  title: string;
  talent_types: string[];
  niche: string[];
  city: string[];
  languages: string[];
  gender: string | null;
  min_followers: number | null;
  max_followers: number | null;
  creators_needed: number | null;
  deliverables: string | null;
  budget_total: number | null;
  creator_brief: string;      // clean brief creators will read (no client budget)
  questions: string[];        // what the team should clarify with the client
}

const SYN: Array<[RegExp, string]> = [
  [/\b(danc\w*|bhangra|garba|kathak|bharatnatyam|choreograph\w*|hip ?hop)\b/i, 'Dancer'],
  [/\b(sing\w*|vocalist)\b/i, 'Singer'],
  [/\b(musician|guitar\w*|drummer|instrumentalist|dj)\b/i, 'Musician'],
  [/\b(rap\w*)\b/i, 'Rapper'],
  [/\b(comed\w*|stand ?up|funny|meme)\b/i, 'Comedian'],
  [/\b(actor|actress|acting)\b/i, 'Actor'],
  [/\b(model\w*)\b/i, 'Model'],
  [/\b(anchor|host|emcee|mc)\b/i, 'Anchor / Host'],
  [/\b(voice ?over|vo artist)\b/i, 'Voice-over artist'],
  [/\b(chef|cook\w*|recipe\w*|food\w*|baker)\b/i, 'Chef / Food creator'],
  [/\b(fitness|gym|trainer|workout)\b/i, 'Fitness coach'],
  [/\b(yoga)\b/i, 'Yoga instructor'],
  [/\b(makeup|mua)\b/i, 'Makeup artist'],
  [/\b(stylist|styling)\b/i, 'Fashion stylist'],
  [/\b(tech|gadget|unbox\w*)\b/i, 'Tech reviewer'],
  [/\b(gam(er|ing)|esports|bgmi)\b/i, 'Gamer'],
  [/\b(finance|stock|invest\w*|money)\b/i, 'Finance educator'],
  [/\b(doctor|dermat\w*|nutrition\w*|dietitian)\b/i, 'Doctor / Health expert'],
  [/\b(travel\w*)\b/i, 'Travel creator'],
  [/\b(mom|mother|parent\w*|dad)\b/i, 'Parent creator'],
  [/\b(pet|dog|cat)s?\b/i, 'Pet creator'],
  [/\b(athlete|cricketer|footballer|sportsperson)\b/i, 'Athlete'],
  [/\bugc\b/i, 'UGC creator'],
];

function amount(numStr: string, unit?: string): number {
  const n = parseFloat(numStr.replace(/,/g, ''));
  const u = (unit || '').toLowerCase();
  const mult = /^k/.test(u) ? 1e3 : /^(l|lac|lakh)/.test(u) ? 1e5 : /^m/.test(u) ? 1e6 : /^(cr|crore)/.test(u) ? 1e7 : 1;
  return Math.round(n * mult);
}

/** Keyword extraction — always works, no AI needed. */
export function rulesExtract(text: string): BriefNeeds {
  const t = ` ${text} `;
  const talent = [...new Set(SYN.filter(([re]) => re.test(t)).map(([, s]) => s))];
  const city = CITIES.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(t) || (c === 'Bengaluru' && /\bbangalore\b/i.test(t)) || (c === 'Gurugram' && /\bgurgaon\b/i.test(t)));
  const languages = LANGUAGES.filter((l) => new RegExp(`\\b${l}\\b`, 'i').test(t));
  const niche = NICHES.filter((n) => new RegExp(`\\b${n.split(' ')[0]}\\b`, 'i').test(t));
  const gender = /\b(female|women|woman|girls?|ladies)\b/i.test(t) && !/\b(male|men|boys?)\b/i.test(t.replace(/female|women/gi, '')) ? 'Female'
    : /\b(male|men|boys?|guys)\b/i.test(t.replace(/female|women/gi, '')) && !/\b(female|women|girls?)\b/i.test(t) ? 'Male' : null;
  let min: number | null = null, max: number | null = null;
  const fol = t.match(/(\d[\d,.]*)\s*(k|l|lac|lakh|m|cr)?\s*\+?\s*(followers|follower|subs)/i) || t.match(/(\d[\d,.]*)\s*(k|l|lac|lakh|m)\s*\+/i);
  if (fol) min = amount(fol[1], fol[2]);
  const range = t.match(/(\d[\d,.]*)\s*(k|l|lac|lakh|m)?\s*(?:-|to|–)\s*(\d[\d,.]*)\s*(k|l|lac|lakh|m)\s*(followers)?/i);
  if (range && (range[5] || /follow/i.test(t))) { min = amount(range[1], range[2] || range[4]); max = amount(range[3], range[4]); }
  if (/\bnano\b/i.test(t)) { min ??= 1000; max ??= 10000; }
  if (/\bmicro\b/i.test(t)) { min ??= 10000; max ??= 100000; }
  if (/\bmacro\b/i.test(t)) { min ??= 500000; }
  const bud = t.match(/(?:\bbudget\b|₹|\brs\.?|\binr\b)\s*(?:of|is|:)?\s*₹?\s*(\d[\d,.]*)\s*(k|l|lac|lakh|cr|crore)?/i);
  const cnt = t.match(/\b(\d{1,3})\s+(?:\w+\s+){0,2}(creators|influencers|dancers|singers|models|people|artists|comedians|chefs|moms)\b/i);
  const deliv = (t.match(/\b(\d+\s*(?:reels?|stories|story|posts?|videos?|shorts?)(?:\s*(?:\+|and|&|,)\s*\d+\s*(?:reels?|stories|story|posts?|videos?|shorts?))*)/i) || [])[1] || null;
  return {
    title: (talent[0] ? `${talent[0]}s` : 'Creators') + (city[0] ? ` in ${city[0]}` : '') + ' wanted',
    talent_types: talent, niche, city, languages, gender,
    min_followers: min, max_followers: max,
    creators_needed: cnt ? Number(cnt[1]) : null,
    deliverables: deliv,
    budget_total: bud ? amount(bud[1], bud[2]) : null,
    creator_brief: text.replace(/(\b(budget|rs\.?|inr)\b|₹)[^.\n]*\.?/gi, '').replace(/\s{2,}/g, ' ').replace(/[, ]*(total|our|the)?\s*$/i, '').trim(),
    questions: [],
  };
}

/** AI extraction with the rules result as a floor. */
export async function extractNeeds(env: Env, text: string): Promise<{ needs: BriefNeeds; engine: 'ai' | 'rules'; note?: string }> {
  const base = rulesExtract(text);
  if (!env.ANTHROPIC_API_KEY) return { needs: base, engine: 'rules' };
  const prompt = `You turn an Indian brand's influencer brief into structured requirements for Colatch's matching engine.
Use ONLY these talent types (pick the ones the brief truly needs; empty if any creator works): ${SKILLS.join(', ')}.
Niches from: ${NICHES.join(', ')}. Languages from: ${LANGUAGES.join(', ')}. Cities as plain city names (empty = anywhere).
Brief:
"""${text.slice(0, 4000)}"""
Return ONLY JSON: {"title": short opportunity title creators see (max 8 words, no budget), "talent_types": [], "niche": [], "city": [], "languages": [], "gender": "Female"|"Male"|null, "min_followers": int|null, "max_followers": int|null, "creators_needed": int|null, "deliverables": string|null, "budget_total": int INR|null, "creator_brief": 2-4 sentence brief written for creators — what the brand wants, the vibe, deliverables, dates; never mention the client's total budget, "questions": [up to 4 things the agency must clarify with the client]}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = (await res.json()) as any;
    if (!res.ok) throw new Error(j?.error?.message || `AI error ${res.status}`);
    const txt: string = j.content?.map((c: any) => c.text || '').join('') || '';
    const p = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const arr = (v: unknown, allowed?: string[]) => (Array.isArray(v) ? v.map(String).filter((x) => !allowed || allowed.includes(x)) : []);
    const num = (v: unknown) => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v)));
    return {
      engine: 'ai',
      needs: {
        title: String(p.title || base.title).slice(0, 90),
        talent_types: arr(p.talent_types, SKILLS),
        niche: arr(p.niche, NICHES),
        city: arr(p.city),
        languages: arr(p.languages, LANGUAGES),
        gender: p.gender === 'Female' || p.gender === 'Male' ? p.gender : null,
        min_followers: num(p.min_followers) ?? base.min_followers,
        max_followers: num(p.max_followers) ?? base.max_followers,
        creators_needed: num(p.creators_needed) ?? base.creators_needed,
        deliverables: p.deliverables ? String(p.deliverables) : base.deliverables,
        budget_total: num(p.budget_total) ?? base.budget_total,
        creator_brief: String(p.creator_brief || base.creator_brief),
        questions: arr(p.questions).slice(0, 4),
      },
    };
  } catch (e) {
    return { needs: base, engine: 'rules', note: e instanceof Error ? e.message : 'AI failed' };
  }
}

export function slugify(s: string): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'brief';
  const rnd = crypto.getRandomValues(new Uint8Array(3));
  return `${base}-${[...rnd].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Shortlist promise: two working days (18 working hours, Mon–Sat 10am–7pm IST) from now. Returns an ISO time. */
export function shortlistDue(from = new Date(), hours = 18): string {
  const IST = 5.5 * 36e5;
  let t = new Date(from.getTime() + IST); // work in IST wall-clock
  let left = hours * 60;
  const open = 10, close = 19;
  while (left > 0) {
    const day = t.getUTCDay(), h = t.getUTCHours() + t.getUTCMinutes() / 60;
    if (day === 0 || h >= close) { t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, open)); continue; }
    if (h < open) { t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), open)); continue; }
    const step = Math.min(left, (close - h) * 60);
    t = new Date(t.getTime() + step * 6e4); left -= step;
  }
  return new Date(t.getTime() - IST).toISOString();
}

export function formatIST(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
