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
import { can, logError } from "@/lib/net/security";
import { colatchScore } from "@/lib/net/score";
import { dealStepLine } from "@/components/team/dealStep";
import { dayTime, day } from "@/components/team/labels";
import { inrShort } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, Grid, Section, Card, AsideCard, Pill } from "@/components/ui";
import DealThread from "@/components/deal/DealThread";
import { UsageLine, ShipPill } from "@/components/deal/DealExtras";
import { listMessages, unreadCount, markRead, postMessage, notifyMessage, MessageError } from "@/lib/net/messages";
import { listShipments, addShipment, moveShipment, nextStatuses, creatorAddress, addressLines, SHIP_LABEL, ShipError } from "@/lib/net/shipments";
import { saveUsage, syncUsageStart, prefillFromText, toDate, USAGE_CHANNELS, MAX_USAGE_MONTHS, UsageError } from "@/lib/net/usage";
import { audit } from "@/lib/net/security";
import { REASONS } from "@/lib/net/disputes";

export const metadata = { title: "Deal", robots: { index: false, follow: false } };

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
    else { await logError("team/deal", e, { action: a, deal: id }); err = "Something went wrong, nothing was changed. Try again."; }
  }
  redirect(err ? flashUrl(back, "err", err) : flashUrl(back, "ok", msg));
}

/**
 * Deal room: messages, gifting shipments and usage rights. Its own action so the permission rules stay separate
 * from the money/progress steps: anyone with shortlist or finance may message and log shipments; usage rights
 * need shortlist (owner/admin/shortlister). Viewers can read but not change anything.
 */
async function room(fd) {
  "use server";
  const id = String(fd.get("id") ?? "");
  const a = String(fd.get("action") ?? "");
  const base = `/team/deals/${encodeURIComponent(id)}`;
  const anchor = a === "message" ? "#messages" : a === "usage" ? "#usage" : "#shipments";
  const me = await requireTeam("view", base);
  const allowed = a === "usage" ? can(me.role, "shortlist") : can(me.role, "shortlist") || can(me.role, "finance");
  if (!allowed) redirect(flashUrl(base, "err", `Your role (${me.role}) can't do that. Ask an owner or admin.`) + anchor);
  let msg = "", err = "";
  try {
    const d = await load(id);
    if (!d) throw new FlowError("That deal does not exist.", "not_found");
    const actor = { kind: "team", id: me.email };
    if (a === "message") {
      const r = await postMessage(d.id, actor, fd.get("body"), fd.get("mid"));
      if (r.created) await notifyMessage(d.id, r.id, actor);
      msg = r.created ? "Message sent." : "That message was already sent.";
    } else if (a === "ship_add") {
      const s = await addShipment(d.id, { product: fd.get("product"), carrier: fd.get("carrier"), awb: fd.get("awb"), note: fd.get("ship_note"), status: fd.get("ship_status") }, me.email);
      await logEvent(env, d.id, `team:${me.email}`, "note", `Shipment added: ${s.product} (${SHIP_LABEL[s.status]})`);
      await audit(actor, "shipment.add", "deal", d.id, { shipment: s.id, status: s.status });
      msg = "Shipment added.";
    } else if (a === "ship_move") {
      const to = String(fd.get("to") ?? "");
      const s = await moveShipment(d.id, String(fd.get("shipment") ?? ""), to, { carrier: fd.get("carrier"), awb: fd.get("awb") });
      await logEvent(env, d.id, `team:${me.email}`, "note", `Shipment ${SHIP_LABEL[s.status].toLowerCase()}: ${s.product}${s.awb ? ` (${s.carrier || "AWB"} ${s.awb})` : ""}`);
      await audit(actor, "shipment.move", "deal", d.id, { shipment: s.id, to: s.status });
      msg = `Shipment marked ${SHIP_LABEL[s.status].toLowerCase()}.`;
    } else if (a === "usage") {
      const u = await saveUsage(d.id, { channels: fd.get("usage_channels"), months: fd.get("usage_months"), starts: fd.get("usage_starts") });
      await logEvent(env, d.id, `team:${me.email}`, "note", `Usage rights: ${u.usage_channels} for ${u.usage_months} months`);
      await audit(actor, "deal.usage", "deal", d.id, { channels: u.usage_channels, months: u.usage_months, expires: u.usage_expires_at ? String(toDate(u.usage_expires_at)?.toISOString()) : null });
      msg = "Usage rights saved.";
    } else throw new FlowError("Unknown action.");
  } catch (e) {
    if (e instanceof FlowError || e instanceof MessageError || e instanceof ShipError || e instanceof UsageError) err = e.message;
    else { await logError("team/deal.room", e, { action: a, deal: id }); err = "Something went wrong, nothing was changed. Try again."; }
  }
  redirect((err ? flashUrl(base, "err", err) : flashUrl(base, "ok", msg)) + anchor);
}

/** 'YYYY-MM-DD' in India for a date input. */
const istDay = (v) => { const d = toDate(v); return d ? new Date(d.getTime() + 5.5 * 36e5).toISOString().slice(0, 10) : ""; };

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
  const ledger = (await env.DB.prepare("SELECT kind, amount_paise, tds_paise, utr, method, actor_id, at AS created_at FROM finance_ledger WHERE deal_id=? ORDER BY id").bind(d.id).all()).results ?? [];
  const money = can(me.role, "finance");
  const progress = can(me.role, "shortlist");
  const boss = me.role === "owner" || me.role === "admin";
  const closed = isClosed(d);
  const tier = (await colatchScore(env, d.creator_id).catch(() => null))?.tier;
  const priority = tier === "Gold" || tier === "Icon";
  const th = d.fee ? takeHome(d.fee, fy) : null;
  const must = lines(k?.mandatories);
  const avoid = lines(k?.exclusions);
  const ticks = checklist(d.checklist_json);
  const views = d.actual_views || d.expected_views;
  // CPV = creator fee / views (what the content cost per view). Planned when there are no actual views yet.
  const cpv = d.fee && views ? d.fee / views : null;
  const cpvLine = (cpv ? "₹" + cpv.toFixed(2) + " per view" + (d.actual_views ? "" : " (planned)") : "—") + (k?.promised_cpv && cpv && d.actual_views ? (cpv > k.promised_cpv ? " · over the ₹" + k.promised_cpv + " promise" : " · beats the promise ✓") : "");
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const name = c?.name || c?.handle || "Creator";
  const wa = c?.phone ? `https://wa.me/${String(c.phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(nudge(d, name.split(" ")[0], origin))}` : "";
  const trackUrl = `${origin}/go/${d.track_code}`;
  const draftLabel = ({ none: "Not yet", submitted: "In review", changes: "Changes asked", approved: "Approved" })[d.draft_status] ?? d.draft_status;
  const extraRound = d.revisions_used >= d.revisions_included;
  // Open disputes on this deal, from any side (read-only). Shown at the top: a dispute changes what the team should do next.
  const disputesOpen = (await env.DB.prepare("SELECT id, raised_by_kind, reason, detail, created_at FROM disputes WHERE deal_id=? AND status='open' ORDER BY created_at").bind(d.id).all().catch(() => null))?.results ?? [];
  const openReports = Number((await env.DB.prepare("SELECT COUNT(*) n FROM bypass_reports WHERE deal_id=? AND status='open'").bind(d.id).first().catch(() => null))?.n ?? 0);
  const kindLabel = { cancelled: "Cancelled", refunded: "Refunded", live_link: "Live link shared", signoff: "Brand signed off", funded: "Brand paid", sow: "Terms accepted", draft: "Draft submitted", changes: "Changes requested", approved: "Draft approved", live: "Went live", released: "Payout approved", paid: "Creator paid", note: "Note", results: "Results updated" };
  // Deal room. Each part is optional: a problem here must not take the deal page down.
  await syncUsageStart(d).catch(() => false);
  const reader = { kind: "team", id: me.email };
  const thread = await listMessages(d.id).catch(() => []);
  const unread = await unreadCount(d.id, reader).catch(() => 0);
  if (thread.length) await markRead(d.id, reader).catch(() => {});
  const shipments = await listShipments(d.id).catch(() => []);
  const address = await creatorAddress(d.creator_id);
  const crew = progress || money;
  const pre = prefillFromText(k?.usage_rights);
  const usageChannels = d.usage_channels || pre.channels;
  const usageMonths = d.usage_months || pre.months || "";
  const roomHidden = (a) => <><input type="hidden" name="id" value={d.id} /><input type="hidden" name="action" value={a} /></>;
  const esc = (s) => String(s).replace(/</g, "&lt;");
  const hidden = (a) => <><input type="hidden" name="id" value={d.id} /><input type="hidden" name="action" value={a} /></>;

  const ledgerLabel = { brand_payment_received: "Brand paid Colatch", creator_payout_sent: "Paid to creator", brand_refund_sent: "Refunded to brand", referral_payout_sent: "Referral payout", adjustment: "Adjustment" };
  const money0 = (n) => (n ? inrShort(n) : "—");
  // Money trail: the deal's own status and the ledger are two sources. Say which one each line comes from,
  // so "the brand has paid" (deal status) and "nothing in the ledger" never read as a contradiction.
  const sumKind = (kind) => ledger.filter((l) => l.kind === kind).reduce((t, l) => t + Number(l.amount_paise || 0), 0);
  const brandIn = sumKind("brand_payment_received"), payoutOut = sumKind("creator_payout_sent"), refundOut = sumKind("brand_refund_sent");
  const brandMarked = ["funded", "released", "paid"].includes(d.pay_status) || (d.pay_status === "refunded" && d.brand_paid_paise != null);
  const SIDE = { creator: "the creator", brand: "the brand", team: "the Colatch team" };

  return (
    <TeamShell active="crm" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator CRM", href: "/team/crm" }, { label: name }]}
        actions={<>
          {wa && <a className="btn sm" href={wa} target="_blank" rel="noopener">WhatsApp nudge ↗</a>}
          <a className="btn sm" href={`/team/creators/${d.creator_id}`}>Creator</a>
          {k && <a className="btn sm" href={`/team/campaigns/${k.id}`}>Campaign</a>}
          <a className="btn sm" href="/team/reports" title="Off-platform reports">{openReports ? `Report (${openReports} open)` : "Reports"}</a>
        </>}
        eyebrow={`Deal · ${d.brand || "Brand"}`}
        title={`${esc(name)} × <b>${esc(d.brand || "Brand")}</b>`}
        sub={[d.deliverable || "Deliverable not set", d.go_live_date ? `goes live ${day(d.go_live_date) || d.go_live_date}` : null, k ? `for ${k.title}` : null].filter(Boolean).join(" · ")}
      >
        <div className="ui-pills tr-headpills">
          <Pill tone={closed ? "off" : d.pay_status === "paid" ? "done" : "plum"}>{dealStepLine(d)}</Pill>
          {priority && <Pill tone="gold">{tier} creator</Pill>}
          {unread > 0 && <a className="tr-pilllink" href="#messages"><Pill tone="mine">{unread} new {unread === 1 ? "message" : "messages"}</Pill></a>}
          {openReports > 0 && <Pill tone="mine">{openReports} open {openReports === 1 ? "report" : "reports"}</Pill>}
          {disputesOpen.length > 0 && <a className="tr-pilllink" href="#dispute"><Pill tone="mine">Dispute open</Pill></a>}
        </div>
      </PageHeader>

      {flash && <div className={`note ${tone}`} style={{ marginBottom: 16 }}>{flash}</div>}
      {priority && !closed && d.pay_status !== "paid" && <div className="note info" style={{ marginBottom: 16 }}><b>{tier} creator: priority payout.</b> Pay this creator as soon as the post is verified.</div>}
      {disputesOpen.length > 0 && <section id="dispute" className="ui-card ui-card--night ui-card--pad tr-disputebar" aria-labelledby="dispute-h">
        <div className="tr-disputebar__in">
          <div className="tr-disputebar__text">
            <p className="ui-aside__eb">{disputesOpen.length === 1 ? "Dispute open" : `${disputesOpen.length} disputes open`} · needs a decision</p>
            {disputesOpen.map((x) => (
              <div key={x.id} className="tr-disputebar__one">
                <h2 id={x === disputesOpen[0] ? "dispute-h" : undefined} className="tr-disputebar__h">{REASONS[x.reason] || x.reason} <span>raised by {SIDE[x.raised_by_kind] || x.raised_by_kind} · {dayTime(x.created_at)}</span></h2>
                {x.detail && <p className="tr-disputebar__d">{x.detail}</p>}
              </div>
            ))}
            <p className="tr-disputebar__rule">A dispute never moves money. If money has to move, cancel or refund below, then resolve the dispute.</p>
          </div>
          <a className="btn tr-disputebar__go" href="/team/disputes#open">Resolve in Disputes →</a>
        </div>
      </section>}
      <DealRail d={d} side="team" role={me.role} />

      <div className="tr-gap">
        <KpiStrip label="Deal money and results" items={[
          { label: "Creator fee", value: money0(d.fee), title: d.fee ? inr(d.fee) : undefined, foot: th ? `Takes home about ${inr(th.net)}${th.tds ? ` after TDS` : ""}` : "Set the fee in Terms" },
          { featured: true, label: "Brand pays", value: q ? inrShort(q.total) : "—", title: q ? inr(q.total) : undefined, foot: q ? `all-in, with Colatch fee and GST${q.frozen ? " · locked at payment" : ""}` : "Set the fee to price the deal" },
          views ? { label: "Views · CPV", value: compact(views), unit: d.actual_views ? "views" : "expected", foot: cpvLine }
            : { label: "Views · CPV", empty: "No views yet", foot: d.live_at ? "Add real views under Results" : "Set expected views in Terms; real views come after the post is live" },
          Number(d.clicks || 0) || d.orders != null ? { label: "Clicks · orders", value: `${Number(d.clicks || 0).toLocaleString("en-IN")} · ${d.orders ?? 0}`, foot: `Tracked with code ${d.track_code}` }
            : { label: "Clicks · orders", empty: "No clicks yet", foot: `Counted from the tracked link · code ${d.track_code}` },
        ]} />
      </div>

      <Grid aside={<>
        {q && <AsideCard eyebrow="Money" title="Quote breakdown" foot={<span className="hint">{q.frozen ? "Price locked when the brand paid. " : q.reason ? `${q.reason}. ` : ""}TDS is an estimate: CA to confirm the section, rate and threshold. Finance records the actual TDS with the payout.</span>}>
          <dl className="tr-lines">
            <div><dt>Creator fee</dt><dd>{inr(q.creatorFee)}</dd></div>
            <div><dt>Colatch fee ({q.pct}%)</dt><dd>{inr(q.colatch)}</dd></div>
            <div><dt>GST 18% on Colatch fee</dt><dd>{inr(q.gstOnColatch)}</dd></div>
            {q.gstOnCreator > 0 && <div><dt>GST 18% on creator fee (registered)</dt><dd>{inr(q.gstOnCreator)}</dd></div>}
            <div className="tr-lines__total"><dt>Brand pays</dt><dd>{inr(q.total)}</dd></div>
            {th && <div><dt>Creator takes home (estimate{th.tds ? `, after TDS ${inr(th.tds)}` : ""})</dt><dd>{inr(th.net)}</dd></div>}
          </dl>
        </AsideCard>}

        {money && <AsideCard eyebrow="Money trail" title="Deal status and ledger" foot={<span className="hint">Ledger entries can't be edited or deleted. A mistake is fixed with an adjustment in <a className="link" href="/team/finance">Money and ledger</a>.</span>}>
          <dl className="tr-lines tr-trail">
            <div><dt>Brand payment</dt><dd>{brandIn ? <>{formatPaise(brandIn)} <span className="hint">in the ledger</span></>
              : brandMarked ? <span className="tr-trail__gap">Marked paid · not in the ledger</span> : <span className="hint">Not paid yet</span>}</dd></div>
            <div><dt>Paid to creator</dt><dd>{payoutOut ? <>{formatPaise(payoutOut)} <span className="hint">in the ledger</span></>
              : d.pay_status === "paid" ? <span className="tr-trail__gap">Marked paid · not in the ledger</span> : <span className="hint">{d.pay_status === "released" ? "Approved, not sent" : "Not sent yet"}</span>}</dd></div>
            {refundOut > 0 && <div><dt>Refunded to brand</dt><dd>{formatPaise(refundOut)}</dd></div>}
          </dl>
          {brandMarked && !brandIn && <p className="tr-trail__fix"><b>Brand marked paid · no ledger entry yet</b> — record it in <a className="link" href="/team/finance">Money and ledger</a> so reconciliation and the brand's receipt match.</p>}
          {ledger.length ? <><div className="lbl tr-trail__lbl">Ledger entries</div><ol className="tr-ledger">{ledger.map((l, i) => <li key={i}>
            <div className="tr-ledger__t"><b>{ledgerLabel[l.kind] || l.kind}</b><span className="hint">{l.utr} · {l.actor_id} · {dayTime(l.created_at)}</span></div>
            <div className="tr-ledger__v">{formatPaise(Number(l.amount_paise))}{Number(l.tds_paise) ? <span className="hint">TDS {formatPaise(Number(l.tds_paise))}</span> : null}</div>
          </li>)}</ol></>
            : <p className="hint">No ledger entries on this deal yet.</p>}
        </AsideCard>}

        <AsideCard eyebrow="Tracking" title="Tracked link and code">
          <div className="tr-copy"><code className="k">{trackUrl}</code><CopyButton url={trackUrl} label="Copy" /></div>
          <p className="hint">{k?.brand_url ? <>Sends people to {k.brand_url} with UTM tags and counts every click. Share the code <b>{d.track_code}</b> as the discount code.</> : <>Add the brand's landing page on the campaign so this link redirects. Share the code <b>{d.track_code}</b> as the discount code.</>}</p>
        </AsideCard>

        {(must.length > 0 || avoid.length > 0) && <AsideCard eyebrow="From the brief" title="Deliverable checklist" foot={<span className="hint">Ticks come from the creator when they submit a draft.</span>}>
          <ul className="tr-check">{must.map((m, i) => <li key={i} className={ticks[String(i)] ? "on" : ""}><span className={`pill ${ticks[String(i)] ? "good" : ""}`}>{ticks[String(i)] ? "✓" : "·"}</span><span>{m}</span></li>)}</ul>
          {avoid.length > 0 && <><div className="lbl">Must not</div>{avoid.map((m, i) => <div key={i} className="small">✕ {m}</div>)}</>}
        </AsideCard>}

        <Card className="dr-panel tr-thread">
          <DealThread id="messages" messages={thread} me="team" unread={unread} action={room} canPost={crew} hidden={[["id", d.id], ["action", "message"]]} mid={crypto.randomUUID()}
            names={{ brand: d.brand || "Brand", creator: name }} readOnlyNote="Viewers can read messages but not send them." />
        </Card>

        <AsideCard eyebrow="History" title="Timeline">
          {progress && <form action={act} className="row tr-noteform">{hidden("note")}<input className="in" name="note" aria-label="Add a note" placeholder="Add a note" /><button className="btn sm">Add</button></form>}
          {events.length ? <ol className="tr-tl">{events.map((e) => <li key={e.id}><div className="tr-tl__h"><b className="small">{kindLabel[e.kind] || e.kind}</b><span className="hint">{e.actor} · {dayTime(e.created_at)}</span></div>{e.note && <div className="small muted tr-tl__n">{e.note}</div>}</li>)}</ol> : <p className="hint">Nothing yet.</p>}
        </AsideCard>
      </>}>
        <Section id="move" title="Move the deal" sub={`Draft: ${draftLabel} · revision ${Math.min(d.revisions_used, 99)} of ${d.revisions_included} included${d.draft_status === "submitted" && d.auto_approve_at ? ` · auto-approves in ${countdown(d.auto_approve_at)}` : ""}`}>
          <Card className="tr-move">
            <div className="stack">
              {closed && <div className="note bad">{d.pay_status === "refunded" ? "Cancelled and refunded." : "Cancelled."}</div>}
              {!closed && d.pay_status === "unfunded" && (money
                ? <form action={act} className="stack">{hidden("fund")}
                    <div className="row tr-fields"><input className="in tr-w-amt" name="amount" inputMode="decimal" required aria-label="Amount ₹" placeholder="Amount ₹" defaultValue={q?.total ?? ""} />
                      <input className="in tr-grow" name="reference" required minLength={4} aria-label="Bank reference (UTR) of the brand payment" placeholder="Bank reference (UTR) of the brand payment" /></div>
                    <div className="row"><button className="btn plum" disabled={!d.fee}>Record brand payment</button><span className="hint">Only after the money is in Colatch's bank account. This locks the price.</span></div></form>
                : <p className="hint">Waiting for the brand payment. Someone with the finance role records it.</p>)}
              {!closed && d.draft_status === "submitted" && <>
                <div className="note info">Draft: {safeUrl(d.draft_url) ? <a className="link" href={safeUrl(d.draft_url)} target="_blank" rel="noopener noreferrer">{d.draft_url}</a> : <span>{d.draft_url}</span>}</div>
                {progress && <><form action={act} className="stack">{hidden("changes")}
                  <textarea className="in" name="note" rows={3} required aria-label="Feedback for the creator" placeholder="Feedback, with timestamps: 0:04 show the pack front-on…" />
                  <div className="row"><button className="btn">Request changes{extraRound ? " (extra round)" : ""}</button></div></form>
                <form action={act}>{hidden("approve")}<button className="btn plum">Approve draft</button></form></>}
              </>}
              {!closed && progress && d.draft_status === "approved" && !d.live_at && <form action={act} className="row tr-fields">{hidden("live")}<input className="in tr-grow" name="post_url" type="url" required aria-label="Live post link" placeholder="https:// live post link" defaultValue={d.post_url ?? ""} /><button className="btn plum">Verify live</button></form>}
              {!closed && money && d.live_at && d.pay_status === "funded" && <form action={act} className="row tr-fields">{hidden("release")}<input className="in tr-grow" name="note" aria-label="Payout check note" placeholder="Checked: tag, disclosure, still live (optional note)" /><button className="btn plum">Approve payout</button></form>}
              {!closed && money && d.pay_status === "released" && <form action={act} className="stack">{hidden("paid")}
                <div className="small">Send to UPI <b>{mask(c?.upi_id)}</b>{c?.gstin ? <> · GSTIN {mask(c.gstin)}</> : null}. PAN is not collected yet: get it from the creator before deducting TDS.</div>
                <div className="row tr-fields">
                  <input className="in tr-w-amt" name="amount" inputMode="decimal" required aria-label="Sent ₹" placeholder="Sent ₹" defaultValue={th ? th.net : ""} />
                  <input className="in tr-w-amt" name="tds" inputMode="decimal" aria-label="TDS ₹" placeholder="TDS ₹" defaultValue={th?.tds || "0"} />
                  <input className="in tr-grow" name="utr" required pattern="[A-Za-z0-9]{6,30}" aria-label="UTR / bank reference" placeholder="UTR / bank reference" />
                </div>
                <div className="row"><button className="btn plum">Record payout</button><span className="hint">Record only after the bank transfer went through. It can be recorded once.</span></div></form>}
              {d.pay_status === "paid" && <div className="note good">Paid {String(d.paid_at || "").slice(0, 10)} · UTR {d.utr}{d.tds_amount ? ` · TDS ${inr(d.tds_amount)}` : ""}</div>}
              {money && d.stage === "cancelled" && d.pay_status === "funded" && <form action={act} className="row tr-fields">{hidden("refund")}
                <input className="in tr-w-amt" name="amount" inputMode="decimal" required aria-label="Refunded ₹" placeholder="Refunded ₹" defaultValue={d.brand_paid_paise ? Number(d.brand_paid_paise) / 100 : ""} />
                <input className="in tr-grow" name="utr" required pattern="[A-Za-z0-9]{6,30}" aria-label="UTR of the refund" placeholder="UTR of the refund" /><button className="btn">Record refund</button></form>}
              {!d.sow_accepted_at && !closed && <p className="hint">The creator still has to accept the terms in their portal.</p>}
              {!progress && !money && <p className="hint">Your role is read-only.</p>}
              {progress && !closed && d.pay_status === "unfunded" && <form action={act} className="row tr-fields">{hidden("stage")}
                <select className="in tr-w-sel" name="stage" aria-label="Pipeline stage" defaultValue={d.stage}>{["shortlisted", "contacted", "negotiating", "dropped"].map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select><button className="btn sm">Set pipeline stage</button></form>}
              {boss && !closed && d.pay_status !== "paid" && d.pay_status !== "released" && <details className="tr-cancel"><summary className="hint">Cancel this deal</summary>
                <form action={act} className="row tr-fields" style={{ marginTop: 8 }}>{hidden("cancel")}<input className="in tr-grow" name="reason" required minLength={3} aria-label="Reason for cancelling" placeholder="Reason (the creator and the timeline see this)" /><button className="btn">Cancel deal</button></form></details>}
            </div>
          </Card>
        </Section>

        {progress && <Section id="terms" title="Terms" sub={d.pay_status !== "unfunded" ? `Locked: the deal is marked brand-paid${brandIn ? "" : " (no ledger entry yet)"}. To change the terms, cancel and refund, or add a note.` : "Brand, deliverable, fee and dates the creator accepts."}>
          <Card><form action={act}>
            {hidden("terms")}
            <fieldset disabled={d.pay_status !== "unfunded"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="form-grid">
              <div className="fld"><label htmlFor="f-team-deals-id-brand-1">Brand</label><input id="f-team-deals-id-brand-1" name="brand" defaultValue={d.brand ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-deliverable-2">Deliverable</label><input id="f-team-deals-id-deliverable-2" name="deliverable" defaultValue={d.deliverable ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-fee-3">Creator fee ₹</label><input id="f-team-deals-id-fee-3" name="fee" defaultValue={d.fee ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-expected-views-4">Expected views</label><input id="f-team-deals-id-expected-views-4" name="expected_views" defaultValue={d.expected_views ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-revisions-included-5">Revision rounds included</label><input id="f-team-deals-id-revisions-included-5" name="revisions_included" defaultValue={d.revisions_included} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-go-live-date-6">Go-live date</label><input id="f-team-deals-id-go-live-date-6" name="go_live_date" type="date" defaultValue={d.go_live_date ?? ""} /></div>
            </div>
            </fieldset>
            <div className="row" style={{ marginTop: 14 }}><button className="btn plum" disabled={d.pay_status !== "unfunded"}>Save terms</button><span className="hint">Now: {dealStepLine(d)}.{d.pay_status === "unfunded" ? " Changing the fee asks the creator to accept again." : ""}</span></div>
          </form></Card>
        </Section>}

        {progress && d.live_at && <Section id="results" title="Results" sub="Real numbers from the live post. They drive CPV and the brand's report.">
          <Card><form action={act}>
            {hidden("results")}
            <div className="form-grid">
              <div className="fld"><label htmlFor="f-team-deals-id-actual-views-7">Views</label><input id="f-team-deals-id-actual-views-7" name="actual_views" defaultValue={d.actual_views ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-likes-8">Likes</label><input id="f-team-deals-id-likes-8" name="likes" defaultValue={d.likes ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-comments-9">Comments</label><input id="f-team-deals-id-comments-9" name="comments" defaultValue={d.comments ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-orders-10">Orders</label><input id="f-team-deals-id-orders-10" name="orders" defaultValue={d.orders ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-sales-value-11">Sales value ₹ <span className="opt">— from the code/link</span></label><input id="f-team-deals-id-sales-value-11" name="sales_value" defaultValue={d.sales_value ?? ""} /></div>
              <div className="fld"><label htmlFor="f-team-deals-id-reward-value-12">Product / ticket value ₹</label><input id="f-team-deals-id-reward-value-12" name="reward_value" defaultValue={d.reward_value ?? ""} /></div>
              <div className="fld full"><label htmlFor="f-team-deals-id-market-rate-13">Market rate ₹ <span className="opt">— what this work usually costs; drives the brand's savings figure</span></label><input id="f-team-deals-id-market-rate-13" name="market_rate" defaultValue={d.market_rate ?? ""} /></div>
            </div>
            <button className="btn plum" style={{ marginTop: 14 }}>Save results</button>
          </form></Card>
        </Section>}

        <Section id="usage" title="Usage rights" sub="Where and for how long the brand may use the content.">
          <Card className="dr-panel">
            <UsageLine d={d} style={{ marginBottom: 12 }} />
            {progress ? <form action={room} className="stack">
              {roomHidden("usage")}
              <div className="form-grid">
                <div className="fld full"><label htmlFor="f-dr-usage-channels">Channels</label><input id="f-dr-usage-channels" name="usage_channels" required maxLength={500} defaultValue={usageChannels} placeholder="Organic repost, Paid ads (Meta), Website" /></div>
                <div className="fld"><label htmlFor="f-dr-usage-months">Months</label><input id="f-dr-usage-months" name="usage_months" type="number" inputMode="numeric" min={1} max={MAX_USAGE_MONTHS} step={1} required defaultValue={usageMonths} /></div>
                <div className="fld"><label htmlFor="f-dr-usage-starts">Starts <span className="opt">— empty = the live date</span></label><input id="f-dr-usage-starts" name="usage_starts" type="date" defaultValue={istDay(d.usage_starts_at)} /></div>
              </div>
              <p className="hint" style={{ margin: 0 }}>Common: {USAGE_CHANNELS.join(" · ")}. {!d.usage_channels && k?.usage_rights ? <>Prefilled from the campaign: "{k.usage_rights}".</> : null} The expiry is the start plus the months; the creator and the brand see it on their pages.</p>
              <div className="row"><button className="btn plum">Save usage rights</button></div>
            </form> : !d.usage_channels && <p className="hint" style={{ margin: 0 }}>{k?.usage_rights ? `Campaign terms: ${k.usage_rights}` : "No usage rights set yet."}</p>}
          </Card>
        </Section>

        <Section id="shipments" title="Gifting and product shipments" sub={shipments.length ? `${shipments.length} ${shipments.length === 1 ? "shipment" : "shipments"} on this deal` : "Products the creator needs for the content."}>
          <Card className="dr-panel">
            <div className="dr-address">
              <div className="lbl">Ship to <span className="opt">— team only, never shown to the brand</span></div>
              {address ? <div className="small" style={{ marginTop: 4 }}>{addressLines(address).map((l, i) => <div key={i}>{l}</div>)}</div>
                : <p className="hint" style={{ margin: "4px 0 0" }}>No address yet — ask the creator to add it in Settings.</p>}
            </div>
            {shipments.length > 0 && <div className="dr-ships" style={{ marginTop: 14 }}>{shipments.map((s) => (
              <div key={s.id} className="dr-shiprow">
                <div className="spread" style={{ gap: 8 }}><b className="small">{s.product}</b><ShipPill status={s.status} /></div>
                <div className="hint">{s.carrier || "Courier not set"}{s.awb ? <> · AWB <code className="k">{s.awb}</code></> : null} · added {dayTime(s.created_at)}{s.shipped_at ? ` · shipped ${dayTime(s.shipped_at)}` : ""}{s.delivered_at ? ` · delivered ${dayTime(s.delivered_at)}` : ""}{s.created_by ? ` · ${s.created_by}` : ""}</div>
                {s.note && <div className="small muted" style={{ marginTop: 2 }}>{s.note}</div>}
                {crew && nextStatuses(s.status).length > 0 && <form action={room} className="dr-move">
                  {roomHidden("ship_move")}<input type="hidden" name="shipment" value={s.id} />
                  {s.status === "pending" && <><input className="in" name="carrier" maxLength={80} placeholder="Courier" defaultValue={s.carrier ?? ""} aria-label="Courier" /><input className="in" name="awb" maxLength={40} placeholder="AWB number" defaultValue={s.awb ?? ""} aria-label="AWB number" /></>}
                  {nextStatuses(s.status).map((to) => <button key={to} className="btn sm" name="to" value={to}>Mark {SHIP_LABEL[to].toLowerCase()}</button>)}
                </form>}
              </div>
            ))}</div>}
            {crew ? <details className="dr-add">
              <summary className="hint">Add a shipment</summary>
              <form action={room} className="stack" style={{ marginTop: 10 }}>
                {roomHidden("ship_add")}
                <div className="form-grid">
                  <div className="fld full"><label htmlFor="f-dr-ship-product">Product</label><input id="f-dr-ship-product" name="product" required minLength={2} maxLength={200} placeholder="Diwali hamper, 2 kurtas (M)" /></div>
                  <div className="fld"><label htmlFor="f-dr-ship-carrier">Courier <span className="opt">— optional</span></label><input id="f-dr-ship-carrier" name="carrier" maxLength={80} placeholder="Delhivery, Blue Dart…" /></div>
                  <div className="fld"><label htmlFor="f-dr-ship-awb">AWB <span className="opt">— optional</span></label><input id="f-dr-ship-awb" name="awb" maxLength={40} pattern="[A-Za-z0-9\- ]{4,40}" /></div>
                  <div className="fld"><label htmlFor="f-dr-ship-status">Status</label><select id="f-dr-ship-status" name="ship_status" defaultValue="pending"><option value="pending">Packing (not sent yet)</option><option value="shipped">Already shipped</option></select></div>
                  <div className="fld"><label htmlFor="f-dr-ship-note">Note <span className="opt">— team only</span></label><input id="f-dr-ship-note" name="ship_note" maxLength={500} /></div>
                </div>
                <div className="row"><button className="btn plum">Add shipment</button><span className="hint">The creator sees the courier and AWB; the brand sees the status only.</span></div>
              </form>
            </details> : !shipments.length && <p className="hint" style={{ margin: "10px 0 0" }}>No shipments on this deal.</p>}
          </Card>
        </Section>
      </Grid>
    </TeamShell>
  );
}
