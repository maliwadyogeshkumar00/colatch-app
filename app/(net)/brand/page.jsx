import { redirect } from "next/navigation";
import PublicShell from "../_ui/PublicShell";
import Flash, { flashUrl } from "../_ui/flash";
import { MoveRow, AllClear } from "../_ui/Moves";
import { env } from "@/lib/net/env";
import { currentBrand } from "@/lib/net/creatorAuth";
import { nextMove, isMine } from "@/lib/net/moves";
import { formatPaise } from "@/lib/net/dealflow";
import { audit } from "@/lib/net/security";
import { overLimit, clientIp } from "../reset/_lib";
import { sendBrandVerify } from "./_lib";
import { dayText } from "../_ui/dealState";
import { inrShort, monthSeries } from "@/lib/net/dashboard";
import { inrFull, day } from "@/components/team/labels";
import { PageHeader, KpiStrip, ChartCard, Bars, Split, Grid, Section, AsideCard, DataTable, Cell, Figure, Pill } from "@/components/ui";
import { Facts } from "@/components/brand/Facts";

export const metadata = { title: "My campaigns", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS = { pending: "In review", rejected: "Not taken on", draft: "Draft", open: "Open", shortlisting: "Shortlisting", live: "Live", closed: "Closed", completed: "Completed", cancelled: "Cancelled" };
// Ledger times come back as Date (pg) or as text ("2026-11-14 05:00:00+00"); both become a Date here.
const when = (v) => (v instanceof Date ? v : new Date(String(v ?? "").replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")));
const LEDGER = { brand_payment_received: "Payment received", brand_refund_sent: "Refund sent" };

async function resend() {
  "use server";
  const me = await currentBrand();
  if (!me) redirect("/brand/login?next=/brand");
  if (me.verified) redirect(flashUrl("/brand", "ok", "Your email is already confirmed."));
  if ((await overLimit(`verify|brand:${me.id}`)) || (await overLimit(`verify|${clientIp()}`))) redirect(flashUrl("/brand", "err", "Too many requests. Try again in 15 minutes."));
  const status = await sendBrandVerify(me);
  await audit({ kind: "brand", id: me.id }, "brand.verify_requested", "brand_account", me.id, { email_status: status });
  redirect(flashUrl("/brand", status === "sent" ? "ok" : "err", status === "sent"
    ? `We sent a confirmation link to ${me.email}.`
    : "We couldn't send the email right now. Write to marketing@colatch.com from this address and the team will confirm it."));
}

export default async function Page({ searchParams }) {
  const me = await currentBrand();
  if (!me) redirect("/brand/login?next=/brand");

  // Only this account's campaigns. Nothing here is looked up by email or by brand name.
  const campaigns = (await env.DB.prepare(
    "SELECT id, title, brand, status, share_token, deadline, created_at FROM campaigns WHERE brand_account_id=? ORDER BY created_at DESC LIMIT 200"
  ).bind(me.id).all()).results ?? [];
  const ids = campaigns.map((k) => k.id);
  const byId = Object.fromEntries(campaigns.map((k) => [k.id, k]));
  const marks = ids.map(() => "?").join(",");

  let apps = [], deals = [], ledger = [];
  if (ids.length) {
    deals = (await env.DB.prepare(
      `SELECT d.*, c.name AS cname, c.handle AS chandle FROM creator_deals d LEFT JOIN creators c ON c.id=d.creator_id
       WHERE d.campaign_id IN (${marks}) AND d.stage NOT IN ('cancelled','dropped') ORDER BY d.updated_at DESC`
    ).bind(...ids).all()).results ?? [];
    const booked = new Set(deals.map((d) => d.application_id).filter(Boolean));
    const bookedCreator = new Set(deals.map((d) => `${d.campaign_id}|${d.creator_id}`));
    apps = ((await env.DB.prepare(
      `SELECT id, campaign_id, creator_id, name, handle FROM campaign_applications
       WHERE campaign_id IN (${marks}) AND status IN ('shortlisted','accepted') AND client_decision IS NULL`
    ).bind(...ids).all()).results ?? []).filter((a) => !booked.has(a.id) && !bookedCreator.has(`${a.campaign_id}|${a.creator_id}`));
    ledger = (await env.DB.prepare(
      `SELECT at, kind, campaign_id, amount_paise, utr FROM finance_ledger
       WHERE campaign_id IN (${marks}) AND kind IN ('brand_payment_received','brand_refund_sent') ORDER BY at DESC LIMIT 50`
    ).bind(...ids).all()).results ?? [];
  }

  // Your move: creators to approve (one row per campaign) and anything the deal machine says is the brand's step.
  const decide = Object.entries(apps.reduce((m, a) => ((m[a.campaign_id] = (m[a.campaign_id] || 0) + 1), m), {}));
  const moves = deals.map((d) => ({ d, m: nextMove(d) })).filter((x) => x.m);
  const mine = moves.filter((x) => isMine(x.m, "brand"));
  const waiting = moves.filter((x) => !isMine(x.m, "brand"));
  const link = (cid) => byId[cid]?.share_token ? `/shortlist/${byId[cid].share_token}` : null;
  const mineCount = decide.length + mine.length;

  // KPI row, from the rows already loaded: only deals the brand has paid for count as booked or committed,
  // the same rule as the campaign receipt. Saved = each creator's market rate minus the fee agreed, never below zero.
  const paidFor = deals.filter((d) => ["funded", "released", "paid"].includes(d.pay_status));
  const kpi = {
    live: campaigns.filter((k) => ["open", "shortlisting", "live"].includes(k.status)).length,
    booked: new Set(paidFor.map((d) => d.creator_id)).size,
    spend: paidFor.reduce((a, d) => a + (Number(d.fee) || 0), 0),
    saved: paidFor.reduce((a, d) => a + Math.max(0, (Number(d.market_rate) || 0) - (Number(d.fee) || 0)), 0),
  };

  // Read-only: payments recorded per month for this account's campaigns (12 IST months). A failure only hides the chart.
  const now = Date.now();
  const payRows = ids.length ? ((await env.DB.prepare(
    `SELECT at, amount_paise FROM finance_ledger WHERE campaign_id IN (${marks}) AND kind='brand_payment_received' AND at >= now() - interval '13 months'`
  ).bind(...ids).all().catch(() => ({ results: [] }))).results ?? []) : [];
  const pay = monthSeries(payRows.map((r) => ({ at: isNaN(when(r.at)) ? r.at : when(r.at).toISOString(), amount: Number(r.amount_paise || 0) / 100 })), now, 12);
  const byStatus = (list) => campaigns.filter((k) => list.includes(k.status)).length;
  const statusParts = [
    { label: "Briefing", n: byStatus(["draft", "pending", "shortlisting"]) },
    { label: "Open", n: byStatus(["open"]) },
    { label: "Live", n: byStatus(["live"]) },
    { label: "Done", n: byStatus(["closed", "completed", "cancelled", "rejected"]) },
  ];
  const perCamp = (cid) => ({ decide: apps.filter((a) => a.campaign_id === cid).length, booked: deals.filter((d) => d.campaign_id === cid).length });
  const TONE = { open: "done", live: "plum", shortlisting: "wait", draft: "wait", pending: "wait", closed: "off", completed: "off", cancelled: "off" };
  const name = String(me.name || "there").replace(/[<>&"]/g, "");
  const hour = Number(new Date(now).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date(now).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short", year: "numeric" });

  const hero = (
    <PageHeader variant="hero" eyebrow={`${me.company || "Your brand"} · ${today}`}
      title={`${hello}, ${name}. <b>Here's what needs you.</b>`}
      sub={mineCount ? `${mineCount} ${mineCount === 1 ? "thing is" : "things are"} waiting on you. Approve creators, review drafts and see every payment you've made, across all your campaigns.` : "Approve creators, review drafts and see every payment you've made, across all your campaigns."}
      meta={[
        { label: "Waiting on you", value: mineCount },
        { label: "Waiting on others", value: waiting.length },
      ]} />
  );

  const campColumns = [
    { key: "title", label: "Campaign", render: (k) => <Cell eyebrow={k.brand || undefined} title={k.title || k.brand} sub={k.created_at ? `Sent ${day(k.created_at)}` : undefined} /> },
    { key: "status", label: "Status", primary: true, render: (k) => {
      const c = perCamp(k.id);
      return <span className="ui-pills"><Pill tone={TONE[k.status] || "quiet"}>{STATUS[k.status] || k.status}</Pill>{c.decide > 0 && <Pill tone="mine">{c.decide} to approve</Pill>}</span>;
    } },
    { key: "booked", label: "Booked", num: true, render: (k) => <Figure value={perCamp(k.id).booked} note="creators" /> },
    { key: "deadline", label: "Deadline", num: true, render: (k) => (k.deadline ? dayText(k.deadline) : "—") },
    { key: "links", label: "Links", labelHidden: true, render: (k) => (k.share_token ? <a className="link v2b-tap" href={`/receipt/${k.share_token}`}>Receipt</a> : null) },
  ];
  const ledgerColumns = [
    { key: "at", label: "Date", render: (r) => <Cell title={when(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} sub={LEDGER[r.kind]} /> },
    { key: "amount", label: "Amount", num: true, primary: true, render: (r) => <Figure value={`${r.kind === "brand_refund_sent" ? "−" : ""}${formatPaise(Number(r.amount_paise))}`} /> },
    { key: "campaign", label: "Campaign", render: (r) => byId[r.campaign_id]?.title || "—" },
    { key: "utr", label: "Bank ref", render: (r) => (r.utr ? `…${String(r.utr).slice(-4)}` : "—") },
  ];

  return (
    <PublicShell mode="client" brandName={me.name || me.email} path="/brand" hero={hero}>
      <div className="v2b">
        <div className="v2b-flash"><Flash sp={searchParams} /></div>
        {searchParams?.welcome && <div className="note good" style={{ marginBottom: 18 }}>Your account is ready.{searchParams?.mail === "off" ? " We couldn't send the confirmation email right now; use the button below to try again." : " Check your inbox for a link to confirm your email."}</div>}

        {!me.verified && (
          <form className="note info v2b-verify" action={resend}>
            <span>Confirm your email to see campaigns sent from <b>{me.email}</b>.</span>
            <button className="btn plum" style={{ minHeight: 44 }}>Send confirmation link</button>
          </form>
        )}

        <KpiStrip label="Your numbers" items={[
          { label: "Campaigns live", value: kpi.live, foot: `${campaigns.length} in all`, href: "#h-campaigns" },
          { label: "Creators booked", value: kpi.booked, foot: `${paidFor.length} paid ${paidFor.length === 1 ? "deal" : "deals"}` },
          { label: "Spend committed", value: inrShort(kpi.spend), title: inrFull(kpi.spend), foot: "Creator fees on deals you've paid for" },
          { featured: true, label: "Money saved", value: inrShort(kpi.saved), title: inrFull(kpi.saved), foot: "Vs each creator's market rate" },
        ]} />

        {campaigns.length > 0 && (
          <Grid cols={2}>
            <ChartCard title="Payments recorded" period="12 months" figure={inrShort(pay.total)} figureTitle={inrFull(pay.total)} level={2}
              foot={pay.total > 0 ? "Confirmed by the Colatch finance team, by month (IST)" : "Shows once the Colatch finance team confirms your first payment"}>
              <Bars months={pay.months} label="Payments recorded per month" fmt={inrFull} />
            </ChartCard>
            <ChartCard title="Your campaigns" period={`${campaigns.length} in all`} figure={String(kpi.live)} level={2} foot="live now · by status">
              <Split label="Campaigns by status" parts={statusParts} />
            </ChartCard>
          </Grid>
        )}

        <Grid aside={<>
          {waiting.length > 0 && (
            <AsideCard eyebrow="With creators and Colatch" title={`Waiting on others · ${waiting.length}`}>
              <div className="sheet">{waiting.map(({ d, m }) => <MoveRow key={d.id} kind="wait" href={link(d.campaign_id)} title={`${d.cname || (d.chandle ? "@" + d.chandle : "Creator")}: ${m.forBrand}`} sub={byId[d.campaign_id]?.title} cta="View" />)}</div>
            </AsideCard>
          )}
          <AsideCard tone="night" eyebrow="New campaign" title="Need more creators?" foot={<a href="/pitches">Browse creator ideas</a>}>
            <p className="small">Describe it in your own words. Colatch matches creators on talent, city, size and language, and a strategist sends a shortlist, usually within 2 working days.</p>
            <p><a className="btn sm" href="/brief">Post a brief →</a></p>
          </AsideCard>
          <AsideCard eyebrow="Your account" title={me.company || me.name || "Your brand"} foot={<><a href="/brand/settings">Settings</a><a href="/faq">How payments work</a></>}>
            <Facts items={[{ label: "Email", value: me.email }, { label: "Status", value: me.verified ? "Confirmed" : "Not confirmed yet" }]} />
          </AsideCard>
        </>}>
          <Section id="sheet-mine" title="Your move" sub={mineCount ? `${mineCount} waiting on you, oldest first.` : "Nothing waiting on you."}>
            {mineCount === 0 ? <AllClear><b>Nothing waiting on you.</b> We'll email you when creators are ready to approve or a draft comes in.</AllClear> : <div className="sheet">
              {decide.map(([cid, n]) => <MoveRow key={`a-${cid}`} kind="mine" href={link(cid)} title={`${n} ${n === 1 ? "creator" : "creators"} to approve`} sub={byId[cid]?.title} cta="Review" />)}
              {mine.map(({ d, m }) => <MoveRow key={d.id} kind="mine" href={link(d.campaign_id)} title={`${m.forBrand}: ${d.cname || (d.chandle ? "@" + d.chandle : "creator")}`} sub={byId[d.campaign_id]?.title} cta={m.step === "approve_draft" ? "Review draft" : "Open"} />)}
            </div>}
          </Section>

          <Section id="h-campaigns" title="Campaigns" sub={`${campaigns.length} ${campaigns.length === 1 ? "campaign" : "campaigns"}, newest first. Open one to approve creators and follow every deal.`}>
            <DataTable caption="Campaigns" rows={campaigns} columns={campColumns} rowHref={(k) => (k.share_token ? `/shortlist/${k.share_token}` : null)}
              empty={me.verified
                ? { title: "No campaigns yet.", body: "Post your first brief and we'll shortlist creators for you.", action: <a className="btn sm plum" href="/brief">Post your first brief</a> }
                : { title: "No campaigns here yet.", body: `Campaigns you sent from ${me.email} appear here once your email is confirmed.`, action: <a className="btn sm" href="/brief">Post a new brief</a> }} />
          </Section>

          <Section id="h-money" title="Money recorded" sub={ledger.length ? "Payments and refunds confirmed by the Colatch finance team." : undefined}>
            <DataTable caption="Money recorded" rows={ledger} columns={ledgerColumns} rowKey={(r, i) => i}
              empty={{ title: "No payments recorded yet.", body: "A payment shows here once the Colatch finance team confirms it arrived.", action: <a className="btn sm" href="/faq">How payments work</a> }} />
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
