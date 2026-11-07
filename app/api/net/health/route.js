import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/net/db";

export const dynamic = "force-dynamic";

/** Creates the network tables on first call and reports row counts. No personal data. */
export async function GET() {
  try {
    await ensureSchema();
    const t = await db.prepare("SELECT (SELECT COUNT(*) FROM creators) creators, (SELECT COUNT(*) FROM campaigns) campaigns, (SELECT COUNT(*) FROM creator_deals) deals, (SELECT COUNT(*) FROM team_users) team").first();
    return NextResponse.json({ ok: true, db: "neon", counts: t });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
