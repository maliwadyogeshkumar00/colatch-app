import TeamShell from "../../_ui/TeamShell";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { inr } from "@/lib/net/creators";
import { list } from "@/lib/net/match";

export const metadata = { title: "Marketplace health · Colatch Connect", robots: { index: false, follow: false } };

export default async function Page() {
  const me = await requireTeam();
  const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results ?? [];
  const camps = await q("SELECT id, title, talent_types, city, status, created_at, creators_needed, promised_cpv, brand, client_company, source FROM campaigns WHERE status <> 'rejected'");
  const apps = await q("SELECT campaign_id, created_at, status FROM campaign_applications");
  const deals = await q("SELECT d.campaign_id, d.fee, d.actual_views, d.live_at, d.paid_at, d.pay_status, k.payment_days FROM creator_deals d LEFT JOIN campaigns k ON k.id=d.campaign_id");
  const creators = await q("SELECT skills, city, verified, owner_verified, created_at, source FROM creators WHERE status <> 'blacklisted'");
  const accounts = (await q("SELECT COUNT(*) n FROM creator_accounts"))[0]?.n ?? 0;

  const ms = (s) => { s = String(s); return Date.parse(s.replace(" ", "T") + (s.includes("Z") || s.includes("+") ? "" : "Z")); };
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

  // time to first application + 72h fill
  const byCamp = new Map();
  for (const a of apps) { if (!byCamp.has(a.campaign_id)) byCamp.set(a.campaign_id, []); byCamp.get(a.campaign_id).push(a); }
  const live = camps.filter((k) => k.status !== "pending");
  const firstHrs = [];
  let filled72 = 0;
  for (const k of live) {
    const list_ = (byCamp.get(k.id) ?? []).sort((x, y) => ms(x.created_at) - ms(y.created_at));
    if (list_.length) firstHrs.push((ms(list_[0].created_at) - ms(k.created_at)) / 36e5);
    const need = k.creators_needed || 1;
    const within = list_.filter((a) => ms(a.created_at) - ms(k.created_at) < 72 * 36e5).length;
    if (within >= need) filled72++;
  }
  // payouts
  const paid = deals.filter((d) => d.paid_at && d.live_at);
  const payDays = paid.map((d) => (ms(d.paid_at) - ms(d.live_at)) / 864e5);
  const onTime = paid.filter((d) => (ms(d.paid_at) - ms(d.live_at)) / 864e5 <= (d.payment_days ?? 30)).length;
  const overdue = deals.filter((d) => d.live_at && !d.paid_at && (Date.now() - ms(d.live_at)) / 864e5 > (d.payment_days ?? 30)).length;
  // CPV vs promise
  const cpvRows = camps.filter((k) => k.promised_cpv).map((k) => {
    const ds = deals.filter((d) => d.campaign_id === k.id && d.actual_views && d.fee);
    const fee = ds.reduce((s, d) => s + d.fee, 0), v = ds.reduce((s, d) => s + d.actual_views, 0);
    return { title: k.title, promised: Number(k.promised_cpv), actual: v ? fee / v : null };
  }).filter((r) => r.actual != null);
  // repeat brands
  const brandCount = new Map();
  for (const k of camps) { const b = (k.client_company || k.brand || "").trim().toLowerCase(); if (b) brandCount.set(b, (brandCount.get(b) ?? 0) + 1); }
  const repeat = [...brandCount.values()].filter((n) => n > 1).length;
  // supply vs demand by talent
  const demand = new Map(), supply = new Map();
  for (const k of camps.filter((x) => x.status === "open" || x.status === "pending")) for (const t of list(k.talent_types)) demand.set(t, (demand.get(t) ?? 0) + 1);
  for (const c of creators) for (const t of list(c.skills)) supply.set(t, (supply.get(t) ?? 0) + 1);
  const gaps = [...new Set([...demand.keys(), ...supply.keys()])].map((t) => ({ t, d: demand.get(t) ?? 0, s: supply.get(t) ?? 0 })).sort((a, b) => b.d - a.d || a.s - b.s).slice(0, 14)
    .map((g) => ({ ...g, ...(g.d > 0 && g.s < g.d * 10 ? { tone: "low", label: "Recruit" } : g.d === 0 && g.s > 20 ? { tone: "ok", label: "Find briefs" } : { tone: "good", label: "OK" }) }));
  const cityCount = new Map();
  for (const c of creators) if (c.city) cityCount.set(c.city, (cityCount.get(c.city) ?? 0) + 1);
  const cities = [...cityCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  // funnel
  const verified = creators.filter((c) => c.verified || c.owner_verified).length;
  const applied = new Set(apps.map((a) => a.campaign_id + a.created_at)).size;
  const selected = apps.filter((a) => ["shortlisted", "accepted"].includes(a.status)).length;
  const paidCount = deals.filter((d) => d.pay_status === "paid").length;
  const gmv = deals.filter((d) => ["funded", "released", "paid"].includes(d.pay_status)).reduce((s, d) => s + (d.fee || 0), 0);
  const fmt = (n, suf = "") => (n == null ? "—" : (Math.round(n * 10) / 10) + suf);

  return (
    <TeamShell active="insights" eyebrow="Creator tools" title="Is the marketplace <b>working</b>?" email={me.email}>
      <p className="lead">The numbers that decide whether brands come back and creators stay: how fast briefs fill, how fast creators get paid, and whether we hit the cost per view we promised.</p>

      <div className="grid4">
        <div className="panel kpi"><div className="k">Briefs filled in 72h</div><div className="v">{fmt(pct(filled72, live.length), "%")}</div><div className="s">{filled72} of {live.length} live briefs · target 70%</div></div>
        <div className="panel kpi"><div className="k">First application</div><div className="v">{fmt(median(firstHrs), "h")}</div><div className="s">median after a brief goes live</div></div>
        <div className="panel kpi"><div className="k">Days to pay</div><div className="v">{fmt(median(payDays), "d")}</div><div className="s">median, live → paid · target ≤7</div></div>
        <div className="panel kpi"><div className="k">Paid on time</div><div className="v">{fmt(pct(onTime, paid.length), "%")}</div><div className="s">{overdue ? overdue + " payouts overdue now" : "none overdue"}</div></div>
        <div className="panel kpi"><div className="k">Funded deal value</div><div className="v">{inr(gmv)}</div><div className="s">creator fees funded or paid</div></div>
        <div className="panel kpi"><div className="k">Repeat brands</div><div className="v">{repeat}</div><div className="s">of {brandCount.size} brands with 2+ briefs</div></div>
        <div className="panel kpi"><div className="k">Creators</div><div className="v">{creators.length}</div><div className="s">{accounts} with a login · {fmt(pct(verified, creators.length), "%")} verified</div></div>
        <div className="panel kpi"><div className="k">Creator funnel</div><div className="v" style={{ fontSize: 20 }}>{applied} → {selected} → {paidCount}</div><div className="s">applications → selected → paid</div></div>
      </div>

      <div className="grid2 sec" style={{ alignItems: "start" }}>
        <div className="panel">
          <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Supply vs demand by talent</h2></div>
          {gaps.length ? <table className="tbl"><thead><tr><th>Talent</th><th className="num">Open briefs</th><th className="num">Creators</th><th></th></tr></thead><tbody>
            {gaps.map((g) => <tr key={g.t}><td>{g.t}</td><td className="num">{g.d}</td><td className="num">{g.s}</td><td><span className={`pill ${g.tone}`}>{g.label}</span></td></tr>)}
          </tbody></table> : <p className="hint" style={{ padding: "0 20px 18px" }}>Fills in as briefs and creators come in.</p>}
          <p className="hint" style={{ padding: "0 20px 18px" }}>"Recruit" means fewer than 10 creators per open brief for that talent. Run a comment-to-DM reel or invite that community.</p>
        </div>
        <div className="stack">
          <div className="panel">
            <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>CPV delivered vs promised</h2></div>
            {cpvRows.length ? <table className="tbl"><tbody>{cpvRows.map((r, i) => <tr key={i}><td>{r.title}</td><td className="num">₹{r.actual.toFixed(2)} vs ₹{r.promised.toFixed(2)}</td><td><span className={`pill ${r.actual > r.promised ? "low" : "good"}`}>{r.actual > r.promised ? "Make good" : "Hit"}</span></td></tr>)}</tbody></table>
              : <p className="hint" style={{ padding: "0 20px 18px" }}>Set a promised CPV on a campaign and add real views to its deals.</p>}
          </div>
          <div className="panel">
            <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Creators by city</h2></div>
            {cities.length ? <table className="tbl"><tbody>{cities.map(([c, n]) => <tr key={c}><td>{c}</td><td className="num">{n}</td></tr>)}</tbody></table> : <p className="hint" style={{ padding: "0 20px 18px" }}>No creators yet.</p>}
          </div>
        </div>
      </div>
    </TeamShell>
  );
}
