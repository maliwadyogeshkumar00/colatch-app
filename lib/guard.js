// Server-only guards shared by every API route: per-IP rate limits, safe outbound URLs, tidy JSON errors.
import { NextResponse } from "next/server";
import { lookup } from "dns/promises";
import net from "net";

/* ---------- rate limit (best effort: per warm instance, resets on cold start) ---------- */
const buckets = new Map();
export function clientIp(req) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "anon";
}
export function limited(req, key, max, windowMs) {
  const id = key + ":" + clientIp(req), now = Date.now();
  const b = buckets.get(id) || { n: 0, at: now };
  if (now - b.at > windowMs) { b.n = 0; b.at = now; }
  b.n++; buckets.set(id, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.at > windowMs) buckets.delete(k);
  return b.n > max ? Math.ceil((b.at + windowMs - now) / 1000) : 0;
}
export function tooMany(retry) {
  return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers: { "retry-after": String(retry) } });
}
export function bad(msg, status = 400) { return NextResponse.json({ error: msg }, { status }); }

export async function readJson(req, maxBytes = 64 * 1024) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) throw Object.assign(new Error("Request too large"), { status: 413 });
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error("Request too large"), { status: 413 });
  try { return JSON.parse(text || "{}"); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

/* ---------- safe outbound URL (no internal hosts, no odd ports) ---------- */
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}
export async function safeUrl(raw) {
  let s = String(raw || "").trim();
  if (s.length > 300) throw new Error("That address is too long");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { throw new Error("Enter a valid website, e.g. yourbrand.in"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https websites can be read");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("Only standard web ports can be read");
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Enter a public website");
  if (net.isIP(host) && privateIp(host)) throw new Error("Enter a public website");
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("Enter a public website");
  } catch (e) {
    if (/public website/.test(e.message)) throw e;
    throw new Error("We couldn't find " + host + ". Check the spelling.");
  }
  return u.toString();
}
