import { notFound, redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { PageHeader, KpiStrip, Grid, Section, Card, AsideCard, Avatar } from "@/components/ui";
import { Facts } from "@/components/brand/Facts";
import { inrShort } from "@/lib/net/dashboard";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { inr, compact } from "@/lib/net/creators";
import { scrubContacts } from "@/lib/net/guard";
import { checkBrief } from "@/lib/net/compliance";
import { slugify, shortlistDue, formatIST } from "@/lib/net/brief";
import { newToken } from "@/lib/net/tokens";
import { quote } from "@/lib/net/deal";
import { readRefCookie, recordReferral } from "@/lib/net/referral";
import { notify, teamInbox } from "@/lib/net/notify";
import { livePitch } from "../_data";
import { firstName } from "../../_ui/pitch";

export async function generateMetadata({ params }) {
  const p = await livePitch(params?.id).catch(() => null);
  if (!p) notFound();
  return { title: p ? `${scrubContacts(p.title).text}: idea board` : "Creator idea", robots: { index: false } };
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
  const token = newToken() + newToken();
  const due = shortlistDue();
  const raw = `Booked from the Colatch idea board: "${p.title}" by @${full.handle} at ${inr(p.price)}.${note ? `\n\nBrand's note: ${note}` : ""}`;
  await env.DB.prepare(
    `INSERT INTO campaigns (id, slug, title, brand, brief, raw_brief, deliverables, niche, creators_needed, budget_note, budget_total, status, source,
      client_name, client_company, client_email, client_phone, is_open, pay_type, shortlist_due, ref_code, share_token, pitch_id, brand_category)
     VALUES (?,?,?,?,?,?,?,?,1,?,?,'pending','pitch',?,?,?,?,0,'cash',?,?,?,?,?)`
  ).bind(campaignId, slugify(p.title), p.title, company, p.idea, raw, p.format, p.category, `Paid · ${inr(p.price)} (creator's price)`, p.price,
    name, company, email, phone || null, due, ref, token, id, p.category ? `A ${p.category.toLowerCase()} brand` : null).run();
  // The creator who pitched is attached straight away; the team still reviews before the brand sees them.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO campaign_applications (id, campaign_id, creator_id, handle, name, city, followers, rate_quote, pitch, match_score, match_reasons, status, team_note)
     VALUES (?,?,?,?,?,?,?,?,?,100,?,'new',?)`
  ).bind(crypto.randomUUID(), campaignId, full.creator_id, full.handle, full.name, full.city, full.followers, p.price, p.idea,
    "Brand booked this creator's own idea", "Booked from the idea board. Confirm availability, then shortlist.").run();
  await env.DB.prepare("UPDATE creator_pitches SET requests = requests + 1 WHERE id=?").bind(id).run();
  await recordReferral(env, ref, "brand", email).catch(() => false);
  await notify({ template: "brief_received", to: email, toKind: "brand", payload: { name, title: p.title, due: formatIST(due), token }, dedupeKey: `brief:${campaignId}` });
  await notify({ template: "account_alert", to: teamInbox(), toKind: "team", dedupeKey: `brief_team:${campaignId}`,
    payload: { subject: `Idea board booking: ${p.title}`, text: `${company} (${name}, ${email}) booked @${full.handle}'s idea "${p.title}" at ${inr(p.price)}.\n\nReview: ${(process.env.SITE_URL || "https://colatch-app.vercel.app").replace(/\/$/, "")}/team/campaigns/${campaignId}` } });
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
      <PublicShell mode="client" hero={<PageHeader variant="hero" crumbs={[{ label: "Idea board", href: "/pitches" }, { label: "Booking received" }]} eyebrow="Booking received" title={`"${scrubContacts(done.title).text}" is <b>yours to make happen.</b>`} />}>
        <div className="v2b v2b-own-cta">
          <Grid aside={<AsideCard tone="night" eyebrow="Next" title="What happens now" foot={<a href="/faq">What brands pay</a>}>
            <ol className="v2b-steps"><li>We confirm the creator's dates{done.shortlist_due ? `, aiming for ${formatIST(done.shortlist_due)}` : ", usually within 2 working days"}.</li><li>We email you your private campaign page.</li><li>You approve the creator and fund the deal through Colatch.</li></ol>
          </AsideCard>}>
            <Card pad="lg">
              <p className="v2b-lead">We'll confirm the creator's dates{done.shortlist_due ? `, aiming for ${formatIST(done.shortlist_due)}` : ", usually within 2 working days"}, and email you your private campaign page. You approve the creator, fund the deal through Colatch, and see the post, the views and the proof in one place.</p>
              <div className="row" style={{ marginTop: 18, gap: 10 }}><a className="btn" href="/pitches">Browse more ideas</a><a className="btn-foil" href="/brief">Post a full brief</a></div>
            </Card>
          </Grid>
        </div>
      </PublicShell>
    );
  }

  const who = firstName(p.name);
  const facts = [p.followers ? compact(p.followers) + " followers" : null, p.city, String(p.niche || "").split(",")[0].trim() || null].filter(Boolean).join(" · ");
  const allIn = quote(env, p.price || 0, false);
  const hero = (
    <PageHeader variant="hero" crumbs={[{ label: "Idea board", href: "/pitches" }, { label: p.occasion || "Any time" }]}
      eyebrow={`Idea board · ${p.occasion || "Any time"} · ${p.format}`} title={scrubContacts(p.title).text.replace(/[<>&]/g, "")}
      sub={`Pitched by ${who}${p.verified ? ", Instagram-verified" : ""}${facts ? ` · ${facts}` : ""}${p.rating != null ? ` · ★ ${Number(p.rating).toFixed(1)} from brands` : ""}${p.done ? ` · ${p.done} Colatch ${p.done === 1 ? "campaign" : "campaigns"} delivered` : ""}.`} />
  );

  return (
    <PublicShell mode="client" hero={hero}>
      <div className="v2b v2b-own-cta">
        <div className="v2b-flash"><Flash sp={searchParams} /></div>
        <KpiStrip label="This idea at a glance" items={[
          { label: "Creator's price", value: inrShort(allIn.creatorFee), title: inr(allIn.creatorFee), foot: p.format },
          { label: "All in", value: inrShort(allIn.total), title: inr(allIn.total), foot: `incl. Colatch ${allIn.pct}% + GST` },
          { label: "Followers", value: p.followers ? compact(p.followers) : "—", foot: p.city || "India" },
          { label: "Brand rating", value: p.rating != null ? `★ ${Number(p.rating).toFixed(1)}` : "New", foot: p.done ? `${p.done} ${p.done === 1 ? "campaign" : "campaigns"} delivered` : "no Colatch campaigns yet" },
        ]} />
        <Grid aside={
          <AsideCard eyebrow="Book through Colatch" title="Book this idea" className="v2b-sticky">
            <form action={book} className="v2b-book">
              <input type="hidden" name="pitch" value={p.id} />
              <input type="hidden" name="ref" value={String(searchParams?.ref || "")} />
              <p className="hint">The creator's handle and contact stay private until the booking is confirmed. Everything runs through Colatch, so the work and the payment are both protected.</p>
              <div className="stack">
                <div className="fld"><label htmlFor="f-pitches-id-name-1">Your name</label><input id="f-pitches-id-name-1" name="name" required autoComplete="name" /></div>
                <div className="fld"><label htmlFor="f-pitches-id-company-2">Brand / company</label><input id="f-pitches-id-company-2" name="company" required autoComplete="organization" /></div>
                <div className="fld"><label htmlFor="f-pitches-id-email-3">Work email</label><input id="f-pitches-id-email-3" name="email" type="email" required autoComplete="email" /></div>
                <div className="fld"><label htmlFor="f-pitches-id-phone-4">Phone / WhatsApp <span className="opt">optional</span></label><input id="f-pitches-id-phone-4" name="phone" autoComplete="tel" /></div>
                <div className="fld"><label htmlFor="f-pitches-id-note-5">Anything to add <span className="opt">product, dates, must-haves</span></label><textarea id="f-pitches-id-note-5" name="note" rows={4} /></div>
              </div>
              <button className="btn-foil" style={{ marginTop: 18, width: "100%", justifyContent: "center" }}>Book for {inr(allIn.total)} all in</button>
              <p className="hint" style={{ margin: "12px 0 0" }}>No payment now. We confirm the creator's dates within 2 working days.</p>
            </form>
          </AsideCard>
        }>
          <Section id="idea" title="The idea" sub={`${p.format}${p.category ? ` · for ${p.category.toLowerCase()} brands` : ""}`}>
            <Card pad="lg"><p className="v2b-idea">{scrubContacts(p.idea).text}</p>
              <div className="v2b-by"><Avatar name={who} size={44} /><div><b>{who}{p.verified ? " ✓" : ""}</b><span className="hint">{facts || "Colatch creator"}</span></div></div>
            </Card>
          </Section>
          <Section id="cost" title="What it costs" sub="Shown before you book. The price is locked once your payment is recorded.">
            <Card>
              <Facts label="Price breakdown" items={[
                { label: "Creator's price", value: inr(allIn.creatorFee) },
                { label: `Colatch fee (${allIn.pct}%)`, value: inr(allIn.colatch) },
                { label: "GST on Colatch fee", value: inr(allIn.gstOnColatch) },
                { label: "All in", value: inr(allIn.total) },
              ]} />
              <p className="hint" style={{ margin: "12px 0 0" }}>Creator GST is added only if they are GST-registered. You pay only after you approve the creator, and your money is held by Colatch until the post is live and checked.</p>
            </Card>
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
