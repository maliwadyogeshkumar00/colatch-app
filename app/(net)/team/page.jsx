import { redirect } from "next/navigation";
import { headers } from "next/headers";
import TeamShell from "../_ui/TeamShell";
import Flash, { flashUrl } from "../_ui/flash";
import { requireTeam } from "./_guard";
import { env } from "@/lib/net/env";
import { newToken } from "@/lib/net/tokens";
import { audit } from "@/lib/net/security";
import { inr } from "@/lib/net/creators";
import { formatIST } from "@/lib/net/brief";
import { DEMO_INSERTS, DEMO_DELETES } from "./demo";

export const metadata = { title: "Network overview", robots: { index: false, follow: false } };

async function loadDemo() {
  "use server";
  // Demo rows live in the same database as real data, so only an owner can load or remove them.
  const me = await requireTeam("owner");
  // A fresh shortlist token each time, so no demo link is guessable from the source code.
  const token = newToken() + newToken();
  for (const s of DEMO_DELETES) await env.DB.prepare(s).run();
  for (const s of DEMO_INSERTS) await env.DB.prepare(s.replaceAll("__DEMO_TOKEN__", token)).run();
  await audit({ kind: "team", id: me.email }, "demo.load", null, null, null);
  redirect(flashUrl("/team", "ok", "Demo data loaded: one campaign, four creators, three deals. Everything is named DEMO."));
}

async function removeDemo() {
  "use server";
  const me = await requireTeam("owner");
  for (const s of DEMO_DELETES) await env.DB.prepare(s).run();
  await audit({ kind: "team", id: me.email }, "demo.remove", null, null, null);
  redirect(flashUrl("/team", "ok", "Demo data removed."));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const one = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first().catch(() => null)) ?? {};
  const many = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results ?? [];
  const monthStart = new Date().toISOString().slice(0, 8) + "01";

  const k = await one(`SELECT
      (SELECT COUNT(*) FROM campaigns WHERE status='open') open_n,
      (SELECT COUNT(*) FROM campaigns WHERE status='pending') pending_n,
      (SELECT COUNT(*) FROM campaign_applications WHERE created_at >= datetime('now','-7 days')) apps_week,
      (SELECT COUNT(*) FROM creator_deals WHERE stage='live') live_n,
      (SELECT COUNT(*) FROM creators WHERE status <> 'blacklisted') creators_n,
      (SELECT COUNT(*) FROM creator_accounts) accounts_n,
      (SELECT COALESCE(SUM(fee),0) FROM creator_deals WHERE pay_status='paid' AND paid_at >= ?) paid_month,
      (SELECT COUNT(*) FROM creators WHERE id LIKE 'demo-%') demo_n,
      (SELECT COUNT(*) FROM bypass_reports WHERE status='open') reports_n`, monthStart);

  // Briefs that still owe the client a shortlist (oldest promise first).
  const waiting = await many(`SELECT k.id, k.title, k.brand, k.client_company, k.shortlist_due, k.status, k.created_at,
      (SELECT COUNT(*) FROM campaign_applications a WHERE a.campaign_id=k.id AND a.status IN ('shortlisted','accepted')) sl
    FROM campaigns k WHERE k.status IN ('pending','open') ORDER BY COALESCE(k.shortlist_due, k.created_at) ASC LIMIT 40`);
  const owed = waiting.filter((w) => !w.sl);
  const now = Date.now();

  const newApps = await many(`SELECT k.id, k.title, COUNT(*) n FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id
    WHERE a.status='new' GROUP BY k.id, k.title ORDER BY COUNT(*) DESC LIMIT 10`);
  const drafts = await many(`SELECT d.id, d.brand, d.auto_approve_at, c.name, c.handle FROM creator_deals d JOIN creators c ON c.id=d.creator_id
    WHERE d.draft_status='submitted' ORDER BY d.auto_approve_at ASC LIMIT 10`);
  const toPay = await many(`SELECT d.id, d.brand, d.fee, d.pay_status, c.name, c.handle FROM creator_deals d JOIN creators c ON c.id=d.creator_id
    WHERE ((d.live_at IS NOT NULL AND d.pay_status='funded') OR d.pay_status='released') AND d.stage <> 'cancelled' ORDER BY d.live_at ASC LIMIT 10`);
  const unfunded = await many(`SELECT d.id, d.brand, d.fee, c.name, c.handle FROM creator_deals d JOIN creators c ON c.id=d.creator_id
    WHERE d.sow_accepted_at IS NOT NULL AND d.pay_status='unfunded' AND d.stage NOT IN ('cancelled','dropped') ORDER BY d.updated_at DESC LIMIT 10`);
  const team = await many("SELECT name, email, role FROM team_users ORDER BY created_at");
  const pitchReqs = await many(`SELECT k.id, k.title, k.client_company, k.budget_total, k.shortlist_due, p.requests FROM campaigns k
    LEFT JOIN creator_pitches p ON p.id=k.pitch_id WHERE k.source='pitch' AND k.status='pending' ORDER BY k.created_at DESC LIMIT 10`);

  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const nameOf = (r) => r.name || "@" + r.handle;
  const nothing = !pitchReqs.length && !owed.length && !newApps.length && !drafts.length && !toPay.length && !unfunded.length;

  return (
    <TeamShell active="home" title="Your creator <b>network</b>, at a glance." email={me.email}
      actions={<a className="btn-foil" href="/team/campaigns#new">+ New opportunity</a>}>
      <p className="lead">Briefs from brands, creators who joined, and every deal from terms to payout. What needs you comes first.</p>
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>

      {Number(k.reports_n) > 0 && (
        <div className="note bad" style={{ marginBottom: 16 }}>
          <b>{k.reports_n} open off-platform {Number(k.reports_n) === 1 ? "report" : "reports"}.</b> Someone says they were asked to deal outside Colatch. <a className="link" href="/team/reports">Review reports →</a>
        </div>
      )}
      <div className="grid3">
        <div className="panel kpi"><div className="k">Open campaigns</div><div className="v">{k.open_n ?? 0}</div><div className="s">{k.pending_n ?? 0} waiting for approval</div></div>
        <div className="panel kpi"><div className="k">Shortlists owed</div><div className="v">{owed.length}</div><div className="s">{owed[0]?.shortlist_due ? `Next due ${formatIST(owed[0].shortlist_due)}` : "No promise pending"}</div></div>
        <div className="panel kpi"><div className="k">Applicants this week</div><div className="v">{k.apps_week ?? 0}</div><div className="s">across all briefs</div></div>
        <div className="panel kpi"><div className="k">Live deals</div><div className="v">{k.live_n ?? 0}</div><div className="s">posts up, payout pending</div></div>
        <div className="panel kpi"><div className="k">Creators</div><div className="v">{k.creators_n ?? 0}</div><div className="s">{k.accounts_n ?? 0} with a portal login</div></div>
        <div className="panel kpi"><div className="k">Paid this month</div><div className="v">{inr(k.paid_month ?? 0)}</div><div className="s">creator fees cleared</div></div>
      </div>

      <div className="sec">
        <div className="h2">Needs you</div>
        {nothing && <div className="panel empty"><b>Nothing waiting.</b>Share the brief link with brands and the join link with creators to get things moving.</div>}
        <div className="grid2" style={{ alignItems: "start" }}>
          {pitchReqs.length > 0 && <div className="panel"><div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Pitch requests from the idea board</h2></div>
            <table className="tbl"><tbody>{pitchReqs.map((r) => <tr key={r.id}><td><a className="link" href={`/team/campaigns/${r.id}`}>{r.title}</a><div className="hint">{r.client_company || "Brand"} wants this idea · confirm the creator's dates</div></td>
              <td className="num">{r.budget_total ? inr(r.budget_total) : ""}{r.shortlist_due ? <div className="hint">Due {formatIST(r.shortlist_due)}</div> : null}</td></tr>)}</tbody></table></div>}
          {owed.length > 0 && <div className="panel"><div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Shortlists owed to clients</h2></div>
            <table className="tbl"><tbody>{owed.map((w) => {
              const late = w.shortlist_due && Date.parse(w.shortlist_due) < now;
              return <tr key={w.id}><td><a className="link" href={`/team/campaigns/${w.id}`}>{w.title}</a><div className="hint">{w.client_company || w.brand || "Brand"} · {w.status === "pending" ? "needs approval" : "open"}</div></td>
                <td className="num">{w.shortlist_due ? <span className={`pill ${late ? "low" : "ok"}`}>{late ? "Late · " : "Due "}{formatIST(w.shortlist_due)}</span> : <span className="hint">no promise</span>}</td></tr>;
            })}</tbody></table></div>}
          {newApps.length > 0 && <div className="panel"><div className="pad" style={{ padding: "18px 20px 6px" }}><h2>New applicants to review</h2></div>
            <table className="tbl"><tbody>{newApps.map((a) => <tr key={a.id}><td><a className="link" href={`/team/campaigns/${a.id}`}>{a.title}</a></td><td className="num"><span className="pill ok">{a.n} new</span></td></tr>)}</tbody></table></div>}
          {drafts.length > 0 && <div className="panel"><div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Drafts in review</h2></div>
            <table className="tbl"><tbody>{drafts.map((d) => <tr key={d.id}><td><a className="link" href={`/team/deals/${d.id}`}>{nameOf(d)} × {d.brand}</a></td><td className="num hint">{d.auto_approve_at ? `auto-approves ${formatIST(d.auto_approve_at)}` : ""}</td></tr>)}</tbody></table></div>}
          {toPay.length > 0 && <div className="panel"><div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Ready to pay out</h2></div>
            <table className="tbl"><tbody>{toPay.map((d) => <tr key={d.id}><td><a className="link" href={`/team/deals/${d.id}`}>{nameOf(d)} × {d.brand}</a><div className="hint">{d.pay_status === "released" ? "Payout approved: send it, then record the UTR" : "Live and funded: verify the post, approve the payout"}</div></td><td className="num">{inr(d.fee)}</td></tr>)}</tbody></table></div>}
          {unfunded.length > 0 && <div className="panel"><div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Terms accepted, brand not paid yet</h2></div>
            <table className="tbl"><tbody>{unfunded.map((d) => <tr key={d.id}><td><a className="link" href={`/team/deals/${d.id}`}>{nameOf(d)} × {d.brand}</a><div className="hint">Collect the brand payment before the creator shoots</div></td><td className="num">{inr(d.fee)}</td></tr>)}</tbody></table></div>}
        </div>
      </div>

      <div className="grid2 sec" style={{ alignItems: "start" }}>
        <div className="panel pad">
          <h2>Share links</h2>
          <p className="small" style={{ margin: "0 0 8px" }}>Brands post a brief: <code className="k">{origin}/brief</code></p>
          <p className="small" style={{ margin: 0 }}>Creators join free: <code className="k">{origin}/join</code></p>
          {me.role === "owner" && <><div className="lbl" style={{ marginTop: 18 }}>Demo data</div>
          <p className="hint" style={{ margin: "6px 0 10px" }}>One festive Bhangra campaign with four creators and three deals (paid, live, draft in review), so you can click through every screen. All rows are named DEMO and ids start with demo-.</p>
          <div className="row">
            <form action={loadDemo}><button className="btn sm">{k.demo_n ? "Reload demo data" : "Load demo data"}</button></form>
            {k.demo_n > 0 && <form action={removeDemo}><button className="btn sm danger">Remove demo data</button></form>}
            {k.demo_n > 0 && <a className="btn sm" href="/team/campaigns/demo-camp-1">Open demo campaign</a>}
          </div></>}
        </div>
        <div className="panel pad">
          <h2>Team</h2>
          <p className="small" style={{ margin: "0 0 10px" }}>{team.map((t) => t.name || t.email).join(", ")}</p>
          <a className="btn sm" href="/team/members">Manage members and roles</a>
        </div>
      </div>
    </TeamShell>
  );
}
