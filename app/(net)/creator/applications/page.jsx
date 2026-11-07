import { redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { inr } from "@/lib/net/creators";
import { REJECT_REASONS } from "@/lib/net/campaign";

export const metadata = { title: "My deals · Colatch", robots: { index: false } };

const label = { new: ["Under review", ""], shortlisted: ["Shortlisted", "ok"], accepted: ["Selected", "good"], rejected: ["Not selected", "low"] };
const dueText = (created) => {
  const due = new Date(Date.parse(String(created).replace(" ", "T") + "Z") + 3 * 864e5);
  return due.getTime() < Date.now() ? "Decision overdue, we are chasing the brand" : "Decision by " + due.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
const dealState = (d) => d.pay_status === "paid" ? ["Paid", "good"] : !d.sow_accepted_at ? ["Accept terms", "ok"] : d.draft_status === "changes" ? ["Changes asked", "ok"] : d.draft_status === "none" ? ["Send draft", "ok"] : d.draft_status === "submitted" ? ["In review", ""] : !d.live_at ? ["Post it", "ok"] : ["Payment pending", ""];

export default async function Page() {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/applications");
  const c = me.creator;
  const apps = (await env.DB.prepare(`SELECT a.status, a.created_at, a.match_score, a.reject_reason, k.title, k.slug, CASE WHEN a.status = 'accepted' THEN k.brand ELSE COALESCE(k.brand_category, 'Brand hidden until selected') END AS brand, k.status AS kstatus FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id WHERE a.creator_id=? OR a.handle=? ORDER BY a.created_at DESC`).bind(c.id, c.handle).all()).results ?? [];
  const deals = (await env.DB.prepare("SELECT d.id, CASE WHEN d.sow_accepted_at IS NOT NULL THEN d.brand ELSE 'Brand revealed after you accept' END AS brand, d.deliverable, d.fee, d.pay_status, d.draft_status, d.sow_accepted_at, d.live_at FROM creator_deals d WHERE d.creator_id=? AND d.stage <> 'dropped' ORDER BY d.updated_at DESC").bind(c.id).all()).results ?? [];
  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/applications">
      {deals.length > 0 && <div style={{ marginBottom: 30 }}><div className="lbl">My deals</div>
        <div className="stack" style={{ marginTop: 10 }}>{deals.map((d) => {
          const [st, cls] = dealState(d);
          return <a key={d.id} className="opp" href={`/creator/deals/${d.id}`} style={{ padding: "16px 20px" }}><div className="top"><div><div className="br">{d.brand}</div><h3 style={{ fontSize: 16 }}>{d.deliverable || "Deal"}</h3></div><div className="row" style={{ gap: 8 }}><b>{d.fee ? inr(d.fee) : "Product"}</b><span className={`pill ${cls}`}>{st}</span></div></div></a>;
        })}</div></div>}
      <div className="lbl">My applications</div>
      <p className="hint" style={{ margin: "0 0 10px" }}>Every application gets a decision within 3 days, with a reason if it's a no.</p>
      <h1 style={{ margin: "6px 0 20px", fontWeight: 300, fontSize: 30, color: "var(--p900)" }}>{apps.length} {apps.length === 1 ? "application" : "applications"}</h1>
      {apps.length ? (
        <div className="panel scroll-x"><table className="tbl"><thead><tr><th>Brief</th><th>Applied</th><th className="num">Match</th><th>Status</th></tr></thead><tbody>
          {apps.map((a, i) => (
            <tr key={a.slug + i}>
              <td><a className="link" href={`/creator/o/${a.slug}`}>{a.title}</a><div className="hint">{a.brand || "Brand confidential"}{a.kstatus === "closed" ? " · closed" : ""}</div></td>
              <td>{String(a.created_at).slice(0, 10)}</td>
              <td className="num">{a.match_score ?? "—"}</td>
              <td><span className={`pill ${label[a.status]?.[1] ?? ""}`}>{label[a.status]?.[0] ?? a.status}</span>
                {a.status === "new" && <div className="hint">{dueText(a.created_at)}</div>}
                {a.status === "rejected" && REJECT_REASONS[a.reject_reason] && <div className="hint" style={{ maxWidth: 280, marginTop: 4 }}><b>{REJECT_REASONS[a.reject_reason][0]}.</b> Tip: {REJECT_REASONS[a.reject_reason][1]}</div>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
      ) : <div className="panel empty"><b>No applications yet.</b><a className="link" href="/creator">See the briefs that fit you →</a></div>}
    </PublicShell>
  );
}
