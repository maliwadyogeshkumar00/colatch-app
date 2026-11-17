import { redirect } from "next/navigation";
import { ClaimNote } from "@/app/(net)/join/_claim.js";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { inr } from "@/lib/net/creators";
import { REJECT_REASONS } from "@/lib/net/campaign";
import { dealState, dayText, APP_LABEL } from "../../_ui/dealState";
import { PageHeader, KpiStrip, Grid, Section, Card, AsideCard, Split, FilterBar, FilterChips, DataTable, Cell, Figure } from "@/components/ui";
import { inrShort } from "@/lib/net/dashboard";

export const metadata = { title: "My deals", robots: { index: false } };

const label = APP_LABEL;
const dueText = (created) => {
  const due = new Date(Date.parse(String(created).replace(" ", "T") + "Z") + 3 * 864e5);
  return due.getTime() < Date.now() ? "Decision overdue" : "Decision by " + due.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default async function Page({ searchParams }) {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/applications");
  // A pending profile claim sees none of that creator's data, and writes nothing.
  if (me.claimPending) return <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator/applications"><ClaimNote status="pending" /></PublicShell>;
  const c = me.creator;
  const apps = (await env.DB.prepare(`SELECT a.status, a.created_at, a.match_score, a.reject_reason, k.title, k.slug, CASE WHEN a.status = 'accepted' THEN k.brand ELSE COALESCE(k.brand_category, 'Brand hidden until selected') END AS brand, k.status AS kstatus FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id WHERE a.creator_id=? OR a.handle=? ORDER BY a.created_at DESC`).bind(c.id, c.handle).all()).results ?? [];
  const deals = (await env.DB.prepare("SELECT d.id, CASE WHEN d.sow_accepted_at IS NOT NULL THEN d.brand ELSE 'Brand revealed after you accept' END AS brand, d.deliverable, d.fee, d.pay_status, d.draft_status, d.sow_accepted_at, d.live_at, d.post_url, d.stage FROM creator_deals d WHERE d.creator_id=? AND d.stage <> 'dropped' ORDER BY d.updated_at DESC").bind(c.id).all()).results ?? [];
  const STATUSES = ["new", "shortlisted", "accepted", "rejected", "withdrawn"];
  const status = STATUSES.includes(searchParams?.status) ? searchParams.status : "all";
  const count = (st) => apps.filter((a) => a.status === st).length;
  const rows = status === "all" ? apps : apps.filter((a) => a.status === status);
  const openDeals = deals.filter((d) => d.stage !== "cancelled" && d.pay_status !== "refunded" && d.pay_status !== "paid");
  const paidDeals = deals.filter((d) => d.pay_status === "paid");
  const toDo = openDeals.filter((d) => ["Accept terms", "Send draft", "Changes asked", "Post it"].includes(dealState(d)[0])).length;
  const decided = count("accepted") + count("rejected");
  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/applications">
      <div className="cr-page">
        <PageHeader crumbs={[{ label: "Home", href: "/creator" }, "My deals"]} eyebrow="My deals" title={`${apps.length} ${apps.length === 1 ? "application" : "applications"}, <b>${deals.length} ${deals.length === 1 ? "deal" : "deals"}.</b>`}
          sub="The team aims to decide within 3 days and gives a reason if it's a no. You can withdraw from the brief page until you're selected." />
        <KpiStrip label="Deals and applications" items={[
          { label: "Applied", value: apps.length, foot: `${count("new")} under review`, href: "?status=all#apps" },
          { label: "Selected", value: count("accepted"), foot: decided ? `${Math.round((count("accepted") / decided) * 100)}% of decided` : "No decisions yet", href: "?status=accepted#apps" },
          { label: "Open deals", value: openDeals.length, foot: toDo ? `${toDo} waiting on you` : "Nothing waiting on you" },
          { label: "Paid", value: paidDeals.length, foot: paidDeals.length ? `${inrShort(paidDeals.reduce((a, d) => a + Number(d.fee || 0), 0))} in fees` : "Your first payout shows here", href: "/creator/earnings" },
        ]} />

        <Grid aside={<>
          <Card tone="night" pad="lg">
            <p className="ui-aside__eb" style={{ color: "var(--gold-2)", margin: 0 }}>New · Idea board</p>
            <p style={{ fontSize: 17, margin: "8px 0 16px", lineHeight: 1.45 }}>Got a content idea a brand would love? Pitch it with your price and let brands book you.</p>
            <a className="btn-foil" href="/creator/pitch">Pitch an idea</a>
          </Card>
          {apps.length > 0 && <AsideCard eyebrow="Insight" title="Where your applications stand">
            <Split label="Applications by status" parts={STATUSES.map((st) => ({ label: label[st][0], n: count(st), href: `?status=${st}#apps` }))} />
          </AsideCard>}
        </>}>
          <Section id="deals" title="Deals" sub={deals.length ? "Newest activity first. Open one to see your next step." : null}>
            <DataTable caption="My deals" rows={deals} rowHref={(d) => `/creator/deals/${d.id}`} rowKey={(d) => d.id} columns={[
              { key: "deal", label: "Deal", render: (d) => <Cell eyebrow={d.brand} title={d.deliverable || "Deal"} /> },
              { key: "status", label: "Status", primary: true, render: (d) => { const [st, cls] = dealState(d); return <span className={`pill ${cls}`}>{st}</span>; } },
              { key: "fee", label: "Fee", num: true, primary: true, render: (d) => <Figure value={d.fee ? inr(d.fee) : "Product"} /> },
            ]} empty={{ title: "No deals yet.", body: "When a brand selects you, the deal and its terms show up here.", action: <a className="btn sm" href="/creator">See briefs that fit you</a> }} />
          </Section>

          <Section id="apps" title="Applications" sub={status === "all" ? "Every brief you applied to, newest first." : `Showing: ${label[status][0]}`}>
            {apps.length > 0 && <FilterBar label="Filter applications"><FilterChips name="status" current={status} hrefFor={(v) => `?status=${v}#apps`} options={[{ value: "all", label: "All", count: apps.length }, ...STATUSES.filter((st) => count(st)).map((st) => ({ value: st, label: label[st][0], count: count(st) }))]} /></FilterBar>}
            <DataTable caption="My applications" rows={rows} rowHref={(a) => `/creator/o/${a.slug}`} rowKey={(a, i) => a.slug + i} columns={[
              { key: "brief", label: "Brief", render: (a) => <Cell eyebrow={a.brand || "Brand confidential"} title={a.title} sub={a.kstatus === "closed" ? "Brief closed" : null} /> },
              { key: "status", label: "Status", primary: true, render: (a) => <>
                <span className={`pill ${label[a.status]?.[1] ?? ""}`}>{label[a.status]?.[0] ?? a.status}</span>
                {a.status === "new" && <div className="hint">{dueText(a.created_at)}</div>}
                {a.status === "rejected" && REJECT_REASONS[a.reject_reason] && <div className="hint" style={{ maxWidth: 280, marginTop: 4 }}><b>{REJECT_REASONS[a.reject_reason][0]}.</b> Tip: {REJECT_REASONS[a.reject_reason][1]}</div>}
              </> },
              { key: "applied", label: "Applied", render: (a) => <span style={{ whiteSpace: "nowrap" }}>{dayText(a.created_at)}</span> },
              { key: "match", label: "Match", num: true, render: (a) => a.match_score ?? "—" },
            ]} empty={apps.length ? { title: "Nothing with this status.", body: "Try another filter.", action: <a className="btn sm" href="?status=all#apps">Show all</a> } : { title: "No applications yet.", body: "Apply to a brief that fits you and it shows up here with its status.", action: <a className="btn sm" href="/creator">See the briefs that fit you →</a> }} />
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
