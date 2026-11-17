import TeamShell from "../../_ui/TeamShell";
import Calc from "./Calc";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { RATE_GUIDE, inr } from "@/lib/net/creators";
import { PageHeader, KpiStrip, ChartCard, DataTable, Grid, Section, AsideCard, Split, Cell, Figure } from "@/components/ui";
import { compact } from "@/lib/net/creators";
import HBars from "@/components/team/HBars";

export const metadata = { title: "CPV calculator", robots: { index: false, follow: false } };

const TIER_ORDER = ["Nano", "Micro", "Mid", "Macro", "Mega"];

export default async function Page() {
  const me = await requireTeam();
  const bench = await env.DB.prepare(
    `SELECT c.tier, COUNT(*) n, SUM(d.fee) fee, SUM(d.actual_views) v FROM creator_deals d JOIN creators c ON c.id=d.creator_id
     WHERE d.actual_views > 0 AND d.fee > 0 GROUP BY c.tier`
  ).all().then((r) => r.results ?? []).catch(() => []);
  // Everything below comes from the rows above: no extra queries.
  const rows = bench.map((b) => ({ ...b, n: Number(b.n || 0), fee: Number(b.fee || 0), v: Number(b.v || 0) }))
    .sort((a, b) => (TIER_ORDER.indexOf(a.tier) + 1 || 99) - (TIER_ORDER.indexOf(b.tier) + 1 || 99));
  const deals = rows.reduce((t, b) => t + b.n, 0);
  const fees = rows.reduce((t, b) => t + b.fee, 0);
  const views = rows.reduce((t, b) => t + b.v, 0);
  const cpv = views ? fees / views : null;
  const best = rows.length ? rows.reduce((a, b) => (b.fee / b.v < a.fee / a.v ? b : a)) : null;
  const rs2 = (n) => `₹${n.toFixed(2)}`;
  // Read-only: the measured deals one by one (for the value bands), and live deals still missing real views (the queue).
  const measured = await env.DB.prepare("SELECT fee, actual_views FROM creator_deals WHERE actual_views > 0 AND fee > 0").all().then((r) => r.results ?? []).catch(() => []);
  const band = { great: 0, fair: 0, high: 0 };
  for (const m of measured) { const x = Number(m.fee) / Number(m.actual_views); band[x <= 0.25 ? "great" : x <= 0.6 ? "fair" : "high"]++; }
  const missing = await env.DB.prepare(
    `SELECT d.id, d.brand, d.deliverable, d.fee, d.expected_views, d.live_at, c.name, c.handle FROM creator_deals d JOIN creators c ON c.id=d.creator_id
     WHERE d.live_at IS NOT NULL AND COALESCE(d.actual_views, 0) = 0 AND d.stage NOT IN ('cancelled','dropped') ORDER BY d.live_at ASC LIMIT 8`
  ).all().then((r) => r.results ?? []).catch(() => []);

  return (
    <TeamShell active="cpv" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator tools" }, { label: "CPV calculator" }]}
        actions={<a className="btn sm" href="#calc">Compare creators ↓</a>}
        eyebrow="Creator tools · Pricing"
        title="What does a <b>view</b> cost?"
        sub="Put in a creator's fee and their typical reel views, or compare up to three creators side by side. CPV means cost per view; CPM means cost per thousand views. Lower is better."
      />

      <KpiStrip label="Colatch's real cost per view" items={[
        { label: "Finished deals measured", value: deals, foot: "with a fee and real views" },
        cpv != null ? { featured: true, label: "Colatch CPV", value: rs2(cpv), foot: "creator fees ÷ real views, all tiers" } : { label: "Colatch CPV", empty: "No real views yet", foot: "fills in as deals report views" },
        cpv != null ? { label: "Colatch CPM", value: inr(cpv * 1000), foot: "per thousand views" } : { label: "Waiting for views", value: missing.length, foot: "live deals with no real views yet", href: "#measure" },
        best ? { label: "Cheapest tier", value: best.tier || "Not set", foot: `${rs2(best.fee / best.v)} per view on ${best.n} ${best.n === 1 ? "deal" : "deals"}` } : { label: "Cheapest tier", empty: "Needs finished deals", foot: "one tier per creator size" },
      ]} />

      <Grid aside={<>
        <AsideCard eyebrow="Insight" title={measured.length ? `${measured.length} measured <b>${measured.length === 1 ? "deal" : "deals"}</b>` : "Value bands"}>
          {measured.length ? <Split label="Measured deals by value band" parts={[{ label: "Great (≤ ₹0.25)", n: band.great }, { label: "Fair (≤ ₹0.60)", n: band.fair }, { label: "Expensive", n: band.high }]} />
            : <p className="small">No deal has real views yet. Each one you measure lands in a band here.</p>}
        </AsideCard>
        <AsideCard tone="night" eyebrow="Method" title="How to read CPV">
          <p className="small">CPV is the creator fee divided by views. Under ₹0.25 a view is great value, up to ₹0.60 is fair, above that the reach is expensive for the fee.</p>
          <p className="small">Colatch's own numbers come from finished deals where the team added real views on the deal or in the CRM.</p>
        </AsideCard>
      </>}>
        <Grid cols={2}>
          <ChartCard title="Colatch's real CPV, from finished deals" period="By tier" figure={cpv != null ? rs2(cpv) : null}
            foot={rows.length ? "Shorter is cheaper. Gold marks the cheapest tier." : "No finished deals with real views yet. Add actual views on live deals in the CRM and this fills in."}>
            {rows.length ? <HBars label="Average cost per view by creator tier" best={best?.tier || "none"}
              rows={rows.map((b) => ({ key: b.tier || "none", label: b.tier || "—", value: b.fee / b.v, text: rs2(b.fee / b.v), note: `${b.n} ${b.n === 1 ? "deal" : "deals"} · CPM ${inr((b.fee / b.v) * 1000)}` }))} />
              : <p className="hint" style={{ margin: 0 }}>Nothing measured yet.</p>}
          </ChartCard>
          <ChartCard title="Reel rate guide (India)" period="Market ranges" foot="Market ranges for planning. Your own numbers get better with every finished deal.">
            <HBars label="Top of the typical fee per reel by tier" rows={TIER_ORDER.map((t) => ({ key: t, label: t, value: RATE_GUIDE[t][1], text: `${inr(RATE_GUIDE[t][0])} – ${inr(RATE_GUIDE[t][1])}` }))} />
          </ChartCard>
        </Grid>
        <Section id="measure" title={missing.length ? `Add real views <b>${missing.length}${missing.length === 8 ? "+" : ""}</b>` : "Add real views"} sub="Live deals with no real views yet. Each one you fill in sharpens Colatch's CPV.">
          <DataTable caption="Live deals without real views" rows={missing} rowHref={(d) => `/team/deals/${d.id}#results`}
            columns={[
              { key: "who", label: "Deal", render: (d) => <Cell eyebrow={d.brand || "Brand"} title={d.name || d.handle} sub={d.deliverable || null} /> },
              { key: "fee", label: "Fee", num: true, render: (d) => (d.fee ? <Figure value={inr(d.fee)} /> : null) },
              { key: "exp", label: "Expected", num: true, render: (d) => (d.expected_views ? <Figure value={compact(d.expected_views)} note={d.fee ? `${rs2(d.fee / d.expected_views)} planned` : null} /> : null) },
              { key: "go", label: "Next", primary: true, render: () => <span className="hint">Add views →</span> },
            ]}
            empty={{ title: "Every live deal has real views.", body: "New live posts land here until someone adds the view count.", action: <a className="btn sm" href="/team/crm">Open the CRM</a> }} />
        </Section>
        <Section id="guide" title="Rate guide in full" level={2}>
          <DataTable caption="Reel rate guide" rows={[["Nano", "1K–10K"], ["Micro", "10K–1L"], ["Mid", "1L–5L"], ["Macro", "5L–10L"], ["Mega", "10L+"]].map(([t, f]) => ({ id: t, t, f }))}
            columns={[
              { key: "t", label: "Tier" },
              { key: "f", label: "Followers" },
              { key: "fee", label: "Typical fee per reel", num: true, primary: true, render: (r) => `${inr(RATE_GUIDE[r.t][0])} – ${inr(RATE_GUIDE[r.t][1])}` },
              { key: "real", label: "Colatch CPV", num: true, render: (r) => { const b = rows.find((x) => x.tier === r.t); return b ? rs2(b.fee / b.v) : "—"; } },
            ]} />
        </Section>
      </Grid>

      <Section id="calc" title="Compare creators" sub="Nothing here is saved. Use it on a call with a brand, or to sanity-check a quote.">
        <Calc />
      </Section>

    </TeamShell>
  );
}
