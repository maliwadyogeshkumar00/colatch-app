import { NextResponse } from "next/server";
import { loadRoster } from "../../../lib/roster";
import { rankAll, TIER_PRICE } from "../../../lib/engine";
import { askGemini, hasAI } from "../../../lib/ai";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { profile, brand } → ranked list across the full synced roster.
// With GEMINI_API_KEY, the top 30 clean candidates are re-read by the model, which picks and explains a shortlist.
export async function POST(req) {
  try {
    const { profile, brand = {} } = await req.json();
    if (!profile) return NextResponse.json({ error: "Missing profile" }, { status: 400 });
    const roster = await loadRoster();
    let ranked = rankAll(roster.list, profile);
    let ai = null;

    if (hasAI()) {
      const pool = ranked.filter((r) => !r.conflict).slice(0, 30);
      try {
        const out = await askGemini(
          `You are Colatch's head of talent. Pick the 6 best celebrity faces for this brand from the candidate list ONLY, best first, and say why in one crisp sentence each (max 22 words, specific to the brand, no hype).
BRAND: ${brand.name || profile.name} — ${brand.summary || ""}
CATEGORY: ${profile.category}; AUDIENCE: ${profile.audience}; WANTS: ${profile.wantLabel}; GOAL: ${profile.goal}; BUDGET: ${profile.budget}; PLATFORM: ${profile.platform}; GEO: ${profile.geo}; LANGUAGE: ${profile.lang}; RISK: ${profile.risk}
CANDIDATES: ${pool.map((r) => `${r.c.n} (${r.c.role}; ${r.c.tier} ${TIER_PRICE[r.c.tier].band}; fit ${r.fit})`).join(" | ")}
Return ONLY JSON: {"picks":[{"name": exact candidate name, "reason": string}]}`,
          { timeout: 14000 }
        );
        const picks = (out?.picks || []).filter((p) => pool.some((r) => r.c.n === p.name)).slice(0, 6);
        if (picks.length) {
          const reason = Object.fromEntries(picks.map((p) => [p.name, p.reason]));
          const order = picks.map((p) => p.name);
          const top = order.map((n, i) => {
            const r = ranked.find((x) => x.c.n === n);
            return { ...r, reason: reason[n], ai: true };
          });
          ranked = [...top, ...ranked.filter((r) => !reason[r.c.n])];
          ai = { used: true };
        }
      } catch (e) { ai = { used: false, error: String(e?.message || e).slice(0, 160) }; }
    }

    return NextResponse.json({
      total: roster.list.length, rosterSource: roster.source, syncedAt: roster.syncedAt, ai,
      results: ranked.map(({ c, fit, conflict, notes, reason, ai }) => ({ c, fit, conflict, notes, reason: reason || null, ai: !!ai })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
