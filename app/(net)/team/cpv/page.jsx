import TeamShell from "../../_ui/TeamShell";
import Calc from "./Calc";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { RATE_GUIDE, inr } from "@/lib/net/creators";

export const metadata = { title: "CPV calculator · Colatch Connect", robots: { index: false, follow: false } };

export default async function Page() {
  const me = await requireTeam();
  const bench = await env.DB.prepare(
    `SELECT c.tier, COUNT(*) n, SUM(d.fee) fee, SUM(d.actual_views) v FROM creator_deals d JOIN creators c ON c.id=d.creator_id
     WHERE d.actual_views > 0 AND d.fee > 0 GROUP BY c.tier`
  ).all().then((r) => r.results ?? []).catch(() => []);
  return (
    <TeamShell active="cpv" eyebrow="Creator tools" title="What does a <b>view</b> cost?" email={me.email}>
      <p className="lead">Put in a creator's fee and their typical reel views, or compare up to three creators side by side. CPV means cost per view; CPM means cost per thousand views. Lower is better.</p>
      <Calc />
      <div className="sec grid2" style={{ alignItems: "start" }}>
        <div className="panel">
          <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Reel rate guide (India)</h2></div>
          <table className="tbl"><thead><tr><th>Tier</th><th>Followers</th><th className="num">Typical fee per reel</th></tr></thead><tbody>
            {[["Nano", "1K–10K"], ["Micro", "10K–1L"], ["Mid", "1L–5L"], ["Macro", "5L–10L"], ["Mega", "10L+"]].map(([t, f]) => <tr key={t}><td>{t}</td><td>{f}</td><td className="num">{inr(RATE_GUIDE[t][0])} – {inr(RATE_GUIDE[t][1])}</td></tr>)}
          </tbody></table>
          <p className="hint" style={{ padding: "0 20px 18px" }}>Market ranges for planning. Your own numbers on the right get better with every finished deal.</p>
        </div>
        <div className="panel">
          <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Colatch's real CPV, from finished deals</h2></div>
          {bench.length ? <table className="tbl"><thead><tr><th>Tier</th><th className="num">Deals</th><th className="num">Avg CPV</th><th className="num">CPM</th></tr></thead><tbody>
            {bench.map((b) => <tr key={b.tier || "none"}><td>{b.tier || "—"}</td><td className="num">{b.n}</td><td className="num">₹{(b.fee / b.v).toFixed(2)}</td><td className="num">{inr((b.fee / b.v) * 1000)}</td></tr>)}
          </tbody></table> : <p className="hint" style={{ padding: "0 20px 18px" }}>No finished deals with real views yet. Add actual views on live deals in the CRM and this fills in.</p>}
        </div>
      </div>
    </TeamShell>
  );
}
