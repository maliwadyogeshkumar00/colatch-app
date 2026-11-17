import { redirect } from "next/navigation";
import { ClaimNote } from "@/app/(net)/join/_claim.js";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { inr } from "@/lib/net/creators";
import { REJECT_REASONS } from "@/lib/net/campaign";
import { dealState, dayText, APP_LABEL } from "../../_ui/dealState";

export const metadata = { title: "My deals", robots: { index: false } };

const label = APP_LABEL;
const dueText = (created) => {
  const due = new Date(Date.parse(String(created).replace(" ", "T") + "Z") + 3 * 864e5);
  return due.getTime() < Date.now() ? "Decision overdue" : "Decision by " + due.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default async function Page() {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/applications");
  // A pending profile claim sees none of that creator's data, and writes nothing.
  if (me.claimPending) return <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator/applications"><ClaimNote status="pending" /></PublicShell>;
  const c = me.creator;
  const apps = (await env.DB.prepare(`SELECT a.status, a.created_at, a.match_score, a.reject_reason, k.title, k.slug, CASE WHEN a.status = 'accepted' THEN k.brand ELSE COALESCE(k.brand_category, 'Brand hidden until selected') END AS brand, k.status AS kstatus FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id WHERE a.creator_id=? OR a.handle=? ORDER BY a.created_at DESC`).bind(c.id, c.handle).all()).results ?? [];
  const deals = (await env.DB.prepare("SELECT d.id, CASE WHEN d.sow_accepted_at IS NOT NULL THEN d.brand ELSE 'Brand revealed after you accept' END AS brand, d.deliverable, d.fee, d.pay_status, d.draft_status, d.sow_accepted_at, d.live_at, d.post_url, d.stage FROM creator_deals d WHERE d.creator_id=? AND d.stage <> 'dropped' ORDER BY d.updated_at DESC").bind(c.id).all()).results ?? [];
  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/applications">
      <div className="panel pad" style={{ marginBottom: 26, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", background: "linear-gradient(135deg,#1B1342,#1B1342)", color: "#F4EFE3", border: 0 }}>
        <div><div className="lbl" style={{ color: "var(--p300)" }}>New · Idea board</div><div style={{ fontSize: 17, marginTop: 4 }}>Got a content idea a brand would love? Pitch it with your price and let brands book you.</div></div>
        <a className="btn-foil" href="/creator/pitch">Pitch an idea</a>
      </div>
      {deals.length > 0 && <div style={{ marginBottom: 30 }}><div className="lbl">My deals</div>
        <div className="stack" style={{ marginTop: 10 }}>{deals.map((d) => {
          const [st, cls] = dealState(d);
          return <a key={d.id} className="opp" href={`/creator/deals/${d.id}`} style={{ padding: "16px 20px" }}><div className="top"><div><div className="br">{d.brand}</div><h3 style={{ fontSize: 16 }}>{d.deliverable || "Deal"}</h3></div><div className="row" style={{ gap: 8 }}><b>{d.fee ? inr(d.fee) : "Product"}</b><span className={`pill ${cls}`}>{st}</span></div></div></a>;
        })}</div></div>}
      <div className="lbl">My applications</div>
      <p className="hint" style={{ margin: "0 0 10px" }}>The team aims to decide within 3 days and gives a reason if it's a no. You can withdraw from the brief page until you're selected.</p>
      <h1 style={{ margin: "6px 0 20px", fontWeight: 300, fontSize: 30, color: "var(--head)" }}>{apps.length} {apps.length === 1 ? "application" : "applications"}</h1>
      {apps.length ? (
        <div className="panel scroll-x"><table className="tbl stack-sm"><thead><tr><th>Brief</th><th>Applied</th><th className="num">Match</th><th>Status</th></tr></thead><tbody>
          {apps.map((a, i) => (
            <tr key={a.slug + i}>
              <td data-label="Brief"><a className="link" href={`/creator/o/${a.slug}`}>{a.title}</a><div className="hint">{a.brand || "Brand confidential"}{a.kstatus === "closed" ? " · closed" : ""}</div></td>
              <td data-label="Applied" style={{ whiteSpace: "nowrap" }}>{dayText(a.created_at)}</td>
              <td className="num" data-label="Match">{a.match_score ?? "—"}</td>
              <td data-label="Status"><span className={`pill ${label[a.status]?.[1] ?? ""}`}>{label[a.status]?.[0] ?? a.status}</span>
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
