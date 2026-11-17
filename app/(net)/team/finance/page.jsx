import TeamShell from "../../_ui/TeamShell";
import Flash from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { can } from "@/lib/net/security";
import { formatPaise } from "@/lib/net/dealflow";
import { reconcile, KIND_LABEL } from "./reconcile";
import { inrFull } from "@/components/team/labels";
import { inrShort } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, ChartCard, FilterBar, FilterChips, DataTable, Grid, Section, Card, AsideCard, EmptyState, Pill, Cell, Figure } from "@/components/ui";
import { DualBars, ShareBar, monthKeys, versus, StateMark, stamp } from "@/components/admin/Charts";

export const metadata = { title: "Money and ledger", robots: { index: false, follow: false } };

const when = (t) => stamp(t);
const tail = (u) => (u ? "…" + String(u).slice(-4) : "—");
const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : "");
const KIND_TONE = { brand_payment_received: "gold", creator_payout_sent: "done", brand_refund_sent: "off", referral_payout_sent: "plum", adjustment: "quiet" };
const OUT = ["creator_payout_sent", "brand_refund_sent", "referral_payout_sent"];
const plural = (n, one, many) => `${Number(n || 0).toLocaleString("en-IN")} ${Number(n) === 1 ? one : many}`;

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  // Money records are for finance roles only; everyone else gets an explanation, not the data.
  if (!can(me.role, "finance")) {
    return (
      <TeamShell active="finance" email={me.email} role={me.role}>
        <PageHeader crumbs={[{ label: "Money" }, { label: "Money and ledger" }]} eyebrow="Money" title="Money and <b>ledger</b>" />
        <EmptyState title="This page is for finance roles." body={`Your role (${me.role}) can't see payment records. Ask an owner or admin if you need access.`} action={<a className="btn sm" href="/team">Back to the overview</a>} />
      </TeamShell>
    );
  }
  const kind = KIND_LABEL[searchParams?.kind] ? String(searchParams.kind) : "";
  const from = day(searchParams?.from), to = day(searchParams?.to);
  const where = [], vals = [];
  if (kind) { where.push("l.kind = ?"); vals.push(kind); }
  if (from) { where.push("l.at >= ?::date"); vals.push(from); }
  if (to) { where.push("l.at < (?::date + 1)"); vals.push(to); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const rows = (await env.DB.prepare(
    `SELECT l.*, d.brand, c.name AS creator_name, c.handle FROM finance_ledger l
     LEFT JOIN creator_deals d ON d.id = l.deal_id LEFT JOIN creators c ON c.id = d.creator_id
     ${w} ORDER BY l.id DESC LIMIT 300`
  ).bind(...vals).all().catch(() => ({ results: [] }))).results ?? [];
  const totals = (await env.DB.prepare(`SELECT l.kind, COUNT(*) AS n, COALESCE(SUM(l.amount_paise),0) AS paise, COALESCE(SUM(l.tds_paise),0) AS tds FROM finance_ledger l ${w} GROUP BY l.kind`).bind(...vals).all().catch(() => ({ results: [] }))).results ?? [];
  const tot = Object.fromEntries(totals.map((t) => [t.kind, t]));
  const checks = await reconcile();
  const issues = checks.reduce((a, c) => a + c.rows.length, 0);
  const qs = new URLSearchParams({ ...(kind ? { kind } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();

  // Read-only: ledger totals per IST month and kind for the last 13 months (KPIs and the in/out chart).
  // Unfiltered on purpose: the strip and chart show the whole business, the table below follows the filter.
  const monthly = (await env.DB.prepare(
    `SELECT kind, to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS m, COALESCE(SUM(amount_paise),0) AS paise, COUNT(*) AS n
     FROM finance_ledger WHERE at >= now() - interval '13 months' GROUP BY kind, to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`
  ).all().catch(() => ({ results: [] }))).results ?? [];
  const now = Date.now();
  const months = monthKeys(now, 12);
  const rupees = (k, m) => monthly.filter((r) => r.kind === k && r.m === m).reduce((s, r) => s + Number(r.paise || 0), 0) / 100;
  const thisM = months[11].key, lastM = months[10].key;
  const series = months.map((mo) => ({ ...mo, a: rupees("brand_payment_received", mo.key), b: OUT.reduce((s, k) => s + rupees(k, mo.key), 0) }));
  const year = { in: series.reduce((s, m) => s + m.a, 0), out: series.reduce((s, m) => s + m.b, 0) };
  const kpi = (k, label, extra = {}) => {
    const cur = rupees(k, thisM), prev = rupees(k, lastM);
    return { label, value: inrShort(cur), title: inrFull(cur), trend: versus(cur, prev), foot: `${months[10].label}: ${inrShort(prev)}`, spark: months.slice(6).map((m) => rupees(k, m.key)), sparkLabel: `${label}, last 6 months`, ...extra };
  };

  const chipHref = (v) => "?" + new URLSearchParams({ ...(v ? { kind: v } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const filtered = Boolean(kind || from || to);
  const queueAll = checks.flatMap((c) => c.rows.map((r, i) => ({ ...r, _k: `${c.key}:${r.id}:${i}`, check: c })));
  const recAll = searchParams?.rec === "all";
  const queue = recAll ? queueAll : queueAll.slice(0, 10);
  const recHref = (all) => "?" + new URLSearchParams({ ...(kind ? { kind } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(all ? { rec: "all" } : {}) }).toString() + "#rec";

  return (
    <TeamShell active="finance" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Money" }, { label: "Money and ledger" }]}
        actions={<a className="btn plum" href={`/team/finance/export${qs ? "?" + qs : ""}`}>Download CSV</a>}
        eyebrow="Money · Ledger"
        title="Money and <b>ledger</b>"
        sub="Every rupee recorded by a finance member, newest first. Rows can't be edited or deleted; a mistake is corrected with a new adjustment row. Nothing here moves money."
        meta={[{ label: "To check", value: issues, gold: issues > 0 }, { label: "In · 12 months", value: inrShort(year.in), title: inrFull(year.in) }]}
      />
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>

      <KpiStrip label={`Money this month (${months[11].label} ${months[11].year}) against last month`} items={[
        kpi("brand_payment_received", "Brands paid Colatch", { featured: true }),
        kpi("creator_payout_sent", "Paid to creators"),
        kpi("brand_refund_sent", "Refunded to brands"),
        kpi("referral_payout_sent", "Referral payouts", { href: "/team/referrals" }),
      ]} />

      <Grid aside={
        <AsideCard eyebrow="Insight" title="Where brand money went" foot={<span className="small">Adjustments are left out of the chart; they are listed in the ledger.</span>}>
          {year.in + year.out > 0 ? (
            <ShareBar label="Brand money in, by where it went, last 12 months" fmt={inrShort} parts={[{ label: "Held or kept by Colatch", n: Math.max(0, year.in - year.out) }, ...OUT.map((k) => ({ label: KIND_LABEL[k], n: months.reduce((s, m) => s + rupees(k, m.key), 0) }))]} />
          ) : <p className="small" style={{ margin: 0 }}>Nothing recorded in the last 12 months yet.</p>}
          <p className="small">{year.in > 0 ? <>For every ₹100 brands paid in, <b>₹{Math.round((year.out / year.in) * 100)}</b> went back out to creators, brands or referrers.</> : year.out > 0 ? <>Money went out with no brand payment recorded this year. Check the reconciliation queue.</> : <>Brand payments and payouts show here once finance records them in a deal room.</>}</p>
        </AsideCard>
      }>
        <ChartCard level={2} title="Money in and out" period={`${months[0].label} ’${String(months[0].year).slice(2)} – ${months[11].label} ’${String(months[11].year).slice(2)}`}
          figure={inrShort(year.in - year.out)} figureTitle={`Net kept: ${inrFull(year.in - year.out)}`}
          foot="In: brand payments received. Out: creator payouts, refunds to brands and referral payouts. From the ledger, by month in Indian time.">
          <DualBars months={series} aLabel="In from brands" bLabel="Out to creators, brands, referrers" fmt={inrShort} label="Money in and out per month" />
        </ChartCard>
      </Grid>

      <Grid aside={
        <AsideCard eyebrow="Reconciliation" title="Five checks, every load" foot={<span className="small">Deals recorded before the ledger was switched on can appear above; add a note in the deal room explaining them.</span>}>
          <ul className="adm-checks">
            {checks.map((c) => (
              <li key={c.key}>
                <StateMark state={c.rows.length ? "warn" : "ok"} />
                <div><b>{c.title}</b><span>{c.help}</span></div>
                <Pill tone={c.rows.length ? "mine" : "done"}>{c.rows.length ? `${c.rows.length} to check` : "OK"}</Pill>
              </li>
            ))}
          </ul>
        </AsideCard>
      }>
        <Section id="rec" title="Reconciliation" sub={issues ? `${plural(issues, "deal", "deals")} where the deal and the ledger disagree. Open each deal, check the bank, then record the missing row or add a note.` : "Deals and the ledger agree. Nothing to check."}>
          <DataTable caption="Reconciliation queue" rows={queue} rowKey={(r) => r._k} rowHref={(r) => (r.check.key === "orphan_ledger" ? null : `/team/deals/${encodeURIComponent(r.id)}`)} columns={[
            { key: "deal", label: "Deal", render: (r) => <Cell eyebrow={r.check.title} title={r.brand || r.id} sub={r.check.key === "orphan_ledger" ? `Deal id ${r.id} is not in the system` : null} /> },
            { key: "status", label: "Pay status", primary: true, render: (r) => (r.pay_status ? <Pill tone="mine">{String(r.pay_status).replace(/_/g, " ")}</Pill> : null) },
            { key: "fee", label: "Fee", num: true, render: (r) => (r.fee ? <Figure value={`₹${Number(r.fee).toLocaleString("en-IN")}`} /> : null) },
            { key: "utr", label: "Reference", num: true, render: (r) => (r.utr ? `UTR ${tail(r.utr)}` : null) },
          ]} empty={{ title: "All clear.", body: "Every paid or funded deal has its ledger row, and every ledger row points at a real deal." }} />
          {queueAll.length > 10 && <p className="small" style={{ marginTop: 12 }}>{recAll ? <a className="link" href={recHref(false)}>Show the first 10</a> : <>Showing 10 of {queueAll.length}. <a className="link" href={recHref(true)}>Show all {queueAll.length}</a></>}</p>}
        </Section>
      </Grid>

      <Grid aside={
        <AsideCard eyebrow={filtered ? "This filter" : "All time"} title="Totals by type">
          <ul className="adm-totals">
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <li key={k}>
                <span>{label}<small>{plural(tot[k]?.n || 0, "entry", "entries")}{Number(tot[k]?.tds) ? ` · TDS ${formatPaise(Number(tot[k].tds))}` : ""}</small></span>
                <b title={inrFull(Number(tot[k]?.paise || 0) / 100)}>{inrShort(Number(tot[k]?.paise || 0) / 100)}</b>
              </li>
            ))}
          </ul>
        </AsideCard>
      }>
        <Section id="ledger" title="Ledger" sub={rows.length ? `${plural(rows.length, "row", "rows")}${rows.length === 300 ? " (the latest 300)" : ""}${filtered ? " for this filter" : ""}, newest first` : filtered ? "No rows for this filter." : "Nothing recorded yet."}>
          <FilterBar label="Filter the ledger" end={
            <form className="adm-datefilter" method="get">
              {kind && <input type="hidden" name="kind" value={kind} />}
              <div className="fld"><label htmlFor="f-fin-from">From</label><input id="f-fin-from" name="from" type="date" defaultValue={from} /></div>
              <div className="fld"><label htmlFor="f-fin-to">To</label><input id="f-fin-to" name="to" type="date" defaultValue={to} /></div>
              <button className="btn plum">Filter</button>
              {filtered && <a className="btn sm" href="/team/finance#ledger">Clear</a>}
            </form>
          }>
            <FilterChips name="kind" label="Filter by type" current={kind} hrefFor={chipHref}
              options={[{ value: "", label: "All" }, ...Object.entries(KIND_LABEL).map(([k, l]) => ({ value: k, label: l }))]} />
          </FilterBar>
          <DataTable caption="Money ledger" rows={rows} rowHref={(l) => (l.deal_id ? `/team/deals/${encodeURIComponent(l.deal_id)}` : null)} columns={[
            { key: "deal", label: "Entry", render: (l) => <Cell eyebrow={when(l.at)} title={l.deal_id ? `${l.creator_name || l.handle || "Deal"}${l.brand ? ` × ${l.brand}` : ""}` : "No deal linked"} sub={<>{l.note ? <span>{String(l.note).slice(0, 90)}</span> : null}<span className="adm-dim">by {l.actor_id}</span></>} /> },
            { key: "kind", label: "Type", primary: true, render: (l) => <Pill tone={KIND_TONE[l.kind] || "quiet"}>{KIND_LABEL[l.kind] || l.kind}</Pill> },
            { key: "amount", label: "Amount", num: true, primary: true, render: (l) => <Figure value={`${l.kind === "brand_refund_sent" ? "− " : ""}${formatPaise(Number(l.amount_paise))}`} /> },
            { key: "tds", label: "TDS", num: true, render: (l) => (Number(l.tds_paise) ? formatPaise(Number(l.tds_paise)) : null) },
            { key: "ref", label: "Reference", render: (l) => <span className="adm-ref">{tail(l.utr)}{l.method ? <small>{l.method.replace(/_/g, " ")}</small> : null}</span> },
          ]} empty={{ title: `No money recorded${filtered ? " for this filter" : " yet"}.`, body: "Rows appear when finance records a brand payment or a payout in a deal room.", action: filtered ? <a className="btn sm" href="/team/finance#ledger">Clear the filter</a> : <a className="btn sm" href="/team/crm">Open the deals</a> }} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
