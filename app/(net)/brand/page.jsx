import { redirect } from "next/navigation";
import PublicShell, { Hero } from "../_ui/PublicShell";
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
import { Stat } from "@/components/dash/Parts";
import { inrShort } from "@/lib/net/dashboard";

export const metadata = { title: "My campaigns", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS = { draft: "Draft", open: "Open", shortlisting: "Shortlisting", live: "Live", closed: "Closed", completed: "Completed", cancelled: "Cancelled" };
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

  const hero = (
    <Hero eyebrow={me.company || "Your brand"} title={`Hi ${String(me.name || "there").replace(/[<>&"]/g, "")}, <b>here's what needs you.</b>`}>
      <p>Approve creators, review drafts and see every payment you've made, across all your campaigns.</p>
    </Hero>
  );

  return (
    <PublicShell mode="client" brandName={me.name || me.email} path="/brand" hero={hero}>
      <div style={{ marginBottom: 18 }}><Flash sp={searchParams} /></div>
      {searchParams?.welcome && <div className="note good" style={{ marginBottom: 18 }}>Your account is ready.{searchParams?.mail === "off" ? " We couldn't send the confirmation email right now; use the button below to try again." : " Check your inbox for a link to confirm your email."}</div>}

      {!me.verified && (
        <form className="note info" action={resend} style={{ marginBottom: 24, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span>Confirm your email to see campaigns sent from <b>{me.email}</b>.</span>
          <button className="btn plum" style={{ minHeight: 44 }}>Send confirmation link</button>
        </form>
      )}

      <div className="dsh"><div className="dsh-brand" aria-label="Your numbers">
        <Stat label="Campaigns live" foot={`${campaigns.length} in all`}><div className="dsh-stat__value">{kpi.live}</div></Stat>
        <Stat label="Creators booked" foot={`${paidFor.length} paid ${paidFor.length === 1 ? "deal" : "deals"}`}><div className="dsh-stat__value">{kpi.booked}</div></Stat>
        <Stat label="Spend committed" foot="Creator fees on deals you've paid for"><div className="dsh-stat__value" title={`₹${kpi.spend.toLocaleString("en-IN")}`}>{inrShort(kpi.spend)}</div></Stat>
        <Stat label="Money saved" foot="Vs each creator's market rate"><div className="dsh-stat__value gold" title={`₹${kpi.saved.toLocaleString("en-IN")}`}>{inrShort(kpi.saved)}</div></Stat>
      </div></div>

      <section aria-labelledby="sheet-mine" style={{ marginBottom: 32 }}>
        <div className="sheet" style={{ marginBottom: 24 }}>
          <div className="sheet__h"><h2 id="sheet-mine">Your move</h2><span className="n">{mineCount}</span></div>
          {mineCount === 0 ? <AllClear><b>Nothing waiting on you.</b> We'll email you when creators are ready to approve or a draft comes in.</AllClear> : <>
            {decide.map(([cid, n]) => <MoveRow key={`a-${cid}`} kind="mine" href={link(cid)} title={`${n} ${n === 1 ? "creator" : "creators"} to approve`} sub={byId[cid]?.title} cta="Review" />)}
            {mine.map(({ d, m }) => <MoveRow key={d.id} kind="mine" href={link(d.campaign_id)} title={`${m.forBrand}: ${d.cname || (d.chandle ? "@" + d.chandle : "creator")}`} sub={byId[d.campaign_id]?.title} cta={m.step === "approve_draft" ? "Review draft" : "Open"} />)}
          </>}
        </div>
        {waiting.length > 0 && <div className="sheet">
          <div className="sheet__h"><h2>Waiting on others</h2><span className="n">{waiting.length}</span></div>
          {waiting.map(({ d, m }) => <MoveRow key={d.id} kind="wait" href={link(d.campaign_id)} title={`${d.cname || (d.chandle ? "@" + d.chandle : "Creator")}: ${m.forBrand}`} sub={byId[d.campaign_id]?.title} cta="View" />)}
        </div>}
      </section>

      <section aria-labelledby="h-campaigns" style={{ marginBottom: 32 }}>
        <div className="sheet__h"><h2 id="h-campaigns">Campaigns</h2><span className="n">{campaigns.length}</span></div>
        {campaigns.length === 0 ? (
          <AllClear>{me.verified ? <>No campaigns yet. <a className="link" href="/brief">Post your first brief</a> and we'll shortlist creators for you.</> : <>Campaigns you sent from {me.email} appear here once your email is confirmed. Or <a className="link" href="/brief">post a new brief</a>.</>}</AllClear>
        ) : (
          <div className="panel scroll-x"><table className="tbl stack-sm">
            <thead><tr><th scope="col">Campaign</th><th scope="col">Status</th><th scope="col">Deadline</th><th scope="col"><span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Links</span></th></tr></thead>
            <tbody>{campaigns.map((k) => (
              <tr key={k.id}>
                <td data-label="Campaign">{k.share_token ? <a className="link" href={`/shortlist/${k.share_token}`}>{k.title || k.brand}</a> : (k.title || k.brand)}</td>
                <td data-label="Status"><span className="pill">{STATUS[k.status] || k.status}</span></td>
                <td data-label="Deadline" style={{ whiteSpace: "nowrap" }}>{k.deadline ? dayText(k.deadline) : "—"}</td>
                <td data-label="">{k.share_token && <a className="link" href={`/receipt/${k.share_token}`}>Receipt</a>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section aria-labelledby="h-money" style={{ marginBottom: 32 }}>
        <div className="sheet__h"><h2 id="h-money">Money recorded</h2><span className="n">{ledger.length}</span></div>
        {ledger.length === 0 ? <AllClear>No payments recorded yet. A payment shows here once the Colatch finance team confirms it arrived.</AllClear> : (
          <div className="panel scroll-x"><table className="tbl">
            <thead><tr><th scope="col">Date</th><th scope="col">What</th><th scope="col">Campaign</th><th scope="col" style={{ textAlign: "right" }}>Amount</th><th scope="col">Bank ref</th></tr></thead>
            <tbody>{ledger.map((r, i) => (
              <tr key={i}>
                <td>{new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td>{LEDGER[r.kind]}</td>
                <td>{byId[r.campaign_id]?.title || "—"}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.kind === "brand_refund_sent" ? "−" : ""}{formatPaise(Number(r.amount_paise))}</td>
                <td>{r.utr ? `…${String(r.utr).slice(-4)}` : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </PublicShell>
  );
}
