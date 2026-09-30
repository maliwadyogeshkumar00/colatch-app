import { NextResponse } from "next/server";
import { loadRoster, ROSTER_SOURCE } from "../../../lib/roster";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/roster            → full enriched roster synced from colatch.com/talent
// GET /api/roster?refresh=1  → bypass the cache (use after publishing new talent)
export async function GET(req) {
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const r = await loadRoster({ force });
  const counts = r.list.reduce((m, x) => ((m[x.cat] = (m[x.cat] || 0) + 1), m), {});
  return NextResponse.json(
    { source: r.source, sourceUrl: ROSTER_SOURCE, syncedAt: r.syncedAt, error: r.error, total: r.list.length, counts, list: r.list },
    { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=3600" } }
  );
}
