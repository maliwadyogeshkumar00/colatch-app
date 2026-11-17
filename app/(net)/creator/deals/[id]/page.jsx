import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import PublicShell from "../../../_ui/PublicShell";
import DealRail from "../../../_ui/DealRail";
import { PageHeader, KpiStrip, Grid, Section } from "@/components/ui";
import { inrShort } from "@/lib/net/dashboard";
import { istDay, istShort } from "@/components/creator/Parts";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { inr, str } from "@/lib/net/creators";
import { takeHome, fyStart, logEvent, applyAutoApprove, countdown, checklist, lines, isClosed } from "@/lib/net/deal";
import { transition, FlowError } from "@/lib/net/dealflow";
import { audit } from "@/lib/net/security";
import { DISCLOSURE_LINE } from "@/lib/net/compliance";
import { PAY_LABEL } from "@/lib/net/campaign";
import { scrubContacts, safeUrl } from "@/lib/net/guard";
import { goingDirectLosses } from "@/lib/net/trust";
import { REASONS, raiseDispute, DisputeError, openDispute, lastClosedDispute } from "@/lib/net/disputes";
import { logError } from "@/lib/net/security";
import DealThread from "@/components/deal/DealThread";
import { UsageLine, ShipmentStatus } from "@/components/deal/DealExtras";
import { listMessages, unreadCount, markRead, postMessage, notifyMessage, MessageError } from "@/lib/net/messages";
import { listShipments } from "@/lib/net/shipments";
import { syncUsageStart } from "@/lib/net/usage";

export const metadata = { title: "Deal", robots: { index: false } };

const kindLabel = { cancelled: "Deal cancelled", refunded: "Brand refunded", live_link: "You shared the live link", signoff: "Brand signed off", funded: "Brand funded the deal", sow: "You accepted the terms", draft: "You sent a draft", changes: "Brand asked for changes", approved: "Draft approved", live: "Post verified live", released: "Payout approved", paid: "Paid", note: "You", results: "Results updated" };
const load = (id, creatorId) => env.DB.prepare("SELECT * FROM creator_deals WHERE id=? AND creator_id=?").bind(id, creatorId).first();
const back = (id, tone, msg) => `/creator/deals/${id}?tone=${tone}&msg=${encodeURIComponent(msg)}`;

/** Load the deal for a Server Action, or bounce. */
async function ctx(fd) {
  const id = String(fd.get("id") ?? "");
  const me = await currentCreator();
  if (!me) redirect(`/creator/login?next=${encodeURIComponent(`/creator/deals/${id}`)}`);
  if (me.claimPending || (await claimPending(me.accountId))) redirect(`/creator/deals/${encodeURIComponent(id)}`);
  const d = await load(id, me.creator.id);
  if (!d) redirect("/creator/applications");
  const k = d.campaign_id ? await env.DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(d.campaign_id).first() : null;
  return { d, k, me };
}

/** Someone who joined with the handle of a creator Colatch imported must be verified before they see that creator's deals. */
const claimPending = async (accountId) =>
  (await env.DB.prepare("SELECT claim_status FROM creator_accounts WHERE id=?").bind(accountId).first().catch(() => null))?.claim_status === "pending";

/** Run one deal step as this creator. FlowError messages are shown to the creator; anything else is logged. */
async function step(d, me, name, input, ok, after) {
  try {
    await transition(d.id, name, { kind: "creator", id: me.creator.id }, input);
  } catch (e) {
    if (e instanceof FlowError) redirect(back(d.id, "bad", e.message));
    console.error("[creator/deal]", name, e);
    redirect(back(d.id, "bad", "Something went wrong, nothing was changed. Try again."));
  }
  if (after) await after().catch((e) => console.error("[creator/deal] after", name, e));
  redirect(back(d.id, "good", ok));
}

async function accept(fd) {
  "use server";
  const { d, me } = await ctx(fd);
  if (!fd.get("agree")) redirect(back(d.id, "bad", "Tick the box to accept the terms."));
  await step(d, me, "accept_terms", {}, d.pay_status === "unfunded" ? "Terms accepted. You can start once the brand payment is in; it shows as a tick on the rail." : "Terms accepted. You can send your draft.");
}

async function sendDraft(fd) {
  "use server";
  const { d, k, me } = await ctx(fd);
  if (!fd.get("disclosure")) redirect(back(d.id, "bad", "Confirm the paid-partnership disclosure before submitting."));
  const must = lines(k?.mandatories);
  const ticks = {};
  must.forEach((_, i) => { ticks[String(i)] = Boolean(fd.get(`m${i}`)); });
  const hours = Number(k?.approve_hours) || 72;
  const note = str(fd.get("note"));
  await step(d, me, "submit_draft", { draft_url: str(fd.get("draft_url")) || "", approve_hours: hours, checklist_json: JSON.stringify(ticks) },
    `Draft sent. If the brand doesn't reply within ${hours} hours, it is approved automatically.`,
    note ? () => logEvent(env, d.id, "creator", "note", scrubContacts(note).text.slice(0, 600)) : null);
}

async function rate(fd) {
  "use server";
  const { d } = await ctx(fd);
  if (!d.live_at) redirect(`/creator/deals/${d.id}`);
  const stars = Math.max(1, Math.min(5, Number(fd.get("stars")) || 0));
  await env.DB.prepare("INSERT OR IGNORE INTO ratings (id, deal_id, by_side, stars, note) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), d.id, "creator", stars, scrubContacts(String(fd.get("note") ?? "")).text.slice(0, 300) || null).run();
  redirect(back(d.id, "good", "Thanks. Your rating stays anonymous and helps other creators."));
}

async function postLive(fd) {
  "use server";
  const { d, me } = await ctx(fd);
  await step(d, me, "submit_live_link", { post_url: str(fd.get("post_url")) || "" }, "Thanks! The team will check the post; your payment clock starts once it's verified.");
}

async function reportBypass(fd) {
  "use server";
  const { d } = await ctx(fd);
  const note = str(fd.get("note"));
  if (!note || note.length < 10) redirect(back(d.id, "bad", "Tell us in a line what happened, for example who asked and how."));
  // One report per deal per side, ever (unique index), so the bounty can't be claimed twice.
  const dup = await env.DB.prepare("SELECT id FROM bypass_reports WHERE deal_id=? AND reporter_side='creator'").bind(d.id).first();
  if (dup) redirect(back(d.id, "good", "We already have your report for this deal. The team is looking into it."));
  const id = crypto.randomUUID();
  const r = await env.DB.prepare("INSERT INTO bypass_reports (id, deal_id, campaign_id, reporter_side, reporter_id, note) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING")
    .bind(id, d.id, d.campaign_id, "creator", d.creator_id, note.slice(0, 1000)).run();
  if (!r.meta?.changes) redirect(back(d.id, "good", "We already have your report for this deal. The team is looking into it."));
  await logEvent(env, d.id, "creator", "note", "Reported an off-platform contact attempt");
  await audit({ kind: "creator", id: d.creator_id }, "bypass.report", "deal", d.id, { report: id });
  redirect(back(d.id, "good", "Thank you. The Colatch team will look into it. If it's confirmed, ₹500 is added to your earnings."));
}

async function dispute(fd) {
  "use server";
  const { d, me } = await ctx(fd);
  let err = "";
  try {
    await raiseDispute(d.id, { kind: "creator", id: me.creator.id }, String(fd.get("reason") ?? ""), String(fd.get("detail") ?? ""));
  } catch (e) {
    if (e instanceof DisputeError) err = e.message;
    else { await logError("creator/deal.dispute", e, { deal: d.id }); err = "Something went wrong, nothing was sent. Try again."; }
  }
  redirect(err ? back(d.id, "bad", err) : back(d.id, "good", "Dispute sent. The Colatch team will look into it and reply here and by email."));
}

/** A message to the brand and the Colatch team on this deal. Contact details are scrubbed before it is stored. */
async function sendMessage(fd) {
  "use server";
  const { d, me } = await ctx(fd);
  if (isClosed(d)) redirect(back(d.id, "bad", "This deal is closed, so messages are off. WhatsApp the Colatch team if you need anything.") + "#messages");
  let r;
  try {
    r = await postMessage(d.id, { kind: "creator", id: me.creator.id }, fd.get("body"), fd.get("mid"));
  } catch (e) {
    if (e instanceof MessageError) redirect(back(d.id, "bad", e.message) + "#messages");
    await logError("creator/deal.message", e, { deal: d.id });
    redirect(back(d.id, "bad", "Something went wrong, your message wasn't sent. Try again.") + "#messages");
  }
  if (r.created) await notifyMessage(d.id, r.id, { kind: "creator", id: me.creator.id });
  redirect(back(d.id, "good", !r.created ? "That message was already sent." : r.scrubbed ? "Message sent. Contact details were hidden: keep the deal on Colatch." : "Message sent.") + "#messages");
}

export default async function Page({ params, searchParams }) {
  const me = await currentCreator();
  if (!me) redirect(`/creator/login?next=${encodeURIComponent(`/creator/deals/${params.id}`)}`);
  if (me.claimPending || (await claimPending(me.accountId))) {
    return (
      <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator/applications">
        <div className="panel pad"><h2>We're verifying your profile</h2>
          <p style={{ margin: 0 }}>This creator profile was already on Colatch before you joined, so the team is checking that it's yours. Deal and payment details appear here once that's done. Usually within one working day.</p></div>
      </PublicShell>
    );
  }
  let d = await load(params.id, me.creator.id);
  if (!d) notFound();
  const k = d.campaign_id ? await env.DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(d.campaign_id).first() : null;
  const must = lines(k?.mandatories);
  const avoid = lines(k?.exclusions);
  if (await applyAutoApprove(env, d)) d = await load(params.id, me.creator.id);
  const closed = isClosed(d);
  const flash = searchParams?.msg || "";
  const tone = searchParams?.tone === "bad" ? "bad" : "good";
  const events = (await env.DB.prepare("SELECT * FROM deal_events WHERE deal_id=? AND kind <> 'note' OR (deal_id=? AND actor='creator') ORDER BY created_at DESC LIMIT 30").bind(d.id, d.id).all()).results ?? [];
  const feedback = await env.DB.prepare("SELECT note, created_at FROM deal_events WHERE deal_id=? AND kind='changes' ORDER BY created_at DESC LIMIT 1").bind(d.id).first();
  const fy = (await env.DB.prepare("SELECT COALESCE(SUM(fee),0) s FROM creator_deals WHERE creator_id=? AND pay_status='paid' AND paid_at >= ? AND id <> ?").bind(me.creator.id, fyStart(), d.id).first())?.s ?? 0;
  const th = d.fee ? takeHome(d.fee, Number(fy)) : null;
  const ticks = checklist(d.checklist_json);
  const payDays = k?.payment_days ?? 30;
  const payBy = d.live_at ? new Date(Date.parse(String(d.live_at).replace(" ", "T") + "Z") + payDays * 864e5).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  const revLeft = Math.max(0, d.revisions_included - d.revisions_used);
  const myRating = await env.DB.prepare("SELECT stars FROM ratings WHERE deal_id=? AND by_side='creator'").bind(d.id).first();
  const origin = `https://${headers().get("host")}`;
  const hid = <input type="hidden" name="id" value={d.id} />;
  const myDispute = await openDispute(d.id, "creator").catch(() => null);
  // A dispute the brand or the Colatch team opened on this deal shows here too (reason only, not their notes).
  const brandDispute = myDispute ? null : await openDispute(d.id, "brand").catch(() => null);
  const teamDispute = myDispute || brandDispute ? null : await openDispute(d.id, "team").catch(() => null);
  const otherDispute = brandDispute || teamDispute;
  const otherBy = brandDispute ? "The brand" : "The Colatch team";
  const lastDispute = myDispute ? null : await lastClosedDispute(d.id, "creator").catch(() => null);
  // Deal room: messages, product shipment and usage rights. Each part is optional so the page never breaks on it.
  await syncUsageStart(d).catch(() => false);
  const reader = { kind: "creator", id: me.creator.id };
  const thread = await listMessages(d.id).catch(() => []);
  const unread = await unreadCount(d.id, reader).catch(() => 0);
  if (thread.length) await markRead(d.id, reader).catch(() => {});
  const shipments = await listShipments(d.id).catch(() => []);

  const fmtFee = d.fee ? inrShort(d.fee) : "Product";
  const payByT = d.live_at ? Date.parse(String(d.live_at).replace(" ", "T") + "Z") + payDays * 864e5 : null;
  const dueDay = payByT ? istShort(new Date(payByT)) : d.go_live_date ? istShort(d.go_live_date) || d.go_live_date : null;
  const dueYear = payByT ? istDay(new Date(payByT)) : d.go_live_date ? istDay(d.go_live_date) : null;
  return (
    <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator/applications">
      <div className="cr-page">
        <PageHeader crumbs={[{ label: "My deals", href: "/creator/applications" }, d.deliverable || "Deal"]} eyebrow={PAY_LABEL[k?.pay_type || "cash"]}
          title={<>{d.sow_accepted_at ? d.brand || "Brand" : "Brand revealed after you accept"} · <b>{d.deliverable || "Deliverables"}</b></>}
          actions={k?.slug ? <a className="btn sm" href={`/creator/o/${k.slug}`}>See the brief</a> : null} />
        {flash && <div className={`note ${tone}`}>{flash}</div>}
        <DealRail d={d} side="creator" />
        <KpiStrip label="Deal money and dates" items={[
          { label: "Your fee", value: fmtFee, title: d.fee ? inr(d.fee) : undefined, foot: d.fee ? `Paid within ${payDays} days of going live` : "No cash fee on this deal" },
          { label: "Take-home (estimate)", value: th ? inrShort(th.net) : "—", title: th ? inr(th.net) : undefined, foot: th ? (th.tds ? `After ${inr(th.tds)} TDS you can claim back` : "No TDS expected") : "Shows once a fee is set" },
          { label: payBy ? "Payment due" : "Go-live", value: dueDay || "Not set", title: dueYear || undefined, foot: payBy ? (d.pay_status === "paid" ? `${dueYear} · paid` : `${dueYear} · from your verified post`) : dueYear ? `${dueYear} · agreed with the team` : "Agreed with the Colatch team" },
          { label: "Revisions left", value: `${revLeft} of ${d.revisions_included}`, foot: "More only with your OK and a fee" },
        ]} />

        <Grid aside={<>
          <div className="panel pad dr-panel">
            <DealThread id="messages" messages={thread} me="creator" unread={unread} action={sendMessage} canPost={!closed} hidden={[["id", d.id]]} mid={crypto.randomUUID()}
              names={{ brand: d.sow_accepted_at ? d.brand || "Brand" : "Brand" }} readOnlyNote="This deal is closed, so messages are off." />
          </div>
          {(shipments.length > 0 || d.usage_channels) && <div className="panel pad dr-panel">
            <ShipmentStatus shipments={shipments} showCarrier title={shipments.length === 1 ? "Product shipment" : "Product shipments"} />
            {d.usage_channels && <><h2 style={{ marginTop: shipments.length ? 18 : 0 }}>Usage rights</h2><UsageLine d={d} /></>}
          </div>}
          {th && <div className="panel pad">
            <h2>What you take home</h2>
            <table className="tbl"><tbody>
              <tr><td>Your fee</td><td className="num">{inr(th.fee)}</td></tr>
              <tr><td>TDS (estimate)</td><td className="num">{th.tds ? `−${inr(th.tds)}` : "₹0"}</td></tr>
              <tr><td><b>Paid to you (estimate)</b></td><td className="num"><b>{inr(th.net)}</b></td></tr>
            </tbody></table>
            <p className="hint" style={{ margin: "10px 0 0" }}>This is an estimate. The actual TDS, if any, is shown with your payment. TDS isn't lost: it's credited against your income tax, and you can claim it back in your ITR. If you're GST-registered, GST is paid on top of your fee.</p>
          </div>}
          <div className="panel pad">
            <h2>Timeline</h2>
            {events.length ? events.map((e) => <div key={e.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line-2)" }}><div className="spread"><b className="small">{kindLabel[e.kind] || e.kind}</b><span className="hint">{istDay(e.created_at)}</span></div>{e.note && e.kind !== "paid" && <div className="small muted" style={{ whiteSpace: "pre-line", marginTop: 2 }}>{e.note}</div>}</div>) : <p className="hint">Nothing yet.</p>}
          </div>
          <div className="panel pad" style={{ borderStyle: "dashed", borderColor: "var(--line-3)" }}>
            <h2>What you'd lose going direct</h2>
            {goingDirectLosses({ funded: d.pay_status !== "unfunded", fee: d.fee, payDays }).map((x) => <div key={x.title} className="small" style={{ padding: "5px 0", color: "var(--ink-2)" }}><b>{x.title}.</b> {x.line}</div>)}
          </div>
          <details className="panel pad">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Someone asked to deal outside Colatch?</summary>
            <form action={reportBypass} style={{ marginTop: 12 }}>
              {hid}
              <p className="small muted" style={{ margin: "0 0 10px" }}>Asked for your number, to move to DMs, or to be paid directly? Tell us. It stays private, and a confirmed report adds ₹500 to your earnings.</p>
              <div className="fld"><label htmlFor="f-creator-deals-id-note-4">What happened</label><textarea id="f-creator-deals-id-note-4" name="note" rows={3} required minLength={10} maxLength={1000} placeholder="The brand's manager asked for my WhatsApp to send the product directly…" /></div>
              <button className="btn sm" style={{ marginTop: 10 }}>Send report</button>
            </form>
          </details>
          {myDispute ? (
            <div className="panel pad"><span className="pill mine">Dispute open</span>
              <p className="small" style={{ margin: "10px 0 0" }}>You raised a dispute about <b>{(REASONS[myDispute.reason] || myDispute.reason).toLowerCase()}</b>. The Colatch team is looking into it and will reply here and by email.</p></div>
          ) : otherDispute ? (
            <div className="panel pad"><span className="pill mine">Dispute open</span>
              <p className="small" style={{ margin: "10px 0 0" }}>{otherBy} raised a dispute on this deal about <b>{(REASONS[otherDispute.reason] || otherDispute.reason).toLowerCase()}</b>. The Colatch team is looking into it and will reply here and by email. Raising a dispute doesn't move or hold any money by itself.</p></div>
          ) : (
            <details className="panel pad">
              <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>Something wrong? Raise a dispute</summary>
              {lastDispute && <div className="note info" style={{ marginTop: 12 }}><span className={`pill ${lastDispute.status === "resolved" ? "good" : "low"}`}>{lastDispute.status === "resolved" ? "Resolved" : "Not upheld"}</span> <span style={{ whiteSpace: "pre-line" }}>{lastDispute.resolution}</span></div>}
              <form action={dispute} style={{ marginTop: 12 }}>
                {hid}
                <p className="small muted" style={{ margin: "0 0 10px" }}>For problems with the work, the timeline, payment or terms. The team reads every dispute and replies in writing. Raising one doesn't move or hold any money by itself.</p>
                <div className="fld"><label htmlFor="f-cd-dispute-reason">What it's about</label>
                  <select id="f-cd-dispute-reason" name="reason" required defaultValue="">{[<option key="" value="" disabled>Choose one</option>, ...Object.entries(REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)]}</select></div>
                <div className="fld" style={{ marginTop: 10 }}><label htmlFor="f-cd-dispute-detail">What happened</label><textarea id="f-cd-dispute-detail" name="detail" rows={3} required minLength={10} maxLength={2000} placeholder="Dates, what was agreed, and what went wrong." /></div>
                <button className="btn" style={{ marginTop: 10, minHeight: 44 }}>Send dispute</button>
              </form>
            </details>
          )}
          <p className="hint">Questions about this deal? WhatsApp the Colatch team from the number in your welcome message. Colatch never asks you to pay anything.</p>
        </>}>
          <Section id="next" title={closed ? "Deal closed" : "Your next step"} sub={closed ? null : "Everything you need to do on this deal happens here."}>
            <div className="stack">
          {closed && <div className="panel pad"><h2>This deal was cancelled</h2><p style={{ margin: 0 }}>Nothing more to do here. If you had already started work, message the Colatch team.</p></div>}
          {!closed && !d.sow_accepted_at && (
            <form className="panel pad" action={accept}>
              {hid}
              <h2>Statement of work</h2>
              <table className="tbl"><tbody>
                <tr><td>Deliverables</td><td><b>{d.deliverable || "As in the brief"}</b></td></tr>
                <tr><td>Fee</td><td><b>{d.fee ? inr(d.fee) : "Product only"}</b>{d.fee ? ` · paid within ${payDays} days of going live` : ""}</td></tr>
                <tr><td>Revisions</td><td>{d.revisions_included} rounds included; more only with your OK and an extra fee</td></tr>
                <tr><td>Usage</td><td>{k?.usage_rights || "Organic posting only"}</td></tr>
                <tr><td>Keep live</td><td>At least 30 days</td></tr>
                <tr><td>Go-live</td><td>{d.go_live_date || "Agreed with the team"}</td></tr>
                <tr><td>If the brand cancels</td><td>Talk to the Colatch team. The brand's payment stays with Colatch until it is settled.</td></tr>
              </tbody></table>
              <label className="row" style={{ marginTop: 16, gap: 10, flexWrap: "nowrap", fontSize: 13.5, alignItems: "flex-start" }}><input type="checkbox" name="agree" value="1" style={{ marginTop: 3 }} /><span>I accept these terms and will follow ASCI disclosure rules.</span></label>
              <button className="btn-foil" style={{ marginTop: 16 }}>Accept terms</button>
            </form>
          )}

          {!closed && d.sow_accepted_at && d.pay_status === "unfunded" && <div className="panel pad"><h2>Waiting for the brand's payment</h2><p style={{ margin: 0 }}>Don't start yet. Once the brand's money is with Colatch, the "Brand funded" step ticks and you can send your draft.</p></div>}
          {!closed && d.sow_accepted_at && d.pay_status !== "unfunded" && ["none", "changes"].includes(d.draft_status) && (
            <form className="panel pad" action={sendDraft}>
              {hid}
              <div className="spread"><h2 style={{ margin: 0 }}>{d.draft_status === "changes" ? "Send the revised draft" : "Send your draft"}</h2><span className={`pill ${revLeft ? "good" : "ok"}`}>{revLeft} of {d.revisions_included} revisions left</span></div>
              {feedback && d.draft_status === "changes" && <div className="note info" style={{ marginTop: 12, whiteSpace: "pre-line" }}><b>Brand feedback:</b> {feedback.note}</div>}
              <div className="fld" style={{ marginTop: 14 }}><label htmlFor="f-creator-deals-id-draft-url-1">Draft link</label><input id="f-creator-deals-id-draft-url-1" name="draft_url" type="url" required pattern="https://.*" placeholder="https:// Google Drive / Dropbox / WeTransfer link" defaultValue={d.draft_url ?? ""} /></div>
              {must.length > 0 && <div className="fld" style={{ marginTop: 14 }}><label>Brief checklist</label>{must.map((m, i) => <label key={i} className="row" style={{ gap: 10, flexWrap: "nowrap", marginTop: 6, fontSize: 14 }}><input type="checkbox" name={`m${i}`} value="1" defaultChecked={Boolean(ticks[String(i)])} /><span>{m}</span></label>)}</div>}
              {avoid.length > 0 && <div className="note info" style={{ marginTop: 12 }}><b>Don't:</b> {avoid.join(" · ")}</div>}
              <label className="row" style={{ marginTop: 14, gap: 10, flexWrap: "nowrap", fontSize: 13.5, alignItems: "flex-start" }}><input type="checkbox" name="disclosure" value="1" style={{ marginTop: 3 }} /><span>{DISCLOSURE_LINE}</span></label>
              <div className="fld" style={{ marginTop: 14 }}><label htmlFor="f-creator-deals-id-note-2">Note to the brand <span className="opt">— optional</span></label><input id="f-creator-deals-id-note-2" name="note" /></div>
              <button className="btn-foil" style={{ marginTop: 16 }}>Send draft</button>
            </form>
          )}

          {d.draft_status === "submitted" && <div className="panel pad"><h2>Draft in review</h2><p style={{ margin: 0 }}>{d.auto_approve_at
            ? <>The brand has until <b>{new Date(d.auto_approve_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</b> to reply ({countdown(d.auto_approve_at)} left). If they don't, your draft is approved automatically.</>
            : <>The brand is reviewing your draft. We'll tell you as soon as they approve it or ask for changes.</>}</p></div>}

          {!closed && d.draft_status === "approved" && !d.live_at && d.post_url && <div className="note info">You shared {safeUrl(d.post_url) ? <a className="link" href={safeUrl(d.post_url)} target="_blank" rel="noopener noreferrer">your live post</a> : "your live post"}. The team is checking it. You can update the link below if it changed.</div>}
          {!closed && d.draft_status === "approved" && !d.live_at && (
            <form className="panel pad" action={postLive}>
              {hid}
              <h2>Post it and share the link</h2>
              <p className="muted" style={{ margin: "0 0 12px" }}>Your payment clock starts when we verify the live post{d.fee ? `: paid within ${payDays} days` : ""}.</p>
              {d.track_code && <div className="note info" style={{ marginBottom: 12 }}>Use code <b>{d.track_code}</b> in your caption or story, and the link <code className="k">{origin}/go/{d.track_code}</code>. That's how the brand sees the sales you drive.</div>}
              <div className="fld"><label htmlFor="f-creator-deals-id-post-url-3">Live post link</label><input id="f-creator-deals-id-post-url-3" name="post_url" type="url" required pattern="https://.*" placeholder="https://www.instagram.com/reel/…" defaultValue={d.post_url ?? ""} /></div>
              <button className="btn-foil" style={{ marginTop: 14 }}>Submit live link</button>
            </form>
          )}

          {d.live_at && <div className="panel pad"><h2>Payment</h2>
            {d.pay_status === "paid" ? <div className="note good">Paid on {istDay(d.paid_at) || "—"} · bank reference (UTR) <b>{d.utr}</b>{d.tds_amount ? ` · TDS ${inr(d.tds_amount)} (shows in your Form 26AS)` : ""}</div>
              : <p style={{ margin: 0 }}>Your post went live on {istDay(d.live_at)}. Payment due by <b>{payBy}</b>. {d.pay_status === "released" ? "Your payout is approved; you'll see the bank reference here once it's sent." : ""}</p>}
            {d.brand_signoff_at && <div className="note good" style={{ marginTop: 12 }}>The brand signed off your work{d.proof_public ? <>. <a className="link" href={`/proof/${d.id}`} target="_blank">Your verified proof ↗</a> is on your media kit.</> : "."}</div>}
            {!myRating ? (
              <form action={rate} className="row" style={{ marginTop: 12 }}>
                {hid}
                <span className="small">Rate this brand (anonymous):</span>
                <select className="in" name="stars" style={{ width: "auto" }}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select>
                <input className="in" name="note" style={{ flex: 1, minWidth: 160 }} placeholder="Paid on time? Clear brief?" />
                <button className="btn sm">Rate</button>
              </form>
            ) : <p className="hint" style={{ margin: "10px 0 0" }}>You rated this brand {"★".repeat(myRating.stars)}.</p>}
            {!me.creator.upi_id && <p className="hint" style={{ margin: "10px 0 0" }}>Add your UPI ID in <a className="link" href="/creator/profile#payout">your payout details</a> so we can pay you.</p>}
          </div>}

            </div>
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
