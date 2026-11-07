import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TEAM_COOKIE } from "@/lib/net/creatorAuth";

export async function GET(req) {
  cookies().delete(TEAM_COOKIE);
  return NextResponse.redirect(new URL("/team/login", req.url), 303);
}
