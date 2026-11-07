import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CREATOR_COOKIE } from "@/lib/net/creatorAuth";

export async function GET(req) {
  cookies().delete(CREATOR_COOKIE);
  return NextResponse.redirect(new URL("/creator/login", req.url), 303);
}
