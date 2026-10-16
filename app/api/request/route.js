import { NextResponse } from "next/server";
import { limited, tooMany, bad, readJson } from "../../../lib/guard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST → logs an availability-and-quote request (or a "propose names" request) for the Colatch talent desk.
// Delivered to REQUEST_WEBHOOK_URL as JSON (Make, Zapier, n8n, Google Apps Script, Slack incoming webhook…).
// If no webhook is configured or it fails, the client is told so and offers WhatsApp with the same text.
const ENGAGE = ["Brand ambassador", "Campaign shoot", "Social posts only", "Event appearance", "Not sure yet"];
const s = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req) {
  const wait = limited(req, "request", 6, 10 * 60_000); if (wait) return tooMany(wait);
  try {
    const b = await readJson(req, 16 * 1024);
    if (b.website2) return NextResponse.json({ ok: true, ref: "CL-" + Date.now().toString(36).toUpperCase(), delivered: true }); // honeypot
    const r = {
      talent: s(b.talent, 80), brand: s(b.brand, 80), category: s(b.category, 60), engagement: ENGAGE.includes(b.engagement) ? b.engagement : "Not sure yet",
      dates: s(b.dates, 80), term: s(b.term, 40), deliverables: s(b.deliverables, 300), territory: s(b.territory, 120), budget: s(b.budget, 60),
      name: s(b.name, 80), company: s(b.company, 80), email: s(b.email, 120), phone: s(b.phone, 30), notes: s(b.notes, 1000),
      shortlist: Array.isArray(b.shortlist) ? b.shortlist.filter((x) => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 80)) : [],
    };
    const errors = {};
    if (!r.name) errors.name = "Your name, please";
    if (!r.brand) errors.brand = "Which brand is this for?";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) errors.email = "A work email we can reply to";
    if (r.phone && !/^[+\d][\d\s-]{6,}$/.test(r.phone)) errors.phone = "Digits only, with country code";
    if (Object.keys(errors).length) return NextResponse.json({ error: "Check the highlighted fields.", errors }, { status: 400 });

    const ref = "CL-" + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 90 + 10);
    const payload = {
      ref, receivedAt: new Date().toISOString(), type: r.talent ? "availability_quote" : "propose_names", ...r,
      text: `New ${r.talent ? "availability & quote" : "talent"} request ${ref}\n${r.talent ? "Talent: " + r.talent + "\n" : ""}Brand: ${r.brand}${r.category ? " (" + r.category + ")" : ""}\nEngagement: ${r.engagement}\nDates: ${r.dates || "—"} · Term: ${r.term || "—"}\nDeliverables: ${r.deliverables || "—"}\nTerritory: ${r.territory || "—"} · Budget: ${r.budget || "—"}${r.shortlist.length ? "\nShortlist: " + r.shortlist.join(", ") : ""}\nFrom: ${r.name}${r.company ? ", " + r.company : ""} · ${r.email}${r.phone ? " · " + r.phone : ""}${r.notes ? "\nNotes: " + r.notes : ""}`,
    };

    let delivered = false;
    const hook = process.env.REQUEST_WEBHOOK_URL;
    if (hook) {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(hook, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        clearTimeout(t);
        delivered = res.ok;
      } catch { delivered = false; }
    }
    if (!delivered) console.log("[colatch request — not delivered to webhook]", JSON.stringify(payload));
    return NextResponse.json({ ok: true, ref, delivered, text: payload.text });
  } catch (e) {
    return bad(e.status ? e.message : "Couldn't send that just now.", e.status || 500);
  }
}
