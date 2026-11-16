import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { can, logError } from "@/lib/net/security";
import { REASONS, resolveDispute, DisputeError } from "@/lib/net/disputes";

export const metadata = { title: "Disputes", robots: { index: false, follow: false } };

const BACK = "/team/disputes";
const SIDE = { creator: "Creator", brand: "Brand", team: "Colatch team" };
const when = (t) => (t ? new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");

async function resolve(fd) {
  "use server";
  // Checked here as well as on the page: a Server Action can be called directly.
  const me = await requireTeam("shortlist", BACK);
  let err = "", ok = "";
  try {
    const outcome = String(fd.get("outcome") ?? "");
    await resolveDispute(String(fd.get("id") ?? ""), me, outcome, String(fd.get("resolution") ?? ""));
    ok = outcome === "resolved" ? "Dispute resolved. The person who raised it has been told." : "Dispute rejected. The person who raised it has been told.";
  } catch (e) {
    if (e instanceof DisputeError) err = e.message;
    else { await logError("team/disputes.resolve", e); err = "Something went wrong, nothing was changed. Try again."; }
  }
  redirect(flashUrl(BACK, err ? "err" : "ok", err || ok));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const canResolve = can(me.role, "shortlist");
  const rows = (await env.DB.prepare(
    `SELECT x.*, d.brand, d.deliverable, d.pay_status, c.name AS creator_name, c.handle, k.title
     FROM disputes x
     LEFT JOIN creator_deals d ON d.id = x.deal_id
     LEFT JOIN creators c ON c.id = d.creator_id
     LEFT JOIN campaigns k ON k.id = d.campaign_id
     ORDER BY CASE x.status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(x.resolved_at, x.created_at) DESC LIMIT 200`
  ).all().catch(() => ({ results: [] }))).results ?? [];
  const open = rows.filter((r) => r.status === "open");
  const closed = rows.filter((r) => r.status !== "open");

  return (
    <TeamShell active="disputes" eyebrow="Trust and safety" title="Deal <b>disputes</b>" email={me.email} role={me.role}>
      <p className="lead">Raised by a creator, a brand or the team. A dispute never moves money: if money has to move, use Cancel or Refund in the deal room so it goes through the ledger.</p>
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>
      {!canResolve && <div className="note info" style={{ marginBottom: 16 }}>Your role ({me.role}) can read disputes but not resolve them. Ask an owner, admin or shortlister.</div>}

      <section className="sheet" aria-labelledby="open-h" style={{ marginBottom: 32 }}>
        <div className="sheet__h"><h2 id="open-h">Open</h2><span className="n">{open.length}</span></div>
        {open.length === 0 && <div className="allclear"><b>No open disputes.</b> When a creator or brand raises one from their deal, it lands here and the team inbox gets an email.</div>}
        {open.map((x) => (
          <div key={x.id} className="panel pad">
            <div className="spread" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <span className="pill mine">Needs a decision</span>
                <h3 style={{ marginTop: 10 }}><a className="link" href={`/team/deals/${x.deal_id}`}>{x.creator_name || x.handle || "Creator"} × {x.brand || x.title || "Brand"}</a></h3>
                <p className="hint" style={{ margin: 0 }}>{SIDE[x.raised_by_kind]} · {REASONS[x.reason] || x.reason} · raised {when(x.created_at)}</p>
              </div>
            </div>
            <p style={{ whiteSpace: "pre-line", margin: "12px 0 0" }}>{x.detail}</p>
            {canResolve && (
              <form action={resolve} className="stack" style={{ marginTop: 16 }}>
                <input type="hidden" name="id" value={x.id} />
                <div className="fld"><label htmlFor={`res-${x.id}`}>Outcome the parties will read</label>
                  <textarea id={`res-${x.id}`} name="resolution" required minLength={10} maxLength={2000} placeholder="What the team found and what happens next. If money must move, say so and record it in the deal room." /></div>
                <div className="row">
                  <button className="btn plum" name="outcome" value="resolved">Resolve</button>
                  <button className="btn" name="outcome" value="rejected">Reject</button>
                  <a className="link small" href={`/team/deals/${x.deal_id}`}>Open the deal room</a>
                </div>
              </form>
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="closed-h">
        <div className="sheet__h"><h2 id="closed-h">Closed</h2><span className="n">{closed.length}</span></div>
        {closed.length === 0 ? <p className="hint">No closed disputes yet.</p> : (
          <div className="panel scroll-x"><table className="tbl">
            <thead><tr><th>Deal</th><th>Raised by</th><th>Reason</th><th>Outcome</th><th>Closed</th></tr></thead>
            <tbody>{closed.map((x) => (
              <tr key={x.id}>
                <td><a className="link" href={`/team/deals/${x.deal_id}`}>{x.creator_name || x.handle || "Creator"} × {x.brand || x.title || "Brand"}</a></td>
                <td>{SIDE[x.raised_by_kind]}</td>
                <td>{REASONS[x.reason] || x.reason}</td>
                <td><span className={`pill ${x.status === "resolved" ? "good" : "low"}`}>{x.status === "resolved" ? "Resolved" : "Rejected"}</span><div className="hint" style={{ maxWidth: 320 }}>{x.resolution}</div></td>
                <td className="hint">{when(x.resolved_at)} · {x.resolved_by}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </TeamShell>
  );
}
