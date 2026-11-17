import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import { flashUrl } from "../../_ui/flash";
import { AutoSelect } from "../_client";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { compact, inr, int, DEAL_STAGES, STAGE_LABEL, MANUAL_STAGES, canSetStage } from "@/lib/net/creators";
import { transition, FlowError } from "@/lib/net/dealflow";
import { logEvent } from "@/lib/net/deal";
import { inrKpi, inrFull, day } from "@/components/team/labels";
import { inrShort } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, FilterBar, Section, EmptyState } from "@/components/ui";

export const metadata = { title: "Creator CRM", robots: { index: false, follow: false } };

async function act(fd) {
  "use server";
  const id = String(fd.get("id") ?? "");
  const action = String(fd.get("action") ?? "");
  const back = String(fd.get("back") ?? "") || "/team/crm";
  const safeBack = back.startsWith("/team/crm") && !back.includes("//") ? back : "/team/crm";
  const me = await requireTeam("shortlist", safeBack);
  let err = "", ok = "";
  try {
    const d = await env.DB.prepare("SELECT id, stage, pay_status FROM creator_deals WHERE id=?").bind(id).first();
    if (!d) throw new FlowError("That deal does not exist.");
    if (action === "stage") {
      // Pipeline stages only. Confirmed / live / paid come from the deal steps (payment, live check, payout).
      const to = String(fd.get("stage") || "");
      if (to === d.stage) redirect(safeBack);
      const why = canSetStage(d, to);
      if (why) throw new FlowError(why);
      const r = await env.DB.prepare("UPDATE creator_deals SET stage=?, updated_at=datetime('now') WHERE id=? AND stage=? AND pay_status='unfunded'").bind(to, id, d.stage).run();
      if (!r.meta?.changes) throw new FlowError("The deal changed while you were looking at it. Reload and try again.");
      await logEvent(env, id, `team:${me.email}`, "note", `Stage: ${STAGE_LABEL[d.stage] || d.stage} → ${STAGE_LABEL[to] || to}`);
    } else if (action === "result") {
      await transition(id, "save_results", { kind: "team", id: me.email, role: me.role }, { actual_views: String(fd.get("actual_views") ?? "") });
      ok = "Results saved.";
    }
  } catch (e) {
    if (e instanceof FlowError) err = e.message;
    else if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    else { console.error("[team/crm]", action, e); err = "Something went wrong, nothing was changed."; }
  }
  redirect(err ? flashUrl(safeBack, "err", err) : ok ? flashUrl(safeBack, "ok", ok) : safeBack);
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const brand = searchParams?.brand ?? "";
  const here = "/team/crm" + (brand ? `?brand=${encodeURIComponent(brand)}` : "");
  const deals = (await env.DB.prepare(
    `SELECT d.*, c.handle, c.name, c.profile_pic, c.followers FROM creator_deals d JOIN creators c ON c.id=d.creator_id
     ${brand ? "WHERE d.brand = ?" : ""} ORDER BY d.updated_at DESC LIMIT 500`
  ).bind(...(brand ? [brand] : [])).all().catch(() => ({ results: [] }))).results ?? [];
  // Deals with a brand payment in the ledger: the same rule Money and ledger reconciles against.
  const fundedIds = new Set(((await env.DB.prepare("SELECT DISTINCT deal_id FROM finance_ledger WHERE kind='brand_payment_received' AND deal_id IS NOT NULL").all().catch(() => ({ results: [] }))).results ?? []).map((r) => r.deal_id));
  const brands = (await env.DB.prepare("SELECT DISTINCT brand FROM creator_deals WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand").all().catch(() => ({ results: [] }))).results ?? [];
  const by = Object.fromEntries(DEAL_STAGES.map((s) => [s, []]));
  for (const d of deals) (by[d.stage] ??= []).push(d);
  const active = deals.filter((d) => !["dropped", "cancelled"].includes(d.stage));
  const committed = deals.filter((d) => ["funded", "released", "paid"].includes(d.pay_status) && fundedIds.has(d.id));
  const spend = committed.reduce((s, d) => s + (d.fee || 0), 0);
  const views = committed.reduce((s, d) => s + (d.actual_views || d.expected_views || 0), 0);
  const doneViews = deals.filter((d) => d.actual_views && d.fee);
  const realCpv = doneViews.length ? doneViews.reduce((s, d) => s + d.fee, 0) / doneViews.reduce((s, d) => s + d.actual_views, 0) : null;
  const initials = (s) => String(s).replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const flash = searchParams?.ok;
  const flashErr = searchParams?.err;
  const cols = by.cancelled?.length ? [...DEAL_STAGES, "cancelled"] : DEAL_STAGES;

  const colFee = (s) => (by[s] ?? []).reduce((t, d) => t + Number(d.fee || 0), 0);
  const OFF = ["dropped", "cancelled"];

  return (
    <TeamShell active="crm" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator tools" }, { label: "Creator CRM" }]}
        actions={<a className="btn-foil" href="/team/creators">+ Add from finder</a>}
        eyebrow="Creator tools · Pipeline"
        title="Every creator, every <b>deal</b>."
        sub="Each card is one creator on one brand job. Move it through the pipeline by hand until the brand pays; after that the deal steps move it (payment, live check, payout). Add real views once it's live, and the board shows what each view actually cost."
      />
      {flash && <div className="note good" style={{ marginBottom: 16 }}>{flash}</div>}
      {flashErr && <div className="note bad" style={{ marginBottom: 16 }}>{flashErr}</div>}

      <KpiStrip label="Pipeline at a glance" items={[
        { label: "Open deals", value: active.length, foot: `across ${brands.length} ${brands.length === 1 ? "brand" : "brands"}` },
        { featured: true, label: "Committed spend", value: spend ? inrShort(spend) : "₹0", title: inrFull(spend), foot: `creator fees on ${committed.length} ${committed.length === 1 ? "deal" : "deals"} with a brand payment in the ledger` },
        { label: "Planned views", value: views ? compact(views) : "—", foot: spend && views ? `₹${(spend / views).toFixed(2)} planned CPV` : "on funded deals" },
        { label: "Actual CPV", value: realCpv != null ? `₹${realCpv.toFixed(2)}` : "—", foot: `${doneViews.length} ${doneViews.length === 1 ? "deal" : "deals"} with real views` },
      ]} />

      <Section id="board" title={brand ? `${brand}: <b>${deals.length}</b> ${deals.length === 1 ? "deal" : "deals"}` : "The board"} sub={deals.length ? `${deals.length} ${deals.length === 1 ? "deal" : "deals"} · column totals are creator fees` : null}>
        <FilterBar label="Filter the board" end={<form className="row tr-brandpick" method="get">
          <label className="ui-sr" htmlFor="crm-brand">Brand</label>
          <AutoSelect id="crm-brand" className="in" name="brand" defaultValue={brand}><option value="">All brands</option>{brands.map((b) => <option key={b.brand}>{b.brand}</option>)}</AutoSelect>
          {brand && <a className="btn ghost" href="/team/crm">Clear</a>}
        </form>}>
          <p className="small tr-boardhint">Pick a stage on a card to move it. Funded deals move with the deal steps.</p>
        </FilterBar>

        {deals.length ? <div className="board tr-board scroll-x" role="list" aria-label="Deals by stage">
          {cols.map((s) => (
            <div key={s} role="listitem" className={`col tr-col${OFF.includes(s) ? " tr-col--off" : ""}`}>
              <h4><span>{STAGE_LABEL[s]}</span><span>{by[s].length}</span></h4>
              <p className="tr-col__sum">{colFee(s) ? <b title={inrFull(colFee(s))}>{inrShort(colFee(s))}</b> : <span>₹0</span>}<span> in fees</span></p>
              {by[s].length === 0 && <p className="tr-col__empty">No deals here.</p>}
              {by[s].map((d) => { const v = d.actual_views || d.expected_views; return (
                <div key={d.id} className="card">
                  <a className="who" href={`/team/deals/${d.id}`}><div className="ava" style={{ width: 30, height: 30, fontSize: 11 }}>{d.profile_pic ? <img src={d.profile_pic} alt="" /> : initials(d.name || d.handle)}</div><div><b style={{ fontSize: 13.5 }}>{d.name || d.handle}</b><span>{d.brand}</span></div></a>
                  <div className="meta"><span>{d.deliverable || "—"}</span><b>{inr(d.fee)}</b></div>
                  <div className="meta"><span>{v ? `${compact(v)} ${d.actual_views ? "views" : "exp."}` : "No views yet"}</span><span>{d.fee && v ? `CPV ₹${(d.fee / v).toFixed(2)}` : ""}</span></div>
                  {d.pay_status === "unfunded" && MANUAL_STAGES.includes(d.stage) ? <form action={act} className="meta" style={{ marginTop: 10 }}><input type="hidden" name="action" value="stage" /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={here} />
                    <AutoSelect name="stage" defaultValue={d.stage} aria-label={`Stage for ${d.name || d.handle}`}>{MANUAL_STAGES.map((x) => <option key={x} value={x}>{STAGE_LABEL[x]}</option>)}</AutoSelect>
                    {d.go_live_date && <span>{day(d.go_live_date) || d.go_live_date}</span>}</form>
                    : <div className="meta" style={{ marginTop: 10 }}><span className="hint">{d.pay_status === "unfunded" ? "Moves with the deal steps" : `Brand ${d.pay_status === "funded" ? "paid" : d.pay_status}`}</span>{d.go_live_date && <span>{day(d.go_live_date) || d.go_live_date}</span>}</div>}
                  {d.live_at && (
                    <details style={{ marginTop: 8 }}><summary className="hint" style={{ cursor: "pointer" }}>Add results</summary>
                      <form action={act} className="stack" style={{ marginTop: 8 }}><input type="hidden" name="action" value="result" /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={here} />
                        <input className="in" name="actual_views" aria-label="Actual views" placeholder="Actual views" defaultValue={d.actual_views ?? ""} />
                        <button className="btn sm plum">Save</button></form></details>)}
                </div>); })}
            </div>
          ))}
        </div>
          : <EmptyState title={brand ? `No deals for ${brand}.` : "No deals yet."} body={'Open a creator in the finder and use "Add to CRM", or accept an applicant on an open campaign.'}
              action={brand ? <a className="btn sm" href="/team/crm">See every brand</a> : <a className="btn sm" href="/team/campaigns">Open campaigns</a>} />}
      </Section>
    </TeamShell>
  );
}
