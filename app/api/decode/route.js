import { NextResponse } from "next/server";
import { readWebsite, aiDecode, hasAI } from "../../../lib/ai";
import { limited, tooMany, bad, readJson, safeUrl } from "../../../lib/guard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { url } → { dna } — Gemini when GEMINI_API_KEY is set, keyword signals from the site otherwise.
export async function POST(req) {
  const wait = limited(req, "decode", 20, 60_000); if (wait) return tooMany(wait);
  try {
    const { url } = await readJson(req, 4096);
    if (!url || !String(url).includes(".")) return bad("Enter a valid website, e.g. yourbrand.in");
    try { await safeUrl(url); } catch (e) { return bad(e.message); }
    const site = await readWebsite(String(url));
    const dna = await aiDecode(String(url), site);
    return NextResponse.json({ ok: true, ai: hasAI(), source: site.url, readable: site.text.length > 200, dna });
  } catch (e) {
    return bad(e.status ? e.message : "We couldn't read that site just now. Try again, or write a brief instead.", e.status || 500);
  }
}
