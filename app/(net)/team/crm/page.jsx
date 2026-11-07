import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import { flashUrl } from "../../_ui/flash";
import { AutoSelect } from "../_client";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { compact, inr, int, str, DEAL_STAGES, STAGE_LABEL } from "@/lib/net/creators";

export const metadata = { title: "Creator CRM · Colatch Connect", robots: { index: false, follow: false } };

async function act(fd) {
  "use server";
  await requireTeam();
  const id = String(fd.get("id") ?? "");
  const action = String(fd.get("action") ?? "");
  const back = String(fd.get("back") ?? "") || "/team/crm";
  const safeBack = back.startsWith("/team/crm") ? back : "/team/crm";
  if (action === "stage" && DEAL_STAGES.includes(String(fd.get("stage")))) {
    await env.DB.prepare("UPDATE creator_deals SET stage=?, updated_at=datetime('now') WHERE id=?").bind(String(fd.get("stage")), id).run();
    redirect(safeBack);
  } else if (action === "result") {
    await env.DB.prepare("UPDATE creator_deals SET actual_views=?, post_url=?, fee=COALESCE(?,fee), updated_at=datetime('now') WHERE id=?")
      .bind(int(fd.get("actual_views")), str(fd.get("post_url")), int(fd.get("fee")), id).run();
    redirect(flashUrl(safeBack, "ok", "Results saved."));
  }
  redirect(safeBack);
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const brand = searchParams?.brand ?? "";
  const here = "/team/crm" + (brand ? `?brand=${encodeURIComponent(brand)}` : "");
  const deals = (await env.DB.prepare(
    `SELECT d.*, c.handle, c.name, c.profile_pic, c.followers FROM creator_deals d JOIN creators c ON c.id=d.creator_id
     ${brand ? "WHERE d.brand = ?" : ""} ORDER BY d.updated_at DESC LIMIT 500`
  ).bind(...(brand ? [brand] : [])).all().catch(() => ({ results: [] }))).results ?? [];
  const brands = (await env.DB.prepare("SELECT DISTINCT brand FROM creator_deals WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand").all().catch(() => ({ results: [] }))).results ?? [];
  const by = Object.fromEntries(DEAL_STAGES.map((s) => [s, []]));
  for (const d of deals) (by[d.stage] ??= []).push(d);
  const active = deals.filter((d) => !["dropped"].includes(d.stage));
  const committed = deals.filter((d) => ["confirmed", "live", "paid"].includes(d.stage));
  const spend = committed.reduce((s, d) => s + (d.fee || 0), 0);
  const views = committed.reduce((s, d) => s + (d.actual_views || d.expected_views || 0), 0);
  const doneViews = deals.filter((d) => d.actual_views && d.fee);
  const realCpv = doneViews.length ? doneViews.reduce((s, d) => s + d.fee, 0) / doneViews.reduce((s, d) => s + d.actual_views, 0) : null;
  const initials = (s) => String(s).replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const flash = searchParams?.ok;

  return (
    <TeamShell active="crm" eyebrow="Creator tools" title="Every creator, every <b>deal</b>." email={me.email}
      actions={<a className="btn-foil" href="/team/creators">+ Add from finder</a>}>
      <p className="lead">Each card is one creator on one brand job. Move it along as the deal progresses. Add real views once it's live, and the board shows what each view actually cost.</p>
      {flash && <div className="note good" style={{ marginBottom: 16 }}>{flash}</div>}

      <div className="grid4">
        <div className="panel kpi"><div className="k">Open deals</div><div className="v">{active.length}</div><div className="s">across {brands.length} brands</div></div>
        <div className="panel kpi"><div className="k">Committed spend</div><div className="v">{inr(spend)}</div><div className="s">confirmed + live + paid</div></div>
        <div className="panel kpi"><div className="k">Planned views</div><div className="v">{compact(views)}</div><div className="s">{spend && views ? `₹${(spend / views).toFixed(2)} planned CPV` : "—"}</div></div>
        <div className="panel kpi"><div className="k">Actual CPV</div><div className="v">{realCpv != null ? `₹${realCpv.toFixed(2)}` : "—"}</div><div className="s">{doneViews.length} deals with real views</div></div>
      </div>

      <form className="row sec" method="get" style={{ marginTop: 22 }}>
        <AutoSelect className="in" name="brand" defaultValue={brand} style={{ width: "auto" }}><option value="">All brands</option>{brands.map((b) => <option key={b.brand}>{b.brand}</option>)}</AutoSelect>
        {brand && <a className="btn ghost" href="/team/crm">Clear</a>}
      </form>

      <div className="board" style={{ marginTop: 14 }}>
        {DEAL_STAGES.map((s) => (
          <div key={s} className="col">
            <h4><span>{STAGE_LABEL[s]}</span><span>{by[s].length}</span></h4>
            {by[s].map((d) => { const v = d.actual_views || d.expected_views; return (
              <div key={d.id} className="card">
                <a className="who" href={`/team/deals/${d.id}`}><div className="ava" style={{ width: 30, height: 30, fontSize: 11 }}>{d.profile_pic ? <img src={d.profile_pic} alt="" /> : initials(d.name || d.handle)}</div><div><b style={{ fontSize: 13.5 }}>{d.name || d.handle}</b><span>{d.brand}</span></div></a>
                <div className="meta"><span>{d.deliverable || "—"}</span><b>{inr(d.fee)}</b></div>
                <div className="meta"><span>{v ? `${compact(v)} ${d.actual_views ? "views" : "exp."}` : "No views yet"}</span><span>{d.fee && v ? `CPV ₹${(d.fee / v).toFixed(2)}` : ""}</span></div>
                <form action={act} className="meta" style={{ marginTop: 10 }}><input type="hidden" name="action" value="stage" /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={here} />
                  <AutoSelect name="stage" defaultValue={d.stage}>{DEAL_STAGES.map((x) => <option key={x} value={x}>{STAGE_LABEL[x]}</option>)}</AutoSelect>
                  {d.go_live_date && <span>{d.go_live_date}</span>}</form>
                {["live", "paid"].includes(d.stage) && (
                  <details style={{ marginTop: 8 }}><summary className="hint" style={{ cursor: "pointer" }}>Add results</summary>
                    <form action={act} className="stack" style={{ marginTop: 8 }}><input type="hidden" name="action" value="result" /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={here} />
                      <input className="in" name="actual_views" placeholder="Actual views" defaultValue={d.actual_views ?? ""} />
                      <input className="in" name="post_url" placeholder="Post link" defaultValue={d.post_url ?? ""} />
                      <button className="btn sm plum">Save</button></form></details>)}
              </div>); })}
          </div>
        ))}
      </div>
      {!deals.length && <div className="panel empty sec"><b>No deals yet.</b>Open a creator in the finder and use "Add to CRM", or accept an applicant on an open campaign.</div>}
    </TeamShell>
  );
}
