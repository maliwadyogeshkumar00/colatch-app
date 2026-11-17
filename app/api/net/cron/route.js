// Scheduled jobs. Vercel Cron calls this on the schedule in vercel.json and, when CRON_SECRET is set in the
// project, sends `Authorization: Bearer <CRON_SECRET>`. Anything else gets 401, and without CRON_SECRET the
// route refuses every call, so the jobs can't be triggered by strangers. See lib/net/jobs.ts for the jobs.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runAll } from "@/lib/net/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: process.env.CRON_SECRET ? "Unauthorized" : "CRON_SECRET is not set, so scheduled jobs are switched off" }, { status: 401 });
  }
  const results = await runAll(new Date());
  return NextResponse.json({ ok: results.every((r) => r.ok), results }, { status: 200 });
}
