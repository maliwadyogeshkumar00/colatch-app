import { NextResponse } from "next/server";
import { loadRoster } from "../../../lib/roster";
import { rankAll, TIER_PRICE, CATEGORIES, BUDGET_TIERS } from "../../../lib/engine";
import { askGemini, hasAI } from "../../../lib/ai";
import { limited, tooMany, bad, readJson } from "../../../lib/guard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v, n = 120) => (typeof v === "string" ? v.slice(0, n) : "");

// POST { profile, brand } → ranked list across the full synced roster.
// With GEMINI_API_KEY, the top 30 clean candidates are re-read by the model, which picks and explains a shortlist.
export async function POST(req) {
  const wait = limited(req, "match", 30, 60_000); if (wait) return tooMany(wait);
  try {
    const body = await readJson(req, 32 * 1024);
    const raw = body.profile, brand = body.brand && typeof body.brand === "object" ? body.brand : {};
    if (!raw || typeof raw !== "object") return bad("Missing profile");
    // only known fields, only strings — the engine never sees anything else
    const profile = {
      name: str(raw.name, 60) || "Your brand",
      category: CATEGORIES.includes(raw.category) ? raw.category : "Other",
      audience: ["Youth", "Lifestyle", "Family", "Mass", "Premium"].includes(raw.audience) ? raw.audience : "Mass",
      want: ["trust", "youth", "glam", "credible"].includes(raw.want) ? raw.want : "credible",
      wantLabel: str(raw.wantLabel, 40) || "Everyday credibility",
      budget: BUDGET_TIERS[raw.budget] ? raw.budget : "Growth (₹25–60 L)",
      risk: str(raw.risk, 40) || "Moderate", goal: str(raw.goal, 40) || "Awareness / reach",
      platform: str(raw.platform, 40), geo: str(raw.geo, 40), lang: str(raw.lang, 40), price: str(raw.price, 40), tone: str(raw.tone, 40),
      signals: Array.isArray(raw.signals) ? raw.signals.filter((x) => typeof x === "string").slice(0, 12) : [],
    };
    const roster = await loadRoster();
    let ranked = rankAll(roster.list, profile);
    let ai = null;

    if (hasAI()) {
      const pool = ranked.filter((r) => !r.conflict).slice(0, 30);
      try {
        const out = await askGemini(
          `You are Colatch's head of talent. Pick the 6 best celebrity faces for this brand from the candidate list ONLY, best first, and say why in one crisp sentence each (max 22 words, specific to the brand, no hype).
BRAND: ${str(brand.name, 60) || profile.name} — ${str(brand.summary, 400)}
CATEGORY: ${profile.category}; AUDIENCE: ${profile.audience}; WANTS: ${profile.wantLabel}; GOAL: ${profile.goal}; BUDGET: ${profile.budget}; PLATFORM: ${profile.platform}; GEO: ${profile.geo}; LANGUAGE: ${profile.lang}; RISK: ${profile.risk}
CANDIDATES: ${pool.map((r) => `${r.c.n} (${r.c.role}; ${r.c.tier} ${TIER_PRICE[r.c.tier].band}; fit ${r.fit})`).join(" | ")}
Return ONLY JSON: {"picks":[{"name": exact candidate name, "reason": string}]}`,
          { timeout: 14000 }
        );
        const picks = (out?.picks || []).filter((p) => p && typeof p.name === "string" && pool.some((r) => r.c.n === p.name)).slice(0, 6);
        if (picks.length) {
          const reason = Object.fromEntries(picks.map((p) => [p.name, String(p.reason || "").slice(0, 240)]));
          const top = picks.map((p) => ({ ...ranked.find((x) => x.c.n === p.name), reason: reason[p.name], ai: true }));
          ranked = [...top, ...ranked.filter((r) => !(r.c.n in reason))];
          ai = { used: true };
        }
      } catch (e) { ai = { used: false, error: String(e?.message || e).slice(0, 160) }; }
    }

    return NextResponse.json({
      total: roster.list.length, rosterSource: roster.source, syncedAt: roster.syncedAt, ai,
      results: ranked.map(({ c, fit, conflict, notes, parts, reason, ai }) => ({ c, fit, conflict, notes, parts, reason: reason || null, ai: !!ai })),
    });
  } catch (e) {
    return bad(e.status ? e.message : "Matching failed. Try again.", e.status || 500);
  }
}
