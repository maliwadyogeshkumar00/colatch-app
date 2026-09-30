// Server-only helpers: read a brand website, decode brand DNA (Gemini when configured, keyword signals otherwise).
import { CATEGORIES, domainToName } from "./engine";

export const hasAI = () => !!process.env.GEMINI_API_KEY;

export async function readWebsite(raw) {
  let url = (raw || "").trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; ColatchBot/1.0)" }, cache: "no-store" });
    clearTimeout(t);
    const html = await r.text();
    const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "";
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || "";
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
    return { url, ok: r.ok, title: title.trim(), desc: desc.trim(), text: text.slice(0, 12000) };
  } catch (e) {
    return { url, ok: false, title: "", desc: "", text: "", error: String(e?.message || e) };
  }
}

export async function askGemini(prompt, { timeout = 15000 } = {}) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.4 } }),
    });
    if (!r.ok) throw new Error("Gemini " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    const m = text.match(/[\[{][\s\S]*[\]}]/);
    return m ? JSON.parse(m[0]) : null;
  } finally { clearTimeout(t); }
}

// ---------- keyword decoder (no AI key, or AI failed) ----------
const CAT_WORDS = [
  ["Beauty & Skincare", /skin ?care|serum|moisturi[sz]er|cosmetic|makeup|lipstick|beauty|sunscreen|haircare|shampoo/],
  ["Fashion & Apparel", /apparel|clothing|fashion|athleisure|activewear|sneaker|footwear|t-?shirt|denim|ethnic wear|kurta|saree/],
  ["Food & Beverage", /snack|beverage|drink|coffee|tea\b|food|restaurant|masala|spice|chocolate|juice|dairy|bakery/],
  ["Fintech & BFSI", /loan|credit|insurance|invest|mutual fund|bank|payment|upi|trading|fintech|wealth|forex/],
  ["Health & Wellness", /wellness|supplement|protein|ayurved|nutrition|vitamin|health|fitness|gym|yoga|clinic|pharma/],
  ["Auto & EV", /\bev\b|electric vehicle|scooter|motorcycle|\bcar\b|automobile|tyre|battery|mobility/],
  ["Real Estate", /real estate|apartment|villa|property|realty|homes|township|plots|bhk/],
  ["Tech / SaaS", /saas|software|platform|\bapi\b|cloud|\bai\b|automation|app for|crm|analytics/],
  ["Jewellery & Luxury", /jewell?ery|diamond|gold|silver|luxury|watch(es)?|bridal/],
  ["Education", /course|learn|edtech|school|academy|exam|coaching|university|tutor|upskill/],
  ["D2C / E-commerce", /shop now|add to cart|free shipping|cod available|d2c|store|order online/],
];
const SIGNALS = [
  ["sport", /sport|athlet|athleisure|run|training|performance/], ["fitness", /fitness|gym|workout|protein|yoga/],
  ["beauty", /beauty|skin|glow|makeup/], ["kids", /kids|baby|children|toddler|parent/],
  ["finance", /loan|invest|credit|bank|insurance/], ["tech", /software|saas|\bai\b|app\b|platform/],
  ["food", /food|snack|taste|recipe|drink/], ["luxury", /luxury|premium|handcrafted|couture|exclusive/],
  ["youth", /gen ?z|youth|college|trend|drop/], ["festive", /festive|diwali|wedding|celebrat/],
  ["spiritual", /spiritual|devot|temple|puja|ayurved/],
];

export function signalDecode(url, site) {
  const name = (site.title && site.title.split(/[|\-–—:]/)[0].trim().slice(0, 40)) || domainToName(url);
  const hay = (url + " " + site.title + " " + site.desc + " " + site.text).toLowerCase();
  let category = "Other", best = 0;
  for (const [c, re] of CAT_WORDS) {
    const n = (hay.match(new RegExp(re.source, "g")) || []).length + (re.test(url.toLowerCase()) ? 6 : 0);
    if (n > best) { best = n; category = c; }
  }
  const signals = SIGNALS.filter(([, re]) => re.test(hay)).map(([k]) => k);
  const lux = /luxury|premium|handcrafted|couture/.test(hay), value = /affordable|budget|lowest price|starting at ₹?\d{2,3}\b|sale/.test(hay);
  const priceTier = lux ? "Premium" : value ? "Value / mass" : "Mid-market";
  const archetype = lux ? "The Refined Icon" : signals.includes("sport") || signals.includes("youth") ? "The Bold Challenger" : value ? "The Everyday Hero" : "The Trusted Guide";
  const personality = { "The Refined Icon": ["Elegant", "Premium", "Aspirational", "Understated"], "The Bold Challenger": ["Confident", "Energetic", "Sharp", "Disruptive"], "The Everyday Hero": ["Friendly", "Honest", "Practical", "Warm"], "The Trusted Guide": ["Credible", "Grounded", "Warm", "Reassuring"] }[archetype];
  const audience = signals.includes("youth") || signals.includes("sport") ? "Youth" : signals.includes("kids") ? "Family" : lux ? "Lifestyle" : "Mass";
  const readable = site.text.length > 200;
  return {
    name, category, archetype, personality, audience, priceTier, signals,
    tone: personality[0],
    summary: readable
      ? `${name} reads as ${archetype.toLowerCase().replace("the ", "a ")} in ${category === "Other" ? "its space" : category}. The right face should feel ${personality[0].toLowerCase()} and ${personality[1].toLowerCase()} — someone who lends the product credibility without overshadowing it.`
      : `We couldn't read much from ${url.replace(/^https?:\/\//, "")}, so this starts from the domain alone. Your answers in the next step do the heavy lifting.`,
    source: readable ? "signals" : "domain",
  };
}

export async function aiDecode(url, site) {
  const base = signalDecode(url, site);
  if (!hasAI() || !site.text) return base;
  try {
    const out = await askGemini(
      `You are Colatch Intelligence, brand strategist at an Indian celebrity-marketing agency. Read this brand's website and return ONLY JSON:
{"name": string (brand name), "category": one of ${JSON.stringify(CATEGORIES)}, "archetype": short phrase like "The Bold Challenger",
 "personality": [4 single adjectives], "tone": one word, "audience": one of ["Youth","Lifestyle","Family","Mass","Premium"],
 "priceTier": one of ["Value / mass","Mid-market","Premium","Luxury"], "signals": subset of ["sport","fitness","beauty","kids","finance","tech","food","luxury","youth","festive","spiritual"],
 "summary": 2 sentences on who the brand is and what kind of celebrity face would suit it}
WEBSITE ${site.url}
TITLE: ${site.title}
DESCRIPTION: ${site.desc}
TEXT: ${site.text.slice(0, 9000)}`
    );
    if (!out || typeof out !== "object") return base;
    return {
      ...base, ...Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== "")),
      category: CATEGORIES.includes(out.category) ? out.category : base.category,
      personality: Array.isArray(out.personality) && out.personality.length ? out.personality.slice(0, 4) : base.personality,
      signals: Array.isArray(out.signals) ? out.signals : base.signals,
      source: "ai",
    };
  } catch (e) {
    return { ...base, aiError: String(e?.message || e).slice(0, 160) };
  }
}
