import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TEAM_COOKIE } from "@/lib/net/creatorAuth";

// Signing out only happens for requests from this site (the Log out link) or a POST.
// A link or image on another site can't sign people out.
function sameSite(req) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const ref = req.headers.get("referer");
  try { return !ref || new URL(ref).host === new URL(req.url).host; } catch { return false; }
}
function out(req) {
  cookies().delete(TEAM_COOKIE);
  return NextResponse.redirect(new URL("/team/login", req.url), 303);
}
export async function GET(req) {
  if (!sameSite(req)) return NextResponse.redirect(new URL("/team", req.url), 303);
  return out(req);
}
export async function POST(req) { return sameSite(req) ? out(req) : new NextResponse("Forbidden", { status: 403 }); }
