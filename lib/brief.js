// Brief → structured answers. Shared by /api/brief (server) and nothing else; pure functions, no I/O.
// The regex reader always runs; when GEMINI_API_KEY is set, lib/ai.js layers a model read on top and
// we keep only values that are exact options from QUESTIONS, so the matcher never sees free text.
import { QUESTIONS, CATEGORIES, domainToName } from "./engine";

export const BRIEF_KEYS = QUESTIONS.map((q) => q.k);
export const OPTIONS = Object.fromEntries(QUESTIONS.map((q) => [q.k, q.o]));
export const LABELS = {
  category: "Category", budget: "Budget band", want: "Face type", age: "Core audience", goal: "Campaign goal",
  platform: "Platform", geo: "Reach", lang: "Language", risk: "Controversy risk", price: "Price position",
  arch: "Brand feeling", time: "Timeline",
};

const CAT_RE = [
  ["Beauty & Skincare", /skin ?care|serum|moisturi[sz]er|cosmetic|make-?up|lipstick|beauty|sunscreen|hair ?care|shampoo|fragrance|perfume/],
  ["Fashion & Apparel", /apparel|clothing|fashion|athleisure|activewear|sneaker|footwear|t-?shirt|denim|ethnic wear|kurta|saree/],
  ["Food & Beverage", /snack|beverage|drink|coffee|\btea\b|food|restaurant|masala|spice|chocolate|juice|dairy|bakery|\bqsr\b/],
  ["Fintech & BFSI", /loan|credit card|insurance|invest|mutual fund|\bbank|payment|\bupi\b|trading|fintech|wealth|forex|\bnbfc\b/],
  ["Health & Wellness", /wellness|supplement|protein|ayurved|nutrition|vitamin|health|fitness|\bgym\b|yoga|clinic|pharma/],
  ["Auto & EV", /\bev\b|electric vehicle|scooter|motorcycle|\bcar\b|\bcars\b|automobile|tyre|two-?wheeler|mobility/],
  ["Real Estate", /real estate|apartment|villa|property|realty|township|plots|\bbhk\b/],
  ["Tech / SaaS", /saas|software|\bapi\b|cloud|\bai\b|automation|\bcrm\b|analytics|smartphone|laptop|gadget/],
  ["Jewellery & Luxury", /jewell?ery|diamond|\bgold\b|silver|luxury|watch(es)?\b|bridal/],
  ["Education", /course|edtech|school|academy|exam|coaching|university|tutor|upskill/],
  ["D2C / E-commerce", /\bd2c\b|e-?commerce|marketplace|online store|quick commerce/],
];

// ₹ amounts → rupees. "₹6L", "6 lakh", "1.5 Cr", "60,00,000", "Rs 25 lakhs"
export function rupees(s) {
  const m = String(s).toLowerCase().replace(/,/g, "").match(/([\d.]+)\s*(cr|crore|crores|l|lac|lakh|lakhs|k|thousand)?\b/);
  if (!m) return 0;
  const v = parseFloat(m[1]); if (!isFinite(v)) return 0;
  const u = m[2] || "";
  return /^cr/.test(u) ? v * 1e7 : /^(l|lac|lakh)/.test(u) ? v * 1e5 : /^(k|thousand)/.test(u) ? v * 1e3 : v;
}
export function budgetBand(r) {
  if (!r) return null;
  return r < 25e5 ? "Starter (₹8–25 L)" : r < 60e5 ? "Growth (₹25–60 L)" : r < 1.2e7 ? "Scale (₹60 L–1.2 Cr)" : "Flagship (₹1.2 Cr+)";
}

function pick(hay, rules) { for (const [opt, re, conf = "high"] of rules) if (re.test(hay)) return [opt, conf]; return null; }

export function regexRead(text) {
  const raw = String(text || "").slice(0, 20000);
  const hay = " " + raw.toLowerCase().replace(/\s+/g, " ") + " ";
  const out = {}; const conf = {};
  const set = (k, r) => { if (r) { out[k] = r[0]; conf[k] = r[1]; } };

  // category — most keyword hits wins
  let best = 0, cat = null;
  for (const [c, re] of CAT_RE) { const n = (hay.match(new RegExp(re.source, "g")) || []).length; if (n > best) { best = n; cat = c; } }
  if (cat) set("category", [cat, best > 1 ? "high" : "medium"]);

  // budget — the biggest ₹ figure that sits next to budget/fee/spend words, else the biggest ₹ figure
  const money = [...hay.matchAll(/(?:₹|rs\.?|inr)\s*([\d.,]+\s*(?:cr|crore|crores|l|lac|lakh|lakhs|k)?)|([\d.,]+\s*(?:cr|crore|crores|lakh|lakhs|lac))\b/g)]
    .map((m) => ({ v: rupees(m[1] || m[2]), at: m.index }));
  if (money.length) {
    const near = money.filter((m) => /budget|spend|fee|cost|investment/.test(hay.slice(Math.max(0, m.at - 40), m.at + 10)));
    const v = Math.max(...(near.length ? near : money).map((m) => m.v));
    if (v >= 1e5) set("budget", [budgetBand(v), near.length ? "high" : "medium"]);
  }

  set("want", pick(hay, [
    ["Youth energy", /gen ?z|youth|young|college|energetic|trendy|cool\b/],
    ["Glamour", /glam|glamour|aspirational|luxur|premium face|star power|red carpet/],
    ["Mass trust", /mass trust|household|trusted face|trustworthy|credib.*mass|pan-india trust|family favourite/],
    ["Everyday credibility", /credib|relatable|everyday|authentic|expert|doctor|explain/, "medium"],
  ]));
  set("age", pick(hay, [
    ["Gen Z (18–24)", /gen ?z|\b1[6-9]\s*[–-]\s*2[0-5]\b|college students|teen/],
    ["Young adults (25–34)", /\b2[0-5]\s*[–-]\s*3[0-9]\b|millennial|young professionals|young adults|first jobbers/],
    ["Families (35–50)", /famil|parents|mothers|moms|homemaker|\b3[5-9]\s*[–-]\s*[4-5][0-9]\b/],
    ["All ages / mass", /all ages|mass audience|everyone|mass market/],
  ]));
  set("goal", pick(hay, [
    ["Sales / conversion", /sales|conversion|performance|roas|drive purchases|sell-?through|orders/],
    ["Repositioning", /reposition|rebrand|new image|change perception/],
    ["Trust / credibility", /build trust|credibility|reassur|trust in/],
    ["Awareness / reach", /awareness|launch|reach|visibility|recall|introduce/],
  ]));
  set("platform", pick(hay, [
    ["TV + digital", /\btv\b|tvc|television|broadcast/],
    ["On-ground + digital", /on-?ground|event|activation|store launch|in-?store|appearance/],
    ["YouTube", /youtube|\byt\b/],
    ["Instagram / Reels", /instagram|reels?\b|\big\b|social media/],
  ]));
  set("geo", pick(hay, [
    ["Tier 2 & 3", /tier ?(2|ii|two)|tier ?(3|iii|three)|small towns|bharat/],
    ["Metro cities", /metro|tier ?1\b|tier one|mumbai|delhi|bengaluru|bangalore/, "medium"],
    ["Regional focus", /regional|south india|north india|gujarat|maharashtra|punjab|bengal|kerala|tamil nadu/],
    ["Pan-India", /pan-?india|national|nationwide|across india/],
  ]));
  set("lang", pick(hay, [
    ["South Indian", /tamil|telugu|kannada|malayalam|south indian/],
    ["Punjabi / North", /punjabi|haryanvi/],
    ["Marathi / Bengali", /marathi|bengali|bangla/],
    ["Multi-language", /multi-?lingual|multiple languages|multi-?language/],
    ["English-first", /english/, "medium"],
    ["Hindi-first", /hindi|hinglish/, "medium"],
  ]));
  const langs = ["hindi", "english", "tamil", "telugu", "kannada", "malayalam", "punjabi", "marathi", "bengali", "gujarati", "odia", "assamese"].filter((l) => hay.includes(l));
  if (langs.length >= 2 && !(langs.length === 2 && langs.includes("hindi") && langs.includes("english"))) set("lang", ["Multi-language", "high"]);
  set("risk", pick(hay, [
    ["Very low — safest faces only", /no controvers|zero controvers|safe|family-?friendly|clean image|brand-?safe/],
    ["Higher — bolder bets ok", /bold|edgy|disrupt|provocative|risk is fine/],
  ]));
  set("price", pick(hay, [
    ["Luxury", /luxury|ultra-?premium|high jewellery/], ["Premium", /premium|upmarket/],
    ["Value / mass", /affordable|value|budget-?friendly|mass market|low price/], ["Mid-market", /mid-?market|mid-?range/],
  ]));
  set("arch", pick(hay, [
    ["Glamorous & premium", /glamor|glamour|luxur/], ["Bold & aspirational", /bold|aspiration|ambitio/],
    ["Warm & everyday", /warm|everyday|relatable|homely/], ["Trustworthy & dependable", /trust|dependab|reliab/],
  ]));
  set("time", pick(hay, [
    ["ASAP (< 1 month)", /asap|urgent|this month|next week|in \d+ (days|weeks)|immediately/],
    ["1–3 months", /next quarter|\b[1-3] months?|q[1-4]\b|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/],
    ["Flexible", /flexible|no rush|open timeline/],
  ]));

  // brand name — explicit label first, then "for <Name>" / "launching <Name>"
  let name = null;
  const STOP = /^(Instagram|YouTube|Reels?|TV|TVC|Gen|Diwali|Navratri|Holi|Eid|Christmas|India|Indian|Mumbai|Delhi|Bengaluru|Bangalore|Q[1-4]|Women|Men|The|Our|Their|A|An|Hindi|English|Tier|Metro|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|Need|We|Launching)\b/;
  const lab = raw.match(/\b(?:[Bb]rand(?: [Nn]ame)?|[Cc]lient|[Cc]ompany|[Bb]rief)\s*[:\-–]\s*([A-Z0-9][\w&']*(?:[ \t]+[A-Z][\w&']*){0,3})/);
  const form = [...raw.matchAll(/\b(?:for|launching|introducing|by)\s+([A-Z][\w&']+(?:[ \t]+[A-Z][\w&']+){0,2})/g)].map((m) => m[1]).filter((x) => !STOP.test(x))[0];
  const url = raw.match(/\b([a-z0-9-]+\.(?:in|com|co|co\.in|io|shop|store))\b/i);
  if (lab) name = lab[1].trim().replace(/[.]+$/, ""); else if (form) name = form.trim().replace(/[.]+$/, ""); else if (url) name = domainToName(url[1]);
  return { answers: out, confidence: conf, name };
}

// Keep only exact options; drop everything else.
export function clean(answers = {}) {
  const o = {};
  for (const k of BRIEF_KEYS) if (answers[k] && OPTIONS[k].includes(answers[k])) o[k] = answers[k];
  return o;
}

// Build the review table the UI shows: one row per question, with the value, how sure we are and where it came from.
export function reviewRows(answers, confidence = {}, base = {}) {
  return BRIEF_KEYS.map((k) => ({
    k, label: LABELS[k], value: answers[k] || base[k] || "",
    conf: answers[k] ? (confidence[k] || "medium") : base[k] ? "kept" : "missing",
    required: ["category", "budget"].includes(k),
  }));
}

export function summarise(name, a) {
  const bits = [a.category, a.age && a.age.split(" (")[0].toLowerCase(), a.goal && a.goal.split(" / ")[0].toLowerCase(), a.platform && "on " + a.platform.split(" /")[0]].filter(Boolean);
  return `${name || "This brand"} — ${bits.join(", ") || "brief read from your text"}. The right face should fit the budget, speak to that audience and carry no competing category association.`;
}

export { CATEGORIES };
