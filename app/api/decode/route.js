import { NextResponse } from "next/server";
import { readWebsite, aiDecode, hasAI } from "../../../lib/ai";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { url } → { dna } — Gemini when GEMINI_API_KEY is set, keyword signals from the site otherwise.
export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url || !String(url).includes(".")) return NextResponse.json({ error: "Enter a valid website, e.g. yourbrand.in" }, { status: 400 });
    const site = await readWebsite(String(url));
    const dna = await aiDecode(String(url), site);
    return NextResponse.json({ ok: true, ai: hasAI(), source: site.url, readable: site.text.length > 200, dna });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
