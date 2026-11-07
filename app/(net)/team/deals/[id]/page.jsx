import { redirect } from "next/navigation";
import { headers } from "next/headers";
import TeamShell from "../../../_ui/TeamShell";
import DealRail from "../../../_ui/DealRail";
import { flashUrl } from "../../../_ui/flash";
import { CopyButton } from "../../_client";
import { requireTeam } from "../../_guard";
import { env } from "@/lib/net/env";
import { compact, inr, int, str, DEAL_STAGES, STAGE_LABEL } from "@/lib/net/creators";
import { quote, takeHome, fyStart, makeTrackCode, logEvent, applyAutoApprove, countdown, checklist, lines, nudge, feePct } from "@/lib/net/deal";
import { scrubContacts } from "@/lib/net/guard";
import { accrueOnPaid } from "@/lib/net/referral";

export const metadata = { title: "Deal · Colatch Connect", robots: { index: false, follow: false } };

const load = (id) => env.DB.prepare("SELECT * FROM creator_deals WHERE id=?").bind(id).first();

/** All deal-room forms post here with a hidden `action`. Same steps as the Astro deal room. */
async function act(fd) {
  "use server";
  await requireTeam();
  const id = String(fd.get("id") ?? "");
  const a = String(fd.get("action") ?? "");
  const note = str(fd.get("note"));
  const d = await load(id);
  if (!d) redirect("/team/crm");
  const upd = (sql, ...v) => env.DB.prepare(`UPDATE creator_deals SET ${sql}, updated_at=datetime('now') WHERE id=?`).bind(...v, id).run();
  let msg = "";
  let err = "";
  try {
    if (a === "terms") {
      await upd("brand=?, deliverable=?, fee=?, expected_views=?, revisions_included=?, go_live_date=?", str(fd.get("brand")), str(fd.get("deliverable")), int(fd.get("fee")), int(fd.get("expected_views")), int(fd.get("revisions_included")) ?? 2, str(fd.get("go_live_date")));
      await logEvent(env, id, "team", "note", "Deal terms updated"); msg = "Terms saved.";
    } else if (a === "fund") {
      await upd("pay_status='funded', funded_at=datetime('now'), stage=CASE WHEN stage IN ('shortlisted','contacted','negotiating') THEN 'confirmed' ELSE stage END");
      await logEvent(env, id, "team", "funded", note || "Brand payment received"); msg = "Marked funded. The creator can start.";
    } else if (a === "approve") {
      await upd("draft_status='approved'"); await logEvent(env, id, "team", "approved", note); msg = "Draft approved.";
    } else if (a === "changes") {
      if (!note) throw new Error("Write the feedback the creator should act on.");
      const extra = d.revisions_used >= d.revisions_included;
      await upd("draft_status='changes', revisions_used=revisions_used+1");
      await logEvent(env, id, "brand", "changes", (extra ? "[Extra round beyond what is included] " : "") + scrubContacts(note).text);
      msg = extra ? "Feedback sent. This is beyond the included rounds, so agree an extra fee with the creator." : "Feedback sent to the creator.";
    } else if (a === "live") {
      const url = str(fd.get("post_url"));
      if (!url) throw new Error("Paste the live post link.");
      await upd("post_url=?, live_at=COALESCE(live_at, datetime('now')), stage='live'", url); await logEvent(env, id, "team", "live", url); msg = "Live post verified. Payment clock started.";
    } else if (a === "release") {
      await upd("pay_status='released'"); await logEvent(env, id, "team", "released", note); msg = "Payment released.";
    } else if (a === "paid") {
      const utr = str(fd.get("utr"));
      if (!utr) throw new Error("Add the bank reference (UTR) so the creator can trace the payment.");
      await upd("pay_status='paid', paid_at=datetime('now'), utr=?, tds_amount=?, stage='paid'", utr, int(fd.get("tds_amount")));
      await logEvent(env, id, "team", "paid", `UTR ${utr}`); msg = "Marked paid. The creator sees the UTR.";
      await accrueOnPaid(env, id, feePct(env)).catch(() => null);
    } else if (a === "results") {
      await upd("actual_views=?, likes=?, comments=?, orders=?, clicks=COALESCE(?, clicks), sales_value=?, reward_value=?, market_rate=COALESCE(?, market_rate)", int(fd.get("actual_views")), int(fd.get("likes")), int(fd.get("comments")), int(fd.get("orders")), int(fd.get("clicks")), int(fd.get("sales_value")), int(fd.get("reward_value")), int(fd.get("market_rate")));
      await logEvent(env, id, "team", "results", null); msg = "Results saved.";
    } else if (a === "stage") {
      const st = String(fd.get("stage"));
      if (DEAL_STAGES.includes(st)) await upd("stage=?", st);
    } else if (a === "note" && note) {
      await logEvent(env, id, "team", "note", note); msg = "Note added.";
    }
  } catch (e) { err = e instanceof Error ? e.message : "Something went wrong."; }
  redirect(err ? flashUrl(`/team/deals/${id}`, "err", err) : msg ? flashUrl(`/team/deals/${id}`, "ok", msg) : `/team/deals/${id}`);
}

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
  const q = d.fee ? quote(env, d.fee, Boolean(c?.gstin)) : null;
  const th = d.fee ? takeHome(d.fee, fy) : null;
  const must = lines(k?.mandatories);
  const avoid = lines(k?.exclusions);
  const ticks = checklist(d.checklist_json);
  const views = d.actual_views || d.expected_views;
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
  const kindLabel = { funded: "Funded", sow: "Terms accepted", draft: "Draft submitted", changes: "Changes requested", approved: "Draft approved", live: "Went live", released: "Payment released", paid: "Paid", note: "Note", results: "Results updated" };
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
        <div className="panel kpi"><div className="k">Creator fee</div><div className="v">{inr(d.fee)}</div><div className="s">{q ? `Brand pays ${inr(q.total)} all-in` : "Set the fee below"}</div></div>
        <div className="panel kpi"><div className="k">Draft</div><div className="v" style={{ fontSize: 20 }}>{draftLabel}</div><div className="s">Revision {Math.min(d.revisions_used, 99)} of {d.revisions_included} included{d.draft_status === "submitted" && d.auto_approve_at ? ` · auto-approves in ${countdown(d.auto_approve_at)}` : ""}</div></div>
        <div className="panel kpi"><div className="k">Views · CPV</div><div className="v">{compact(views)}</div><div className="s">{cpvLine}</div></div>
        <div className="panel kpi"><div className="k">Clicks · orders</div><div className="v">{d.clicks} · {d.orders ?? "—"}</div><div className="s">Code {d.track_code}</div></div>
      </div>

      <div className="grid2 sec" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="panel pad">
            <h2>Move the deal</h2>
            <div className="stack">
              {d.pay_status === "unfunded" && <form action={act} className="row">{hidden("fund")}<input className="in" name="note" style={{ flex: 1 }} placeholder="Payment reference from the brand (optional)" /><button className="btn plum">Mark brand funded</button></form>}
              {d.draft_status === "submitted" && <>
                <div className="note info">Draft: <a className="link" href={d.draft_url} target="_blank" rel="noopener">{d.draft_url}</a></div>
                <form action={act} className="stack">{hidden("changes")}
                  <textarea className="in" name="note" rows={3} placeholder="Feedback, with timestamps: 0:04 show the pack front-on…" />
                  <div className="row"><button className="btn">Request changes{extraRound ? " (extra round)" : ""}</button></div></form>
                <form action={act}>{hidden("approve")}<button className="btn plum">Approve draft</button></form>
              </>}
              {d.draft_status === "approved" && !d.live_at && <form action={act} className="row">{hidden("live")}<input className="in" name="post_url" style={{ flex: 1 }} placeholder="Live post link" defaultValue={d.post_url ?? ""} /><button className="btn plum">Verify live</button></form>}
              {d.live_at && d.pay_status === "funded" && <form action={act} className="row">{hidden("release")}<input className="in" name="note" style={{ flex: 1 }} placeholder="Checked: tag, disclosure, still live (optional note)" /><button className="btn plum">Release payment</button></form>}
              {d.pay_status === "released" && <form action={act} className="row">{hidden("paid")}<input className="in" name="utr" style={{ flex: 1 }} placeholder="UTR / bank reference" /><input className="in" name="tds_amount" style={{ width: 130 }} placeholder="TDS ₹" defaultValue={th?.tds || ""} /><button className="btn plum">Mark paid</button></form>}
              {d.pay_status === "paid" && <div className="note good">Paid {d.paid_at?.slice(0, 10)} · UTR {d.utr}{d.tds_amount ? ` · TDS ${inr(d.tds_amount)}` : ""}</div>}
              {!d.sow_accepted_at && <p className="hint">The creator still has to accept the terms in their portal. <a className="link" href={`/creator/deals/${d.id}`} target="_blank">Creator view ↗</a></p>}
            </div>
          </div>

          <form className="panel pad" action={act}>
            {hidden("terms")}
            <h2>Terms</h2>
            <div className="form-grid">
              <div className="fld"><label>Brand</label><input name="brand" defaultValue={d.brand ?? ""} /></div>
              <div className="fld"><label>Deliverable</label><input name="deliverable" defaultValue={d.deliverable ?? ""} /></div>
              <div className="fld"><label>Creator fee ₹</label><input name="fee" defaultValue={d.fee ?? ""} /></div>
              <div className="fld"><label>Expected views</label><input name="expected_views" defaultValue={d.expected_views ?? ""} /></div>
              <div className="fld"><label>Revision rounds included</label><input name="revisions_included" defaultValue={d.revisions_included} /></div>
              <div className="fld"><label>Go-live date</label><input name="go_live_date" type="date" defaultValue={d.go_live_date ?? ""} /></div>
            </div>
            <div className="row" style={{ marginTop: 14 }}><button className="btn plum">Save terms</button><span className="hint">CRM stage: {STAGE_LABEL[d.stage]}</span></div>
          </form>

          <form className="panel pad" action={act}>
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
          </form>
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
              {th && <tr><td>Creator takes home{th.tds ? " after 10% TDS" : ""}</td><td className="num">{inr(th.net)}</td></tr>}
            </tbody></table>
            <p className="hint" style={{ margin: "10px 0 0" }}>TDS applies once fees to this creator pass ₹50,000 this financial year. Confirm the section and rate with your CA.</p>
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
            <form action={act} className="row" style={{ marginBottom: 14 }}>{hidden("note")}<input className="in" name="note" style={{ flex: 1 }} placeholder="Add a note" /><button className="btn sm">Add</button></form>
            {events.length ? events.map((e) => <div key={e.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line-2)" }}><div className="spread"><b className="small">{kindLabel[e.kind] || e.kind}</b><span className="hint">{e.actor} · {String(e.created_at).slice(5, 16)}</span></div>{e.note && <div className="small muted" style={{ whiteSpace: "pre-line", marginTop: 2 }}>{e.note}</div>}</div>) : <p className="hint">Nothing yet.</p>}
          </div>
        </div>
      </div>
    </TeamShell>
  );
}
