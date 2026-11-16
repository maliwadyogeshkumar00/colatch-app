import { redirect } from "next/navigation";
import { headers } from "next/headers";
import TeamShell from "../../../_ui/TeamShell";
import DealRail from "../../../_ui/DealRail";
import { flashUrl } from "../../../_ui/flash";
import { CopyButton } from "../../_client";
import { requireTeam } from "../../_guard";
import { env } from "@/lib/net/env";
import { compact, inr, str, STAGE_LABEL, canSetStage } from "@/lib/net/creators";
import { takeHome, fyStart, makeTrackCode, logEvent, applyAutoApprove, countdown, checklist, lines, nudge, isClosed } from "@/lib/net/deal";
import { transition, FlowError, formatPaise } from "@/lib/net/dealflow";
import { priceDeal } from "@/lib/net/pricing";
import { safeUrl } from "@/lib/net/guard";
import { can } from "@/lib/net/security";

export const metadata = { title: "Deal · Colatch Connect", robots: { index: false, follow: false } };

const load = (id) => env.DB.prepare("SELECT * FROM creator_deals WHERE id=?").bind(id).first();

// Which team permission each form needs. Checked again inside transition() against the role.
const STEP = {
  terms: ["edit_terms", "shortlist", "Terms saved."],
  fund: ["record_funding", "finance", "Brand payment recorded. The creator can start."],
  changes: ["request_changes", "shortlist", "Feedback sent to the creator."],
  approve: ["approve_draft", "shortlist", "Draft approved."],
  live: ["verify_live", "shortlist", "Live post verified."],
  release: ["approve_payout", "finance", "Payout approved. Send the money, then record the UTR."],
  paid: ["record_payout", "finance", "Payout recorded. The creator sees the UTR."],
  cancel: ["cancel", "team", "Deal cancelled."],
  refund: ["record_refund", "finance", "Refund recorded."],
  results: ["save_results", "shortlist", "Results saved."],
};

/** All deal-room forms post here with a hidden `action`. Every money or progress step goes through the deal state machine. */
async function act(fd) {
  "use server";
  const id = String(fd.get("id") ?? "");
  const a = String(fd.get("action") ?? "");
  const back = `/team/deals/${encodeURIComponent(id)}`;
  const step = STEP[a];
  // Permission first, inside the action: a Server Action can be called without loading the page.
  const me = await requireTeam(step ? (step[1] === "team" ? "shortlist" : step[1]) : "shortlist", back);
  let msg = "";
  let err = "";
  try {
    if (step) {
      const input = Object.fromEntries([...fd.entries()].filter(([k]) => typeof k === "string" && !k.startsWith("$") && !k.startsWith("__")).map(([k, v]) => [k, String(v)]));
      await transition(id, step[0], { kind: "team", id: me.email, role: me.role }, input);
      msg = step[2];
    } else if (a === "stage") {
      const d = await load(id);
      if (!d) throw new FlowError("That deal does not exist.", "not_found");
      const to = String(fd.get("stage") || "");
      const why = canSetStage(d, to);
      if (why) throw new FlowError(why);
      const r = await env.DB.prepare("UPDATE creator_deals SET stage=?, updated_at=datetime('now') WHERE id=? AND stage=? AND pay_status='unfunded'").bind(to, id, d.stage).run();
      if (!r.meta?.changes) throw new FlowError("The deal changed while you were looking at it. Reload and try again.");
      await logEvent(env, id, "team", "note", `Stage: ${STAGE_LABEL[d.stage] || d.stage} → ${STAGE_LABEL[to] || to}`);
      msg = "Stage updated.";
    } else if (a === "note") {
      const note = str(fd.get("note"));
      if (!note) throw new FlowError("Write the note first.");
      if (!(await load(id))) throw new FlowError("That deal does not exist.", "not_found");
      await logEvent(env, id, `team:${me.email}`, "note", note.slice(0, 2000));
      msg = "Note added.";
    } else {
      throw new FlowError("Unknown action.");
    }
  } catch (e) {
    if (e instanceof FlowError) err = e.message;
    else { console.error("[team/deal]", a, e); err = "Something went wrong, nothing was changed. Try again."; }
  }
  redirect(err ? flashUrl(back, "err", err) : flashUrl(back, "ok", msg));
}

const mask = (s) => { const t = String(s || ""); return t ? `•••• ${t.slice(-4)}` : "Not added"; };

export default async function Page({ params, searchParams }) {
  const me = await requireTeam();
  const id = params.id;
  let d = await load(id);
  if (!d) redirect("/team/crm");
  let flash = searchParams?.err || searchParams?.ok || "";
  const tone = searchParams?.err ? "bad" : "good";

  if (!d.track_code) {
    const hd = await env.DB.prepare("SELECT handle FROM creators WHERE id=?").bind(d.creator_id).first();
    const code = makeTrackCode(hd?.handle || "creator");
    await env.DB.prepare("UPDATE creator_deals SET track_code=? WHERE id=? AND track_code IS NULL").bind(code, d.id).run();
    d.track_code = code;
  }
  if (await applyAutoApprove(env, d)) flash = flash || "The review window passed, so the draft was auto-approved.";

  const c = await env.DB.prepare("SELECT * FROM creators WHERE id=?").bind(d.creator_id).first();
  const k = d.campaign_id ? await env.DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(d.campaign_id).first() : null;
  const events = (await env.DB.prepare("SELECT * FROM deal_events WHERE deal_id=? ORDER BY created_at DESC LIMIT 50").bind(d.id).all()).results ?? [];
  const fy = (await env.DB.prepare("SELECT COALESCE(SUM(fee),0) s FROM creator_deals WHERE creator_id=? AND pay_status='paid' AND paid_at >= ? AND id <> ?").bind(d.creator_id, fyStart(), d.id).first())?.s ?? 0;
  const q = await priceDeal(env, d, k || {}, Boolean(c?.gstin));
  const ledger = (await env.DB.prepare("SELECT kind, amount_paise, tds_paise, utr, method, actor_id, created_at FROM finance_ledger WHERE deal_id=? ORDER BY id").bind(d.id).all()).results ?? [];
  const money = can(me.role, "finance");
  const progress = can(me.role, "shortlist");
  const boss = me.role === "owner" || me.role === "admin";
  const closed = isClosed(d);
  const th = d.fee ? takeHome(d.fee, fy) : null;
  const must = lines(k?.mandatories);
  const avoid = lines(k?.exclusions);
  const ticks = checklist(d.checklist_json);
  const views = d.actual_views || d.expected_views;
  // CPV = creator fee / views (what the content cost per view). Planned when there are no actual views yet.
  const cpv = d.fee && views ? d.fee / views : null;
  const cpvLine = (cpv ? "₹" + cpv.toFixed(2) + " per view" + (d.actual_views ? "" : " (planned)") : "—") + (k?.promised_cpv && cpv ? (cpv > k.promised_cpv ? " · over ₹" + k.promised_cpv + " promise" : " · beats promise ✓") : "");
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const name = c?.name || c?.handle || "Creator";
  const wa = c?.phone ? `https://wa.me/${String(c.phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(nudge(d, name.split(" ")[0], origin))}` : "";
  const trackUrl = `${origin}/go/${d.track_code}`;
  const draftLabel = ({ none: "Not yet", submitted: "In review", changes: "Changes asked", approved: "Approved" })[d.draft_status] ?? d.draft_status;
  const extraRound = d.revisions_used >= d.revisions_included;
  const openReports = Number((await env.DB.prepare("SELECT COUNT(*) n FROM bypass_reports WHERE deal_id=? AND status='open'").bind(d.id).first().catch(() => null))?.n ?? 0);
  const kindLabel = { cancelled: "Cancelled", refunded: "Refunded", live_link: "Live link shared", signoff: "Brand signed off", funded: "Brand paid", sow: "Terms accepted", draft: "Draft submitted", changes: "Changes requested", approved: "Draft approved", live: "Went live", released: "Payout approved", paid: "Creator paid", note: "Note", results: "Results updated" };
  const esc = (s) => String(s).replace(/</g, "&lt;");
  const hidden = (a) => <><input type="hidden" name="id" value={d.id} /><input type="hidden" name="action" value={a} /></>;

  return (
    <TeamShell active="crm" eyebrow={`Deal · ${d.brand || "Brand"}`} title={`${esc(name)} × <b>${esc(d.brand || "Brand")}</b>`} email={me.email}
      actions={<>
        {wa && <a className="btn" href={wa} target="_blank" rel="noopener">WhatsApp nudge ↗</a>}
        <a className="btn" href={`/team/creators/${d.creator_id}`}>Creator</a>
        {k && <a className="btn" href={`/team/campaigns/${k.id}`}>Campaign</a>}
        <a className="btn" href="/team/reports" title="Off-platform reports">{openReports ? `Report (${openReports} open)` : "Reports"}</a>
      </>}>

      {flash && <div className={`note ${tone}`} style={{ marginBottom: 16 }}>{flash}</div>}
      <DealRail d={d} side="team" />

      <div className="grid4 sec" style={{ marginTop: 18 }}>
        <div className="panel kpi"><div className="k">Creator fee</div><div className="v">{inr(d.fee)}</div><div className="s">{q ? `Brand pays ${inr(q.total)} all-in${q.frozen ? " (locked at payment)" : ""}` : "Set the fee below"}</div></div>
        <div className="panel kpi"><div className="k">Draft</div><div className="v" style={{ fontSize: 20 }}>{draftLabel}</div><div className="s">Revision {Math.min(d.revisions_used, 99)} of {d.revisions_included} included{d.draft_status === "submitted" && d.auto_approve_at ? ` · auto-approves in ${countdown(d.auto_approve_at)}` : ""}</div></div>
        <div className="panel kpi"><div className="k">Views · CPV</div><div className="v">{compact(views)}</div><div className="s">{cpvLine}</div></div>
        <div className="panel kpi"><div className="k">Clicks · orders</div><div className="v">{d.clicks} · {d.orders ?? "—"}</div><div className="s">Code {d.track_code}</div></div>
      </div>

      <div className="grid2 sec" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="panel pad">
            <h2>Move the deal</h2>
            <div className="stack">
              {closed && <div className="note bad">{d.pay_status === "refunded" ? "Cancelled and refunded." : "Cancelled."}</div>}
              {!closed && d.pay_status === "unfunded" && (money
                ? <form action={act} className="stack">{hidden("fund")}
                    <div className="row"><input className="in" name="amount" inputMode="decimal" required style={{ width: 160 }} placeholder="Amount ₹" defaultValue={q?.total ?? ""} />
                      <input className="in" name="reference" required minLength={4} style={{ flex: 1 }} placeholder="Bank reference (UTR) of the brand payment" /></div>
                    <div className="row"><button className="btn plum" disabled={!d.fee}>Record brand payment</button><span className="hint">Only after the money is in Colatch's bank account. This locks the price.</span></div></form>
                : <p className="hint">Waiting for the brand payment. Someone with the finance role records it.</p>)}
              {!closed && d.draft_status === "submitted" && <>
                <div className="note info">Draft: {safeUrl(d.draft_url) ? <a className="link" href={safeUrl(d.draft_url)} target="_blank" rel="noopener noreferrer">{d.draft_url}</a> : <span>{d.draft_url}</span>}</div>
                {progress && <><form action={act} className="stack">{hidden("changes")}
                  <textarea className="in" name="note" rows={3} required placeholder="Feedback, with timestamps: 0:04 show the pack front-on…" />
                  <div className="row"><button className="btn">Request changes{extraRound ? " (extra round)" : ""}</button></div></form>
                <form action={act}>{hidden("approve")}<button className="btn plum">Approve draft</button></form></>}
              </>}
              {!closed && progress && d.draft_status === "approved" && !d.live_at && <form action={act} className="row">{hidden("live")}<input className="in" name="post_url" type="url" required style={{ flex: 1 }} placeholder="https:// live post link" defaultValue={d.post_url ?? ""} /><button className="btn plum">Verify live</button></form>}
              {!closed && money && d.live_at && d.pay_status === "funded" && <form action={act} className="row">{hidden("release")}<input className="in" name="note" style={{ flex: 1 }} placeholder="Checked: tag, disclosure, still live (optional note)" /><button className="btn plum">Approve payout</button></form>}
              {!closed && money && d.pay_status === "released" && <form action={act} className="stack">{hidden("paid")}
                <div className="small">Send to UPI <b>{mask(c?.upi_id)}</b>{c?.gstin ? <> · GSTIN {mask(c.gstin)}</> : null}. PAN is not collected yet: get it from the creator before deducting TDS.</div>
                <div className="row">
                  <input className="in" name="amount" inputMode="decimal" required style={{ width: 150 }} placeholder="Sent ₹" defaultValue={th ? th.net : ""} />
                  <input className="in" name="tds" inputMode="decimal" style={{ width: 130 }} placeholder="TDS ₹" defaultValue={th?.tds || "0"} />
                  <input className="in" name="utr" required pattern="[A-Za-z0-9]{6,30}" style={{ flex: 1 }} placeholder="UTR / bank reference" />
                </div>
                <div className="row"><button className="btn plum">Record payout</button><span className="hint">Record only after the bank transfer went through. It can be recorded once.</span></div></form>}
              {d.pay_status === "paid" && <div className="note good">Paid {String(d.paid_at || "").slice(0, 10)} · UTR {d.utr}{d.tds_amount ? ` · TDS ${inr(d.tds_amount)}` : ""}</div>}
              {money && d.stage === "cancelled" && d.pay_status === "funded" && <form action={act} className="row">{hidden("refund")}
                <input className="in" name="amount" inputMode="decimal" required style={{ width: 150 }} placeholder="Refunded ₹" defaultValue={d.brand_paid_paise ? Number(d.brand_paid_paise) / 100 : ""} />
                <input className="in" name="utr" required pattern="[A-Za-z0-9]{6,30}" style={{ flex: 1 }} placeholder="UTR of the refund" /><button className="btn">Record refund</button></form>}
              {!d.sow_accepted_at && !closed && <p className="hint">The creator still has to accept the terms in their portal.</p>}
              {!progress && !money && <p className="hint">Your role is read-only.</p>}
              {boss && !closed && d.pay_status !== "paid" && d.pay_status !== "released" && <details><summary className="hint">Cancel this deal</summary>
                <form action={act} className="row" style={{ marginTop: 8 }}>{hidden("cancel")}<input className="in" name="reason" required minLength={3} style={{ flex: 1 }} placeholder="Reason (the creator and the timeline see this)" /><button className="btn">Cancel deal</button></form></details>}
              {progress && !closed && d.pay_status === "unfunded" && <form action={act} className="row">{hidden("stage")}
                <select className="in" name="stage" defaultValue={d.stage}>{["shortlisted", "contacted", "negotiating", "dropped"].map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select><button className="btn sm">Set pipeline stage</button></form>}
            </div>
          </div>

          {progress && <form className="panel pad" action={act}>
            {hidden("terms")}
            <h2>Terms</h2>{d.pay_status !== "unfunded" && <p className="hint">Locked: the brand has paid against these terms.</p>}
            <div className="form-grid">
              <div className="fld"><label>Brand</label><input name="brand" defaultValue={d.brand ?? ""} /></div>
              <div className="fld"><label>Deliverable</label><input name="deliverable" defaultValue={d.deliverable ?? ""} /></div>
              <div className="fld"><label>Creator fee ₹</label><input name="fee" defaultValue={d.fee ?? ""} /></div>
              <div className="fld"><label>Expected views</label><input name="expected_views" defaultValue={d.expected_views ?? ""} /></div>
              <div className="fld"><label>Revision rounds included</label><input name="revisions_included" defaultValue={d.revisions_included} /></div>
              <div className="fld"><label>Go-live date</label><input name="go_live_date" type="date" defaultValue={d.go_live_date ?? ""} /></div>
            </div>
            <div className="row" style={{ marginTop: 14 }}><button className="btn plum" disabled={d.pay_status !== "unfunded"}>Save terms</button><span className="hint">Stage: {STAGE_LABEL[d.stage] || d.stage}. Changing the fee asks the creator to accept again.</span></div>
          </form>}

          {progress && d.live_at && <form className="panel pad" action={act}>
            {hidden("results")}
            <h2>Results</h2>
            <div className="form-grid">
              <div className="fld"><label>Views</label><input name="actual_views" defaultValue={d.actual_views ?? ""} /></div>
              <div className="fld"><label>Likes</label><input name="likes" defaultValue={d.likes ?? ""} /></div>
              <div className="fld"><label>Comments</label><input name="comments" defaultValue={d.comments ?? ""} /></div>
              <div className="fld"><label>Orders</label><input name="orders" defaultValue={d.orders ?? ""} /></div>
              <div className="fld"><label>Sales value ₹ <span className="opt">— from the code/link</span></label><input name="sales_value" defaultValue={d.sales_value ?? ""} /></div>
              <div className="fld"><label>Product / ticket value ₹</label><input name="reward_value" defaultValue={d.reward_value ?? ""} /></div>
              <div className="fld full"><label>Market rate ₹ <span className="opt">— what this work usually costs; drives the brand's savings figure</span></label><input name="market_rate" defaultValue={d.market_rate ?? ""} /></div>
            </div>
            <button className="btn plum" style={{ marginTop: 14 }}>Save results</button>
          </form>}
        </div>

        <div className="stack">
          {q && <div className="panel pad">
            <h2>Quote breakdown</h2>
            <table className="tbl"><tbody>
              <tr><td>Creator fee</td><td className="num">{inr(q.creatorFee)}</td></tr>
              <tr><td>Colatch fee ({q.pct}%)</td><td className="num">{inr(q.colatch)}</td></tr>
              <tr><td>GST 18% on Colatch fee</td><td className="num">{inr(q.gstOnColatch)}</td></tr>
              {q.gstOnCreator > 0 && <tr><td>GST 18% on creator fee (registered)</td><td className="num">{inr(q.gstOnCreator)}</td></tr>}
              <tr><td><b>Brand pays</b></td><td className="num"><b>{inr(q.total)}</b></td></tr>
              {th && <tr><td>Creator takes home (estimate{th.tds ? `, after TDS ${inr(th.tds)}` : ""})</td><td className="num">{inr(th.net)}</td></tr>}
            </tbody></table>
            <p className="hint" style={{ margin: "10px 0 0" }}>{q.frozen ? "Price locked when the brand paid. " : q.reason ? `${q.reason}. ` : ""}TDS is an estimate: CA to confirm the section, rate and threshold. Finance records the actual TDS with the payout.</p>
          </div>}

          {money && <div className="panel pad">
            <h2>Money recorded</h2>
            {ledger.length ? <table className="tbl"><tbody>{ledger.map((l, i) => <tr key={i}>
              <td>{({ brand_payment_received: "Brand paid Colatch", creator_payout_sent: "Paid to creator", brand_refund_sent: "Refunded to brand", referral_payout_sent: "Referral payout", adjustment: "Adjustment" })[l.kind] || l.kind}<div className="hint">{l.utr} · {l.actor_id} · {String(l.created_at).slice(0, 16)}</div></td>
              <td className="num">{formatPaise(Number(l.amount_paise))}{Number(l.tds_paise) ? <div className="hint">TDS {formatPaise(Number(l.tds_paise))}</div> : null}</td></tr>)}</tbody></table>
              : <p className="hint">No money recorded on this deal yet.</p>}
            <p className="hint" style={{ margin: "10px 0 0" }}>Entries can't be edited or deleted. A mistake is fixed with an adjustment.</p>
          </div>}

          <div className="panel pad">
            <h2>Tracked link and code</h2>
            <div className="row"><code className="k">{trackUrl}</code><CopyButton url={trackUrl} label="Copy" /></div>
            <p className="hint" style={{ margin: "10px 0 0" }}>{k?.brand_url ? <>Sends people to {k.brand_url} with UTM tags and counts every click. Share the code <b>{d.track_code}</b> as the discount code.</> : <>Add the brand's landing page on the campaign so this link redirects. Share the code <b>{d.track_code}</b> as the discount code.</>}</p>
          </div>

          {(must.length > 0 || avoid.length > 0) && <div className="panel pad">
            <h2>Deliverable checklist</h2>
            {must.map((m, i) => <div key={i} className="row" style={{ gap: 10, flexWrap: "nowrap", marginBottom: 8 }}><span className={`pill ${ticks[String(i)] ? "good" : ""}`}>{ticks[String(i)] ? "✓" : "·"}</span><span>{m}</span></div>)}
            {avoid.length > 0 && <><div className="lbl" style={{ marginTop: 12 }}>Must not</div>{avoid.map((m, i) => <div key={i} className="small" style={{ marginTop: 6 }}>✕ {m}</div>)}</>}
            <p className="hint" style={{ margin: "10px 0 0" }}>Ticks come from the creator when they submit a draft.</p>
          </div>}

          <div className="panel pad">
            <h2>Timeline</h2>
            {progress && <form action={act} className="row" style={{ marginBottom: 14 }}>{hidden("note")}<input className="in" name="note" style={{ flex: 1 }} placeholder="Add a note" /><button className="btn sm">Add</button></form>}
            {events.length ? events.map((e) => <div key={e.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line-2)" }}><div className="spread"><b className="small">{kindLabel[e.kind] || e.kind}</b><span className="hint">{e.actor} · {String(e.created_at).slice(5, 16)}</span></div>{e.note && <div className="small muted" style={{ whiteSpace: "pre-line", marginTop: 2 }}>{e.note}</div>}</div>) : <p className="hint">Nothing yet.</p>}
          </div>
        </div>
      </div>
    </TeamShell>
  );
}
