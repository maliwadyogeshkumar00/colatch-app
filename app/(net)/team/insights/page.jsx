import TeamShell from "../../_ui/TeamShell";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { inr } from "@/lib/net/creators";
import { list } from "@/lib/net/match";
import { inrKpi, inrFull } from "@/components/team/labels";
import { PageHeader, KpiStrip, ChartCard, DataTable, Grid, Section, AsideCard, EmptyState, Pill, Cell, Figure } from "@/components/ui";
import { Funnel, HBars, DefList } from "@/components/admin/Charts";

export const metadata = { title: "Marketplace health", robots: { index: false, follow: false } };

export default async function Page() {
  const me = await requireTeam();
  const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results ?? [];
  const camps = await q("SELECT id, title, talent_types, city, status, created_at, creators_needed, promised_cpv, brand, client_company, source FROM campaigns WHERE status <> 'rejected'");
  const apps = await q("SELECT id, campaign_id, created_at, status FROM campaign_applications");
  const deals = await q("SELECT d.id, d.application_id, d.campaign_id, d.fee, d.actual_views, d.live_at, d.paid_at, d.pay_status, k.payment_days FROM creator_deals d LEFT JOIN campaigns k ON k.id=d.campaign_id");
  const creators = await q("SELECT skills, city, verified, owner_verified, created_at, source FROM creators WHERE status <> 'blacklisted'");
  // Deals with a brand payment in the ledger: the rule Money and ledger reconciles against.
  const fundedIds = new Set((await q("SELECT DISTINCT deal_id FROM finance_ledger WHERE kind='brand_payment_received' AND deal_id IS NOT NULL")).map((r) => r.deal_id));
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
  // Open and waiting briefs per city (a brief can name several cities), beside the creators who live there.
  const cityDemand = new Map();
  for (const k of camps.filter((x) => x.status === "open" || x.status === "pending")) for (const c of list(k.city)) cityDemand.set(c, (cityDemand.get(c) ?? 0) + 1);
  const cityRows = [...new Set([...cityDemand.keys(), ...cities.map(([c]) => c)])].map((c) => ({ label: c, a: cityDemand.get(c) ?? 0, b: cityCount.get(c) ?? 0 }))
    .sort((x, y) => y.a - x.a || y.b - x.b).slice(0, 8);
  // funnel
  const verified = creators.filter((c) => c.verified || c.owner_verified).length;
  // One population for every stage: applications. Selected and paid are subsets of it, so the funnel can't grow.
  const SELECTED = ["shortlisted", "accepted"];
  const paidApps = new Set(deals.filter((d) => d.pay_status === "paid" && d.application_id).map((d) => d.application_id));
  const applied = apps.length;
  const selected = apps.filter((a) => SELECTED.includes(a.status)).length;
  const paidCount = apps.filter((a) => SELECTED.includes(a.status) && paidApps.has(a.id)).length;
  const fundedDeals = deals.filter((d) => ["funded", "released", "paid"].includes(d.pay_status) && fundedIds.has(d.id));
  const gmv = fundedDeals.reduce((s, d) => s + (d.fee || 0), 0);
  const fmt = (n, suf = "") => (n == null ? "—" : (Math.round(n * 10) / 10) + suf);

  const GAP_TONE = { low: "mine", ok: "wait", good: "done" };
  const conv = pct(paidCount, applied);
  const plural = (n, one, many) => `${Number(n || 0).toLocaleString("en-IN")} ${Number(n) === 1 ? one : many}`;

  return (
    <TeamShell active="insights" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator tools" }, { label: "Marketplace health" }]}
        eyebrow="Creator tools · Marketplace health"
        title="Is the marketplace <b>working</b>?"
        sub="The numbers that decide whether brands come back and creators stay: how fast briefs fill, how fast creators get paid, and whether we hit the cost per view we promised."
        meta={[{ label: "Funded deal value", value: inrKpi(gmv), title: inrFull(gmv), gold: true }, { label: "Creators", value: creators.length }]}
      />

      <KpiStrip label="Marketplace health" items={[
        { featured: true, label: "Briefs filled in 72h", value: fmt(pct(filled72, live.length), "%"), foot: `${filled72} of ${live.length} live briefs · target 70%`, href: "/team/campaigns?tab=open" },
        { label: "First application", value: fmt(median(firstHrs), "h"), foot: "median after a brief goes live" },
        { label: "Days to pay", value: fmt(median(payDays), "d"), foot: "median, live → paid · target ≤7" },
        { label: "Paid on time", value: fmt(pct(onTime, paid.length), "%"), foot: overdue ? `${overdue} payouts overdue now` : "none overdue", href: overdue ? "/team/crm" : undefined },
      ]} />

      <Grid cols={2}>
        <ChartCard level={2} title="Creator funnel" period="All applications" figure={conv == null ? "—" : `${conv}%`} figureTitle="Applications that ended in a paid deal"
          foot="One population: applications. Selected and paid are subsets of it, so the funnel can't grow.">
          {applied ? <Funnel label="Applications to selected to paid" steps={[
            { label: "Applied", n: applied, note: "every application to a brief", href: "/team/campaigns" },
            { label: "Selected", n: selected, note: "shortlisted or accepted" },
            { label: "Paid", n: paidCount, note: "creator payout recorded" },
          ]} /> : <EmptyState title="No applications yet." body="The funnel fills in once creators apply to an open brief." action={<a className="btn sm" href="/team/campaigns">Open campaigns</a>} />}
        </ChartCard>
        <ChartCard level={2} title="Supply vs demand by talent" period="Open and waiting briefs"
          foot={<>"Recruit" means fewer than 10 creators per open brief for that talent. Run a comment-to-DM reel or invite that community.</>}>
          {gaps.length ? <HBars label="Open briefs and creators by talent" aLabel="Open briefs" bLabel="Creators"
            rows={gaps.slice(0, 8).map((g) => ({ label: g.t, a: g.d, b: g.s, tag: <Pill tone={GAP_TONE[g.tone] || "quiet"}>{g.label}</Pill> }))} />
            : <EmptyState title="Nothing to compare yet." body="Fills in as briefs and creators come in." />}
        </ChartCard>
      </Grid>

      <Grid aside={<>
        <AsideCard eyebrow="Brands and creators" title="Who keeps coming back">
          <DefList items={[
            { label: "Funded deal value", value: <span title={inrFull(gmv)}><b>{inrKpi(gmv)}</b> · creator fees on {plural(fundedDeals.length, "deal", "deals")} with a brand payment in the ledger</span> },
            { label: "Repeat brands", value: <><b>{repeat}</b> of {plural(brandCount.size, "brand", "brands")} with 2+ briefs</> },
            { label: "Creators", value: <><b>{creators.length}</b> · {accounts} with a login · {fmt(pct(verified, creators.length), "%")} verified</> },
            { label: "Funnel", value: <>{applied} → {selected} → {paidCount}<br /><span className="adm-dim">applications → selected → paid</span></> },
          ]} />
        </AsideCard>
        <AsideCard eyebrow="Method" title="Where these numbers come from">
          <p className="small" style={{ margin: 0 }}>Every figure is worked out on this page from campaigns, applications, deals and the money ledger. Funded value counts only deals with a brand payment recorded in the ledger, the same rule Money and ledger reconciles against.</p>
        </AsideCard>
      </>}>
        <Section title="Briefs and creators by city" sub="Open and waiting briefs that name a city, beside the creators based there.">
          <ChartCard title="Demand vs supply by city" period={`${cityCount.size} cities with creators`}>
            {cityRows.length ? <HBars label="Open briefs and creators by city" aLabel="Open briefs" bLabel="Creators" rows={cityRows} />
              : <EmptyState title="No cities yet." body="Creators add their city when they join." />}
          </ChartCard>
        </Section>
        <Section title="CPV delivered vs promised" sub="Campaigns with a promised cost per view and real views on their deals.">
          <DataTable caption="CPV delivered vs promised" rows={cpvRows} rowKey={(r, i) => r.title + i} columns={[
            { key: "title", label: "Campaign", render: (r) => <Cell title={r.title} /> },
            { key: "res", label: "Result", primary: true, render: (r) => <Pill tone={r.actual > r.promised ? "mine" : "done"}>{r.actual > r.promised ? "Missed promise" : "Hit"}</Pill> },
            { key: "actual", label: "Delivered", num: true, render: (r) => <Figure value={`₹${r.actual.toFixed(2)}`} note="per view" /> },
            { key: "promised", label: "Promised", num: true, render: (r) => <Figure value={`₹${r.promised.toFixed(2)}`} note="per view" /> },
          ]} empty={{ title: "No CPV to compare yet.", body: "Set a promised CPV on a campaign and add real views to its deals.", action: <a className="btn sm" href="/team/cpv">Open the CPV calculator</a> }} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
