// Matching engine — shared by the browser (live preview while answering) and /api/match (final ranking).

export const CATEGORIES = [
  "Beauty & Skincare", "Fashion & Apparel", "Food & Beverage", "Fintech & BFSI",
  "D2C / E-commerce", "Health & Wellness", "Auto & EV", "Real Estate",
  "Tech / SaaS", "Jewellery & Luxury", "Education", "Other",
];

export const FIELDS = [
  ["all", "All faces"], ["film", "Film"], ["tv", "TV & OTT"], ["cricket", "Cricket"], ["sports", "Sport"],
  ["singers", "Music"], ["comedy", "Comedy"], ["creators", "Creators"], ["regional", "Regional"],
];

export const TIER_PRICE = {
  Starter: { band: "₹8–25 L", reach: "20–40M", recall: "+15–25%" },
  Growth: { band: "₹25–60 L", reach: "60–90M", recall: "+30–45%" },
  Scale: { band: "₹60 L–1.2 Cr", reach: "90–160M", recall: "+40–55%" },
  Flagship: { band: "₹1.2 Cr+", reach: "150M+", recall: "+50%+" },
};

export const BUDGET_TIERS = {
  "Starter (₹8–25 L)": ["Starter", "Growth"],
  "Growth (₹25–60 L)": ["Growth", "Scale", "Starter"],
  "Scale (₹60 L–1.2 Cr)": ["Scale", "Flagship", "Growth"],
  "Flagship (₹1.2 Cr+)": ["Flagship", "Scale"],
};

export const QUESTIONS = [
  { k: "category", q: "What category is the brand in?", o: CATEGORIES },
  { k: "budget", q: "Working budget band?", o: Object.keys(BUDGET_TIERS) },
  { k: "want", q: "What kind of face do you want?", o: ["Mass trust", "Youth energy", "Glamour", "Everyday credibility"] },
  { k: "age", q: "Who's the core audience?", o: ["Gen Z (18–24)", "Young adults (25–34)", "Families (35–50)", "All ages / mass"] },
  { k: "goal", q: "Primary campaign goal?", o: ["Awareness / reach", "Trust / credibility", "Sales / conversion", "Repositioning"] },
  { k: "platform", q: "Where will this mostly run?", o: ["Instagram / Reels", "YouTube", "TV + digital", "On-ground + digital"] },
  { k: "geo", q: "Where do you need reach?", o: ["Metro cities", "Tier 2 & 3", "Pan-India", "Regional focus"] },
  { k: "lang", q: "Language priority?", o: ["Hindi-first", "English-first", "Multi-language", "South Indian", "Punjabi / North", "Marathi / Bengali"] },
  { k: "risk", q: "Tolerance for controversy risk?", o: ["Very low — safest faces only", "Moderate", "Higher — bolder bets ok"] },
  { k: "price", q: "Where do you sit on price?", o: ["Value / mass", "Mid-market", "Premium", "Luxury"] },
  { k: "arch", q: "Which brand feeling fits best?", o: ["Trustworthy & dependable", "Bold & aspirational", "Warm & everyday", "Glamorous & premium"] },
  { k: "time", q: "Timeline to launch?", o: ["ASAP (< 1 month)", "1–3 months", "Flexible"] },
];
export const QUICK_AFTER = 5; // "see matches now" appears once the first 5 are answered

export const WANT_TO_TYPE = { "Mass trust": "trust", "Youth energy": "youth", "Glamour": "glam", "Everyday credibility": "credible" };
export const AGE_TO_AUD = { "Gen Z (18–24)": "Youth", "Young adults (25–34)": "Lifestyle", "Families (35–50)": "Family", "All ages / mass": "Mass" };

// category → how much each field / tag helps
const AFFINITY = {
  "Health & Wellness": { cat: { sports: 12, cricket: 8, creators: 4 }, tag: [[/fitness|athletics|yoga/, 10], [/veteran/, 3]] },
  "Fashion & Apparel": { cat: { film: 8, singers: 5, sports: 4, regional: 3 }, tag: [[/fashion|model/, 12], [/youth|dance/, 4]] },
  "Beauty & Skincare": { cat: { film: 9, tv: 7, regional: 4 }, tag: [[/beauty|fashion|lifestyle/, 10]] },
  "Food & Beverage": { cat: { tv: 8, film: 5, comedy: 7, cricket: 5 }, tag: [[/family|food/, 8]] },
  "Fintech & BFSI": { cat: { cricket: 12, creators: 8, film: 3 }, tag: [[/business|podcast|veteran/, 8]] },
  "D2C / E-commerce": { cat: { creators: 10, comedy: 8, tv: 5, singers: 4 }, tag: [[/digital|youth/, 6]] },
  "Auto & EV": { cat: { film: 8, cricket: 9, sports: 4 }, tag: [[/youth/, 3]] },
  "Real Estate": { cat: { film: 7, tv: 5, cricket: 4 }, tag: [[/veteran|family/, 9]] },
  "Tech / SaaS": { cat: { creators: 12, comedy: 8, cricket: 3 }, tag: [[/podcast|digital|business/, 8]] },
  "Jewellery & Luxury": { cat: { film: 10, regional: 7, tv: 5, singers: 3 }, tag: [[/fashion|beauty/, 8]] },
  "Education": { cat: { creators: 12, sports: 7, cricket: 5 }, tag: [[/veteran|speaker|social impact|chess/, 8]] },
  "Other": { cat: {}, tag: [] },
};

// keyword signals the decoder can add (from the brand's own website text)
const SIGNAL_BOOST = {
  sport: { cat: { sports: 14, cricket: 8 }, tag: /fitness|athletics/ },
  fitness: { cat: { sports: 12, cricket: 4 }, tag: /fitness|yoga/ },
  beauty: { cat: { film: 5, tv: 4 }, tag: /beauty|fashion/ },
  kids: { cat: { tv: 6, sports: 4 }, tag: /family/ },
  finance: { cat: { cricket: 6, creators: 6 }, tag: /business|podcast/ },
  tech: { cat: { creators: 8, comedy: 4 }, tag: /digital|podcast/ },
  food: { cat: { tv: 5, comedy: 5 }, tag: /food|family/ },
  luxury: { cat: { film: 6 }, tag: /fashion/ },
  youth: { cat: { singers: 5, comedy: 5, creators: 5 }, tag: /youth|digital/ },
  festive: { cat: { tv: 4, film: 4, singers: 3 }, tag: /family|devotional/ },
  spiritual: { cat: { creators: 4 }, tag: /devotional|mythology/ },
};

export function buildProfile(brand = {}, a = {}) {
  return {
    name: brand.name || "Your brand",
    category: a.category || brand.category || "Other",
    audience: AGE_TO_AUD[a.age] || brand.audience || "Mass",
    want: WANT_TO_TYPE[a.want] || "credible",
    wantLabel: a.want || "Everyday credibility",
    budget: a.budget || "Growth (₹25–60 L)",
    risk: a.risk || "Moderate",
    goal: a.goal || "Awareness / reach",
    platform: a.platform || "", geo: a.geo || "", lang: a.lang || "", price: a.price || "",
    tone: brand.tone || "", signals: brand.signals || [],
  };
}

export function scoreCeleb(c, p) {
  let s = 32; const notes = [];
  // audience
  if (c.aud === p.audience) { s += 14; notes.push("audience match"); }
  else if ((p.audience === "Youth" && c.aud === "Lifestyle") || (p.audience === "Lifestyle" && c.aud === "Youth") ||
           (p.audience === "Mass" && c.aud === "Family") || (p.audience === "Family" && c.aud === "Mass") ||
           (p.audience === "Premium" && c.aud === "Lifestyle") || (p.audience === "Lifestyle" && c.aud === "Premium")) s += 7;
  // face type
  if (c.types.includes(p.want)) { s += 14; notes.push("right face type"); }
  // budget
  const ok = BUDGET_TIERS[p.budget] || ["Growth"];
  if (ok[0] === c.tier) { s += 12; notes.push("fits budget"); }
  else if (ok.includes(c.tier)) s += 5;
  else { s -= 16; notes.push(tierRank(c.tier) > tierRank(ok[0]) ? "above budget" : "below brief"); }
  // category affinity
  const af = AFFINITY[p.category] || AFFINITY.Other;
  const tagStr = c.tags.join(" ").toLowerCase() + " " + c.role.toLowerCase();
  let aff = af.cat[c.cat] || 0;
  for (const [re, v] of af.tag) if (re.test(tagStr)) aff += v;
  aff = Math.min(aff, 16); s += aff;
  if (aff >= 10) notes.push("category fit");
  // website signals
  let sig = 0;
  for (const k of p.signals || []) { const b = SIGNAL_BOOST[k]; if (!b) continue; sig += (b.cat[c.cat] || 0) + (b.tag.test(tagStr) ? 4 : 0); }
  s += Math.min(sig, 14);
  // platform / geo / language
  if (p.platform === "Instagram / Reels" && ["creators", "comedy", "singers"].includes(c.cat)) s += 5;
  if (p.platform === "YouTube" && ["creators", "comedy"].includes(c.cat)) s += 5;
  if (p.platform === "TV + digital" && ["film", "tv", "cricket"].includes(c.cat)) s += 5;
  if (p.geo === "Tier 2 & 3" && (c.types.includes("mass") || c.langs.includes("bhojpuri"))) s += 5;
  if (p.geo === "Metro cities" && ["Lifestyle", "Premium", "Youth"].includes(c.aud)) s += 3;
  if (p.lang === "South Indian") s += c.langs.includes("south") ? 12 : -4;
  if (p.lang === "Punjabi / North") s += c.langs.includes("north") ? 12 : 0;
  if (p.lang === "Marathi / Bengali") s += (c.langs.includes("marathi") || c.langs.includes("bengali")) ? 12 : -2;
  if (p.lang === "English-first" && ["creators", "comedy"].includes(c.cat)) s += 3;
  if (p.lang === "Hindi-first" && c.langs.length && !c.langs.includes("bhojpuri")) s -= 3;
  // risk
  if (p.risk.startsWith("Very low")) { if (c.types.includes("trust")) { s += 6; notes.push("low crisis-risk"); } if (c.cat === "comedy") s -= 6; }
  if (p.risk.startsWith("Higher") && (c.cat === "comedy" || c.cat === "creators")) s += 3;
  if (c.risky) s -= p.risk.startsWith("Higher") ? 0 : p.risk.startsWith("Very low") ? 24 : 12;
  if (c.star) s += 3;
  if (c.ph === "") s -= 4;
  const conflict = c.owns.includes(p.category);
  if (conflict) s -= 26;
  s = Math.max(18, Math.min(97, Math.round(s)));
  return { fit: s, conflict, notes };
}

function tierRank(t) { return { Starter: 0, Growth: 1, Scale: 2, Flagship: 3 }[t] ?? 1; }

export function rankAll(list, p) {
  return list
    .map((c) => ({ c, ...scoreCeleb(c, p) }))
    .sort((a, b) => b.fit - a.fit || (b.c.star - a.c.star) || tierRank(b.c.tier) - tierRank(a.c.tier) || b.c.followers - a.c.followers || a.c.n.localeCompare(b.c.n));
}

export function safetyScore(c, p) {
  let s = 76;
  if (c.types.includes("trust")) s += 12;
  if (c.types.includes("credible")) s += 6;
  if (c.cat === "comedy") s -= 6;
  if (c.risky) s -= 18;
  if (c.tier === "Flagship") s += 2;
  if (p.risk && p.risk.startsWith("Higher")) s -= 4;
  return Math.max(60, Math.min(99, s));
}

export const IMG = (ph) => (ph ? "https://colatch.com/roster/" + ph + ".webp?v=3" : "");
export const initials = (n) => n.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function domainToName(url) {
  try {
    const h = url.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const base = (h.split(".")[0] || "Your brand").replace(/[-_]+/g, " ");
    return base.replace(/\b\w/g, (m) => m.toUpperCase());
  } catch { return "Your brand"; }
}
