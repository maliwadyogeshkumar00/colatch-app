import { notFound, redirect } from "next/navigation";
import PublicShell, { Hero } from "../../_ui/PublicShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { inr, compact } from "@/lib/net/creators";
import { scrubContacts } from "@/lib/net/guard";
import { checkBrief } from "@/lib/net/compliance";
import { slugify, shortlistDue, formatIST } from "@/lib/net/brief";
import { newToken } from "@/lib/net/tokens";
import { quote } from "@/lib/net/deal";
import { readRefCookie, recordReferral } from "@/lib/net/referral";
import { livePitch } from "../_data";
import { firstName } from "../../_ui/pitch";

export async function generateMetadata({ params }) {
  const p = await livePitch(params?.id).catch(() => null);
  return { title: p ? `${scrubContacts(p.title).text} · Colatch idea board` : "Creator idea · Colatch", robots: { index: false } };
}

async function book(fd) {
  "use server";
  const id = String(fd.get("pitch") ?? "");
  const here = `/pitches/${encodeURIComponent(id)}`;
  const p = await livePitch(id);
  if (!p) redirect(flashUrl(here, "err", "This idea is no longer available. Browse the board for another one."));
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const company = String(fd.get("company") ?? "").trim().slice(0, 80);
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 120);
  const phone = String(fd.get("phone") ?? "").trim().slice(0, 30);
  const note = scrubContacts(String(fd.get("note") ?? "").trim().slice(0, 800)).text;
  if (!name || !company || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(flashUrl(here, "err", "Add your name, brand and a work email so we can confirm the booking."));
  const block = checkBrief(`${p.title}\n${p.idea}\n${note}`).find((f) => f.level === "block");
  if (block) redirect(flashUrl(here, "err", `We can't run this: ${block.title}.`));

  const full = await env.DB.prepare("SELECT p.creator_id, c.handle, c.name, c.city, c.followers FROM creator_pitches p JOIN creators c ON c.id=p.creator_id WHERE p.id=?").bind(id).first();
  const campaignId = crypto.randomUUID();
  const ref = readRefCookie(String(fd.get("ref") ?? "") || null);
  const raw = `Booked from the Colatch idea board: "${p.title}" by @${full.handle} at ${inr(p.price)}.${note ? `\n\nBrand's note: ${note}` : ""}`;
  await env.DB.prepare(
    `INSERT INTO campaigns (id, slug, title, brand, brief, raw_brief, deliverables, niche, creators_needed, budget_note, budget_total, status, source,
      client_name, client_company, client_email, client_phone, is_open, pay_type, shortlist_due, ref_code, share_token, pitch_id, brand_category)
     VALUES (?,?,?,?,?,?,?,?,1,?,?,'pending','pitch',?,?,?,?,0,'cash',?,?,?,?,?)`
  ).bind(campaignId, slugify(p.title), p.title, company, p.idea, raw, p.format, p.category, `Paid · ${inr(p.price)} (creator's price)`, p.price,
    name, company, email, phone || null, shortlistDue(), ref, newToken(), id, p.category ? `A ${p.category.toLowerCase()} brand` : null).run();
  // The creator who pitched is attached straight away; the team still reviews before the brand sees them.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO campaign_applications (id, campaign_id, creator_id, handle, name, city, followers, rate_quote, pitch, match_score, match_reasons, status, team_note)
     VALUES (?,?,?,?,?,?,?,?,?,100,?,'new',?)`
  ).bind(crypto.randomUUID(), campaignId, full.creator_id, full.handle, full.name, full.city, full.followers, p.price, p.idea,
    "Brand booked this creator's own idea", "Booked from the idea board. Confirm availability, then shortlist.").run();
  await env.DB.prepare("UPDATE creator_pitches SET requests = requests + 1 WHERE id=?").bind(id).run();
  await recordReferral(env, ref, "brand", email).catch(() => false);
  redirect(`${here}?done=${encodeURIComponent(campaignId)}`);
}

export default async function Page({ params, searchParams }) {
  const id = String(params?.id || "");
  const doneId = String(searchParams?.done || "");
  const done = doneId ? await env.DB.prepare("SELECT id, shortlist_due, title FROM campaigns WHERE id=? AND pitch_id=?").bind(doneId, id).first() : null;
  const p = await livePitch(id);
  if (!p && !done) notFound();

  if (done) {
    return (
      <PublicShell mode="client" narrow>
        <div className="panel pad" style={{ maxWidth: 620, margin: "20px auto 0", textAlign: "center" }}>
          <div className="lbl" style={{ color: "var(--good)" }}>Booking received</div>
          <h2 style={{ fontSize: 26, letterSpacing: "-.02em", textTransform: "none", color: "var(--p900)", margin: "10px 0 8px" }}>"{scrubContacts(done.title).text}" is yours to make happen.</h2>
          <p className="muted" style={{ margin: "0 0 18px" }}>We'll confirm the creator's dates and send your private campaign link{done.shortlist_due ? ` by ${formatIST(done.shortlist_due)}` : " within 2 working days"}. You approve the creator, fund the deal through Colatch, and see the post, the views and the proof in one place.</p>
          <div className="row" style={{ justifyContent: "center" }}><a className="btn" href="/pitches">Browse more ideas</a><a className="btn-foil" href="/brief">Post a full brief</a></div>
        </div>
      </PublicShell>
    );
  }

  const who = firstName(p.name);
  const facts = [p.followers ? compact(p.followers) + " followers" : null, p.city, String(p.niche || "").split(",")[0].trim() || null].filter(Boolean).join(" · ");
  const allIn = quote(env, p.price || 0, false);
  const hero = (
    <Hero eyebrow={`Idea board · ${p.occasion || "Any time"} · ${p.format}`} title={scrubContacts(p.title).text.replace(/[<>&]/g, "")}>
      <p>Pitched by {who}{p.verified ? ", Instagram-verified" : ""}{facts ? ` · ${facts}` : ""}{p.rating != null ? ` · ★ ${Number(p.rating).toFixed(1)} from brands` : ""}{p.done ? ` · ${p.done} Colatch ${p.done === 1 ? "campaign" : "campaigns"} delivered` : ""}.</p>
    </Hero>
  );

  return (
    <PublicShell mode="client" hero={hero}>
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="panel pad">
          <h2>The idea</h2>
          <p style={{ whiteSpace: "pre-line", margin: "0 0 18px", fontSize: 15.5, lineHeight: 1.65 }}>{scrubContacts(p.idea).text}</p>
          <div className="lbl">What it costs</div>
          <table className="tbl" style={{ marginTop: 8 }}><tbody>
            <tr><td>Creator's price</td><td className="num">{inr(allIn.creatorFee)}</td></tr>
            <tr><td>Colatch fee ({allIn.pct}%)</td><td className="num">{inr(allIn.colatch)}</td></tr>
            <tr><td>GST on Colatch fee</td><td className="num">{inr(allIn.gstOnColatch)}</td></tr>
            <tr><td><b>All in</b></td><td className="num"><b>{inr(allIn.total)}</b></td></tr>
          </tbody></table>
          <p className="hint" style={{ margin: "12px 0 0" }}>Creator GST is added only if they are GST-registered. You pay only after you approve the creator, and your money is held by Colatch until the post is live and checked.</p>
        </div>
        <form className="panel pad" action={book}>
          <input type="hidden" name="pitch" value={p.id} />
          <input type="hidden" name="ref" value={String(searchParams?.ref || "")} />
          <h2>Book this idea</h2>
          <p className="muted small" style={{ margin: "-4px 0 16px" }}>The creator's handle and contact stay private until the booking is confirmed. Everything runs through Colatch, so the work and the payment are both protected.</p>
          <div className="stack">
            <div className="form-grid">
              <div className="fld"><label>Your name</label><input name="name" required autoComplete="name" /></div>
              <div className="fld"><label>Brand / company</label><input name="company" required autoComplete="organization" /></div>
              <div className="fld"><label>Work email</label><input name="email" type="email" required autoComplete="email" /></div>
              <div className="fld"><label>Phone / WhatsApp <span className="opt">optional</span></label><input name="phone" autoComplete="tel" /></div>
            </div>
            <div className="fld"><label>Anything to add <span className="opt">product, dates, must-haves</span></label><textarea name="note" rows={4} /></div>
          </div>
          <button className="btn-foil" style={{ marginTop: 18, width: "100%", justifyContent: "center" }}>Book for {inr(allIn.total)} all in</button>
          <p className="hint" style={{ margin: "12px 0 0" }}>No payment now. We confirm the creator's dates within 2 working days.</p>
        </form>
      </div>
    </PublicShell>
  );
}
