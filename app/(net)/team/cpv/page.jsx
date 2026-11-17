import TeamShell from "../../_ui/TeamShell";
import Calc from "./Calc";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { RATE_GUIDE, inr } from "@/lib/net/creators";
import { PageHeader, KpiStrip, ChartCard, DataTable, Grid, Section, AsideCard } from "@/components/ui";
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

  return (
    <TeamShell active="cpv" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator tools" }, { label: "CPV calculator" }]}
        eyebrow="Creator tools · Pricing"
        title="What does a <b>view</b> cost?"
        sub="Put in a creator's fee and their typical reel views, or compare up to three creators side by side. CPV means cost per view; CPM means cost per thousand views. Lower is better."
      />

      <KpiStrip label="Colatch's real cost per view" items={[
        { label: "Finished deals measured", value: deals, foot: "with a fee and real views" },
        { featured: true, label: "Colatch CPV", value: cpv != null ? rs2(cpv) : "—", foot: cpv != null ? "creator fees ÷ real views, all tiers" : "fills in as deals report views" },
        { label: "Colatch CPM", value: cpv != null ? inr(cpv * 1000) : "—", foot: "per thousand views" },
        { label: "Cheapest tier", value: best ? best.tier || "—" : "—", foot: best ? `${rs2(best.fee / best.v)} per view on ${best.n} ${best.n === 1 ? "deal" : "deals"}` : "needs finished deals" },
      ]} />

      <Section id="calc" title="Compare creators" sub="Nothing here is saved. Use it on a call with a brand, or to sanity-check a quote.">
        <Calc />
      </Section>

      <Grid aside={
        <AsideCard eyebrow="Method" title="How to read CPV">
          <p className="small">CPV is the creator fee divided by views. Under ₹0.25 a view is great value, up to ₹0.60 is fair, above that the reach is expensive for the fee.</p>
          <p className="small">Colatch's own numbers come from finished deals where the team added real views on the deal or in the CRM.</p>
        </AsideCard>
      }>
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
    </TeamShell>
  );
}
