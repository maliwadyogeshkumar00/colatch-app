import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import PublicShell from "../../../_ui/PublicShell";
import DealRail from "../../../_ui/DealRail";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { inr, str } from "@/lib/net/creators";
import { takeHome, fyStart, logEvent, applyAutoApprove, countdown, checklist, lines } from "@/lib/net/deal";
import { DISCLOSURE_LINE } from "@/lib/net/compliance";
import { PAY_LABEL } from "@/lib/net/campaign";
import { scrubContacts } from "@/lib/net/guard";
import { goingDirectLosses } from "@/lib/net/trust";

export const metadata = { title: "Deal · Colatch", robots: { index: false } };

const kindLabel = { funded: "Brand funded the deal", sow: "You accepted the terms", draft: "You sent a draft", changes: "Brand asked for changes", approved: "Draft approved", live: "Post verified live", released: "Payment released", paid: "Paid", note: "You", results: "Results updated" };
const load = (id, creatorId) => env.DB.prepare("SELECT * FROM creator_deals WHERE id=? AND creator_id=?").bind(id, creatorId).first();
const back = (id, tone, msg) => `/creator/deals/${id}?tone=${tone}&msg=${encodeURIComponent(msg)}`;

/** Load the deal for a Server Action, or bounce. */
async function ctx(fd) {
  const id = String(fd.get("id") ?? "");
  const me = await currentCreator();
  if (!me) redirect(`/creator/login?next=${encodeURIComponent(`/creator/deals/${id}`)}`);
  const d = await load(id, me.creator.id);
  if (!d) redirect("/creator/applications");
  const k = d.campaign_id ? await env.DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(d.campaign_id).first() : null;
  return { d, k };
}

async function accept(fd) {
  "use server";
  const { d } = await ctx(fd);
  if (d.sow_accepted_at) redirect(`/creator/deals/${d.id}`);
  if (!fd.get("agree")) redirect(back(d.id, "bad", "Tick the box to accept the terms."));
  await env.DB.prepare("UPDATE creator_deals SET sow_accepted_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(d.id).run();
  await logEvent(env, d.id, "creator", "sow", "Accepted the deal terms");
  redirect(back(d.id, "good", "Terms accepted. We will tell you as soon as the brand funds the deal."));
}

async function sendDraft(fd) {
  "use server";
  const { d, k } = await ctx(fd);
  if (!["none", "changes"].includes(d.draft_status)) redirect(`/creator/deals/${d.id}`);
  const url = str(fd.get("draft_url"));
  if (!url || !/^https?:\/\//.test(url)) redirect(back(d.id, "bad", "Paste a link to your draft (Google Drive, Dropbox or WeTransfer)."));
  if (!fd.get("disclosure")) redirect(back(d.id, "bad", "Confirm the paid-partnership disclosure before submitting."));
  const must = lines(k?.mandatories);
  const ticks = {};
  must.forEach((_, i) => { ticks[String(i)] = Boolean(fd.get(`m${i}`)); });
  const hours = Number(k?.approve_hours) || 72;
  await env.DB.prepare("UPDATE creator_deals SET draft_url=?, draft_status='submitted', draft_submitted_at=datetime('now'), auto_approve_at=?, checklist_json=?, updated_at=datetime('now') WHERE id=?")
    .bind(url, new Date(Date.now() + hours * 36e5).toISOString(), JSON.stringify(ticks), d.id).run();
  await logEvent(env, d.id, "creator", "draft", url + (str(fd.get("note")) ? "\n" + scrubContacts(String(fd.get("note"))).text : ""));
  redirect(back(d.id, "good", `Draft sent. If the brand doesn't reply within ${hours} hours, it is approved automatically.`));
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
  const { d } = await ctx(fd);
  if (d.draft_status !== "approved" || d.live_at) redirect(`/creator/deals/${d.id}`);
  const url = str(fd.get("post_url"));
  if (!url || !/instagram\.com|youtu/.test(url)) redirect(back(d.id, "bad", "Paste the link to your live post."));
  await env.DB.prepare("UPDATE creator_deals SET post_url=?, updated_at=datetime('now') WHERE id=?").bind(url, d.id).run();
  await logEvent(env, d.id, "creator", "note", `Posted: ${url}`);
  redirect(back(d.id, "good", "Thanks! We will verify the post and start your payment clock."));
}

async function reportBypass(fd) {
  "use server";
  const { d } = await ctx(fd);
  const note = str(fd.get("note"));
  if (!note || note.length < 10) redirect(back(d.id, "bad", "Tell us in a line what happened, for example who asked and how."));
  const dup = await env.DB.prepare("SELECT id FROM bypass_reports WHERE deal_id=? AND reporter_side='creator' AND status='open'").bind(d.id).first();
  if (dup) redirect(back(d.id, "good", "We already have your report for this deal. The team is looking into it."));
  await env.DB.prepare("INSERT INTO bypass_reports (id, deal_id, campaign_id, reporter_side, reporter_id, note) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), d.id, d.campaign_id, "creator", d.creator_id, note.slice(0, 1000)).run();
  await logEvent(env, d.id, "creator", "note", "Reported an off-platform contact attempt");
  redirect(back(d.id, "good", "Thank you. The Colatch team will look into it within 72 hours. If it's confirmed, ₹500 is added to your earnings."));
}

export default async function Page({ params, searchParams }) {
  const me = await currentCreator();
  if (!me) redirect(`/creator/login?next=${encodeURIComponent(`/creator/deals/${params.id}`)}`);
  let d = await load(params.id, me.creator.id);
  if (!d) notFound();
  const k = d.campaign_id ? await env.DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(d.campaign_id).first() : null;
  const must = lines(k?.mandatories);
  const avoid = lines(k?.exclusions);
  if (await applyAutoApprove(env, d)) d = await load(params.id, me.creator.id);
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

  return (
    <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator/applications">
      <div className="spread" style={{ marginBottom: 16 }}>
        <div><div className="lbl">{PAY_LABEL[k?.pay_type || "cash"]} deal</div><h1 style={{ margin: "6px 0 0", fontWeight: 300, fontSize: 30, color: "var(--p900)" }}>{d.sow_accepted_at ? d.brand || "Brand" : "Brand revealed after you accept"} · <b style={{ fontWeight: 600 }}>{d.deliverable || "Deliverables"}</b></h1></div>
        {k?.slug && <a className="btn" href={`/creator/o/${k.slug}`}>See the brief</a>}
      </div>
      {flash && <div className={`note ${tone}`} style={{ marginBottom: 16 }}>{flash}</div>}
      <DealRail d={d} side="creator" />

      <div className="grid2 sec" style={{ alignItems: "start", marginTop: 18 }}>
        <div className="stack">
          {!d.sow_accepted_at && (
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
                <tr><td>If the brand cancels</td><td>After you start work, you keep at least 50% of the fee</td></tr>
              </tbody></table>
              <label className="row" style={{ marginTop: 16, gap: 10, flexWrap: "nowrap", fontSize: 13.5, alignItems: "flex-start" }}><input type="checkbox" name="agree" value="1" style={{ marginTop: 3 }} /><span>I accept these terms and will follow ASCI disclosure rules.</span></label>
              <button className="btn-foil" style={{ marginTop: 16 }}>Accept terms</button>
            </form>
          )}

          {d.sow_accepted_at && ["none", "changes"].includes(d.draft_status) && (
            <form className="panel pad" action={sendDraft}>
              {hid}
              <div className="spread"><h2 style={{ margin: 0 }}>{d.draft_status === "changes" ? "Send the revised draft" : "Send your draft"}</h2><span className={`pill ${revLeft ? "good" : "ok"}`}>{revLeft} of {d.revisions_included} revisions left</span></div>
              {d.pay_status === "unfunded" && <div className="note warn" style={{ marginTop: 12 }}>The brand hasn't funded this deal yet. You can send a draft, but we recommend waiting for the "Brand funded" tick.</div>}
              {feedback && d.draft_status === "changes" && <div className="note info" style={{ marginTop: 12, whiteSpace: "pre-line" }}><b>Brand feedback:</b> {feedback.note}</div>}
              <div className="fld" style={{ marginTop: 14 }}><label>Draft link</label><input name="draft_url" required placeholder="Google Drive / Dropbox / WeTransfer link" defaultValue={d.draft_url ?? ""} /></div>
              {must.length > 0 && <div className="fld" style={{ marginTop: 14 }}><label>Brief checklist</label>{must.map((m, i) => <label key={i} className="row" style={{ gap: 10, flexWrap: "nowrap", marginTop: 6, fontSize: 14 }}><input type="checkbox" name={`m${i}`} value="1" defaultChecked={Boolean(ticks[String(i)])} /><span>{m}</span></label>)}</div>}
              {avoid.length > 0 && <div className="note bad" style={{ marginTop: 12 }}><b>Don't:</b> {avoid.join(" · ")}</div>}
              <label className="row" style={{ marginTop: 14, gap: 10, flexWrap: "nowrap", fontSize: 13.5, alignItems: "flex-start" }}><input type="checkbox" name="disclosure" value="1" style={{ marginTop: 3 }} /><span>{DISCLOSURE_LINE}</span></label>
              <div className="fld" style={{ marginTop: 14 }}><label>Note to the brand <span className="opt">— optional</span></label><input name="note" /></div>
              <button className="btn-foil" style={{ marginTop: 16 }}>Send draft</button>
            </form>
          )}

          {d.draft_status === "submitted" && <div className="panel pad"><h2>Draft in review</h2><p style={{ margin: 0 }}>The brand has until <b>{d.auto_approve_at ? new Date(d.auto_approve_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"}</b> to reply ({countdown(d.auto_approve_at)} left). If they don't, your draft is approved automatically.</p></div>}

          {d.draft_status === "approved" && !d.live_at && (
            <form className="panel pad" action={postLive}>
              {hid}
              <h2>Post it and share the link</h2>
              <p className="muted" style={{ margin: "0 0 12px" }}>Your payment clock starts when we verify the live post{d.fee ? `: paid within ${payDays} days` : ""}.</p>
              {d.track_code && <div className="note info" style={{ marginBottom: 12 }}>Use code <b>{d.track_code}</b> in your caption or story, and the link <code className="k">{origin}/go/{d.track_code}</code>. That's how the brand sees the sales you drive.</div>}
              <div className="fld"><label>Live post link</label><input name="post_url" required placeholder="https://www.instagram.com/reel/…" defaultValue={d.post_url ?? ""} /></div>
              <button className="btn-foil" style={{ marginTop: 14 }}>Submit live link</button>
            </form>
          )}

          {d.live_at && <div className="panel pad"><h2>Payment</h2>
            {d.pay_status === "paid" ? <div className="note good">Paid on {String(d.paid_at ?? "").slice(0, 10)} · bank reference (UTR) <b>{d.utr}</b>{d.tds_amount ? ` · TDS ${inr(d.tds_amount)} (shows in your Form 26AS)` : ""}</div>
              : <p style={{ margin: 0 }}>Your post went live on {String(d.live_at).slice(0, 10)}. Payment due by <b>{payBy}</b>. {d.pay_status === "released" ? "Payment is released and on its way to your account." : ""}</p>}
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

        <div className="stack">
          {th && <div className="panel pad">
            <h2>What you take home</h2>
            <table className="tbl"><tbody>
              <tr><td>Your fee</td><td className="num">{inr(th.fee)}</td></tr>
              <tr><td>TDS {th.tds ? "10%" : "(not yet: under ₹50,000 this year)"}</td><td className="num">{th.tds ? `−${inr(th.tds)}` : "₹0"}</td></tr>
              <tr><td><b>Paid to you</b></td><td className="num"><b>{inr(th.net)}</b></td></tr>
            </tbody></table>
            <p className="hint" style={{ margin: "10px 0 0" }}>TDS isn't lost: it's credited against your income tax, and you can claim it back in your ITR. If you're GST-registered, GST is paid on top of your fee.</p>
          </div>}
          <div className="panel pad">
            <h2>Timeline</h2>
            {events.length ? events.map((e) => <div key={e.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line-2)" }}><div className="spread"><b className="small">{kindLabel[e.kind] || e.kind}</b><span className="hint">{String(e.created_at).slice(5, 16)}</span></div>{e.note && e.kind !== "paid" && <div className="small muted" style={{ whiteSpace: "pre-line", marginTop: 2 }}>{e.note}</div>}</div>) : <p className="hint">Nothing yet.</p>}
          </div>
          <div className="panel pad" style={{ borderStyle: "dashed", borderColor: "rgba(155,59,59,.35)" }}>
            <h2>What you'd lose going direct</h2>
            {goingDirectLosses({ funded: d.pay_status !== "unfunded", fee: d.fee, payDays }).map((x) => <div key={x.title} className="small" style={{ padding: "5px 0", color: "var(--ink-2)" }}><b>{x.title}.</b> {x.line}</div>)}
          </div>
          <details className="panel pad">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Someone asked to deal outside Colatch?</summary>
            <form action={reportBypass} style={{ marginTop: 12 }}>
              {hid}
              <p className="small muted" style={{ margin: "0 0 10px" }}>Asked for your number, to move to DMs, or to be paid directly? Tell us. It stays private, and a confirmed report adds ₹500 to your earnings.</p>
              <div className="fld"><label>What happened</label><textarea name="note" rows={3} required minLength={10} maxLength={1000} placeholder="The brand's manager asked for my WhatsApp to send the product directly…" /></div>
              <button className="btn sm" style={{ marginTop: 10 }}>Send report</button>
            </form>
          </details>
          <p className="hint">Questions about this deal? WhatsApp the Colatch team from the number in your welcome message. Colatch never asks you to pay anything.</p>
        </div>
      </div>
    </PublicShell>
  );
}
