import { NextResponse } from "next/server";
import { env } from "@/lib/net/env";
import { REF_COOKIE } from "@/lib/net/referral";

export const dynamic = "force-dynamic";

/** Referral link: remembers who sent the visitor for 60 days, then lands them on the right page. */
export async function GET(req, { params }) {
  const url = new URL(req.url);
  const code = String(params.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  const row = code ? await env.DB.prepare("SELECT owner_type FROM referral_codes WHERE code=?").bind(code).first().catch(() => null) : null;
  const to = url.searchParams.get("to");
  const dest = to === "brief" ? "/brief" : to === "join" ? "/join" : row?.owner_type === "brand" ? "/brief" : "/join";
  const res = NextResponse.redirect(new URL(dest, req.url), 302);
  if (row) res.cookies.set(REF_COOKIE, code, { path: "/", maxAge: 60 * 86400, sameSite: "lax", secure: true, httpOnly: true });
  return res;
}
