import { NextResponse } from "next/server";
import { loadRoster } from "../../../lib/roster";
import { hasAI } from "../../../lib/ai";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health — quick status for uptime checks: roster source and size, AI and request routing configured.
export async function GET() {
  const r = await loadRoster();
  return NextResponse.json({
    ok: r.list.length > 0, roster: { source: r.source, total: r.list.length, syncedAt: r.syncedAt, error: r.error || null },
    ai: hasAI(), requests: !!process.env.REQUEST_WEBHOOK_URL, time: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
