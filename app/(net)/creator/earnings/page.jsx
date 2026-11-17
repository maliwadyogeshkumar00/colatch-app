import { redirect } from "next/navigation";
import { ClaimNote } from "@/app/(net)/join/_claim.js";
import { headers } from "next/headers";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { inr, compact } from "@/lib/net/creators";
import { ensureCode, REF, BRAND_TIERS, brandTierFor } from "@/lib/net/referral";
import { creatorRating } from "@/lib/net/trust";
import { colatchScore } from "@/lib/net/score";
import { TierBadge } from "../../_ui/Score";
import { PageHeader, KpiStrip, ChartCard, Bars, Split, Grid, Section, Card, DataTable, Cell, Figure } from "@/components/ui";
import { inrShort, monthSeries } from "@/lib/net/dashboard";
import { istDay } from "@/components/creator/Parts";

async function setShowEarnings(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/earnings");
  if (me.claimPending) redirect("/creator/earnings");
  const on = String(fd.get("show") ?? "") === "1" ? 1 : 0;
  await env.DB.prepare("UPDATE creators SET show_earnings=?, updated_at=datetime('now') WHERE id=?").bind(on, me.creator.id).run();
  redirect("/creator/earnings#flex");
}

export const metadata = { title: "Earnings", robots: { index: false } };

const reasonLabel = { creator_first_deal: "Creator you referred got their first paid deal", brand_fee_share: "Brand you referred ran a campaign", bypass_report: "Thank you for reporting an off-platform request" };
const ms = (s) => Date.parse(String(s).replace(" ", "T") + "Z");

export default async function Page() {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/earnings");
  // A pending profile claim sees none of that creator's data, and writes nothing.
  if (me.claimPending) return <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator/earnings"><ClaimNote status="pending" /></PublicShell>;
  const c = me.creator;
  const code = await ensureCode(env, "creator", c.id, c.name || c.handle);
  const deals = (await env.DB.prepare("SELECT d.*, k.payment_days FROM creator_deals d LEFT JOIN campaigns k ON k.id=d.campaign_id WHERE d.creator_id=? AND d.stage <> 'dropped' ORDER BY d.created_at").bind(c.id).all()).results ?? [];
  const paid = deals.filter((d) => d.pay_status === "paid");
  // What was actually sent, from the money ledger. Deals paid before the ledger existed fall back to fee − TDS.
  const sent = new Map(((await env.DB.prepare("SELECT l.deal_id, l.amount_paise, l.tds_paise FROM finance_ledger l JOIN creator_deals d ON d.id=l.deal_id WHERE d.creator_id=? AND l.kind='creator_payout_sent'").bind(c.id).all()).results ?? []).map((r) => [r.deal_id, r]));
  const earned = paid.reduce((s, d) => s + (sent.has(d.id) ? Number(sent.get(d.id).amount_paise) / 100 : (d.fee || 0) - (d.tds_amount || 0)), 0);
  const tds = paid.reduce((s, d) => s + (sent.has(d.id) ? Number(sent.get(d.id).tds_paise || 0) / 100 : d.tds_amount || 0), 0);
  const rewards = deals.filter((d) => d.live_at && d.stage !== "cancelled").reduce((s, d) => s + (d.reward_value || 0), 0);
  const active = (d) => d.stage !== "cancelled" && d.pay_status !== "refunded" && d.pay_status !== "paid" && d.fee;
  // Only money the brand has already paid to Colatch is "on the way"; agreed-but-unpaid deals are shown separately.
  const pending = deals.filter((d) => active(d) && (d.pay_status === "funded" || d.pay_status === "released")).reduce((s, d) => s + d.fee, 0);
  const agreed = deals.filter((d) => active(d) && d.pay_status === "unfunded" && d.sow_accepted_at).reduce((s, d) => s + d.fee, 0);
  const timed = paid.filter((d) => d.live_at && d.paid_at);
  const onTime = timed.filter((d) => (ms(d.paid_at) - ms(d.live_at)) / 864e5 <= (d.payment_days ?? 30)).length;
  const avgDays = timed.length ? timed.reduce((s, d) => s + (ms(d.paid_at) - ms(d.live_at)) / 864e5, 0) / timed.length : null;
  const brands = new Map();
  for (const d of paid) if (d.brand) brands.set(d.brand, (brands.get(d.brand) ?? 0) + 1);
  const rebooked = [...brands.values()].filter((n) => n > 1).length;
  const fees = paid.map((d) => d.fee).filter(Boolean);
  const growth = fees.length > 1 ? Math.round(((fees[fees.length - 1] - fees[0]) / fees[0]) * 100) : null;
  const views = deals.reduce((s, d) => s + (d.actual_views || 0), 0);
  const proofs = deals.filter((d) => d.proof_public).length;
  const rating = await creatorRating(env, c.id);
  const refs = (await env.DB.prepare("SELECT r.referred_type, r.created_at FROM referrals r WHERE r.code=? ORDER BY r.created_at DESC").bind(code).all()).results ?? [];
  const earn = (await env.DB.prepare("SELECT amount, status, reason, created_at FROM referral_earnings WHERE owner_type='creator' AND owner_id=? ORDER BY created_at DESC").bind(c.id).all()).results ?? [];
  const refTotal = earn.filter((e) => e.status !== "void").reduce((s, e) => s + e.amount, 0);
  const refPaid = earn.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount, 0);
  const origin = `https://${headers().get("host")}`;
  const waCreators = `https://wa.me/?text=${encodeURIComponent(`I get paid brand deals through Colatch. You only see briefs that fit you, pay is shown upfront, and every payment goes through Colatch. Join free: ${origin}/r/${code}?to=join`)}`;
  const waBrands = `https://wa.me/?text=${encodeURIComponent(`If you need creators for a campaign, Colatch shortlists the right ones in 2 working days, holds payment until the work is approved and shows real cost per view. Post a brief: ${origin}/r/${code}?to=brief`)}`;
  const nb = refs.filter((r) => r.referred_type === "brand").length;
  const nc = refs.filter((r) => r.referred_type === "creator").length;
  const sc = await colatchScore(env, c.id);
  const showEarn = Number(c.show_earnings) === 1;
  const cardUrl = `/c/${code}/card`;
  const caption = `${sc.stats.delivered ? `${sc.stats.delivered} brand ${sc.stats.delivered === 1 ? "deal" : "deals"} done through @colatch` : "I've joined @colatch"} 💛 You only see briefs that fit you, pay is shown upfront and every payment goes through Colatch. Join free with my code ${code}: ${origin}/c/${code}`;
  const waCard = `https://wa.me/?text=${encodeURIComponent(caption)}`;

  // Charts from the rows already loaded: what reached the creator per month (ledger amount, else fee − TDS), and where deals stand.
  const now = Date.now();
  const series = monthSeries(paid.filter((d) => d.paid_at).map((d) => ({ at: d.paid_at, amount: sent.has(d.id) ? Number(sent.get(d.id).amount_paise) / 100 : (d.fee || 0) - (d.tds_amount || 0) })), now, 12);
  const live = deals.filter((d) => d.stage !== "cancelled" && d.pay_status !== "refunded");
  const groups = [
    { label: "Paid", n: paid.length },
    { label: "Money on the way", n: live.filter((d) => d.pay_status === "funded" || d.pay_status === "released").length },
    { label: "Waiting for brand payment", n: live.filter((d) => d.pay_status === "unfunded" && d.sow_accepted_at).length },
    { label: "Terms to accept", n: live.filter((d) => d.pay_status === "unfunded" && !d.sow_accepted_at).length },
  ];
  const nGroups = groups.reduce((a, g) => a + g.n, 0);
  const onTimePct = timed.length ? Math.round((onTime / timed.length) * 100) : null;
  const hero = (
    <PageHeader variant="hero" eyebrow="Earnings" title={`${inrShort(earned + refPaid)} <b>earned through Colatch.</b>`}
      sub="Every rupee here went through Colatch: brand-funded before you started, paid after your post was verified." />
  );

  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/earnings" hero={hero}>
      <div className="cr-page">
        <KpiStrip label="Your money" items={[
          { label: "Paid to you", value: inrShort(earned), title: inr(earned), foot: `${paid.length} ${paid.length === 1 ? "deal" : "deals"}${tds ? ` · ${inr(tds)} TDS you can claim back` : ""}` },
          { label: "On the way", value: inrShort(pending), title: inr(pending), foot: `Brand has paid Colatch; yours after the post is verified${agreed ? ` · ${inr(agreed)} more agreed, waiting for brand payment` : ""}` },
          { label: "Paid on time", value: onTimePct != null ? `${onTimePct}%` : "—", foot: avgDays != null ? "avg " + avgDays.toFixed(1) + " days after going live" : "after your first payout" },
          { label: "Products & tickets", value: inrShort(rewards), title: inr(rewards), foot: "value received" },
        ]} />

        <Grid cols={2}>
          <ChartCard title="Paid to you by month" period="Last 12 months" figure={inrShort(series.total)} figureTitle={inr(series.total)} featured
            foot={series.total ? `${inrShort(series.months[11].total)} in ${series.months[11].label} so far. From the payout ledger, after TDS.` : "Your first payout shows here once a post is verified and paid."}>
            <Bars months={series.months} label="Paid to you per month, after TDS" fmt={inr} />
          </ChartCard>
          <ChartCard title="Where your deals stand" period={`${nGroups} ${nGroups === 1 ? "deal" : "deals"}`} figure={nGroups}
            foot={nGroups ? <a className="link" href="/creator/applications">See every deal →</a> : <a className="link" href="/creator">Find a brief that fits →</a>}>
            {nGroups ? <Split label="Deals by payment stage" parts={groups} /> : <p className="hint" style={{ margin: 0 }}>No deals yet. Apply to a brief that fits you to start.</p>}
          </ChartCard>
        </Grid>

        <Section id="record" title="Your track record" sub="Verified by Colatch: brand-approved posts, real views and payouts.">
          <KpiStrip label="Track record" items={[
            { label: "Views delivered", value: compact(views), foot: "across Colatch campaigns" },
            { label: "Brand rating", value: rating.rating != null ? "★ " + rating.rating : "—", foot: `${rating.n} brand ${rating.n === 1 ? "review" : "reviews"}` },
            { label: "Rebooked by", value: rebooked, foot: "brands that came back" },
            { label: "Rate growth", value: growth != null ? (growth > 0 ? "+" : "") + growth + "%" : "—", foot: `first deal vs latest · ${proofs} verified ${proofs === 1 ? "proof" : "proofs"}` },
          ]} />
          <p className="hint" style={{ margin: "12px 0 0" }}>Your record shows on your <a className="link" href={`/m/${c.handle}`}>media kit</a>, and you can't get it from deals done off-platform.</p>
        </Section>

      <div className="panel pad" id="flex">
        <div className="grid2 flexcard" style={{ alignItems: "center" }}>
          <div>
            <div className="row" style={{ gap: 10 }}><h2 style={{ margin: 0 }}>Your flex card</h2><TierBadge tier={sc.tier} size="sm" /></div>
            <h3 style={{ marginTop: 14 }}>Post it on your story. Every creator who joins with it earns you ₹{REF.creatorBonus}.</h3>
            <p className="muted" style={{ margin: "0 0 14px" }}>A story-sized card with your tier, verified deals and rating, plus your code in big letters. Everything on it is checked by Colatch, so it's a flex nobody can fake.</p>
            <div className="row" style={{ gap: 10 }}>
              <a className="btn-foil" href={`${cardUrl}?download=1`}>Download card</a>
              <a className="btn plum" href={waCard} target="_blank" rel="noopener">Send on WhatsApp</a>
              <a className="link small" href={`/c/${code}`} target="_blank" rel="noopener">See your invite page ↗</a>
            </div>
            <form action={setShowEarnings} className="row" style={{ marginTop: 16, gap: 10 }}>
              <input type="hidden" name="show" value={showEarn ? "0" : "1"} />
              <span className="small">{showEarn ? "Your card shows your earnings, rounded down (like ₹50K+)." : "Your earnings are hidden on the card."}</span>
              <button className="btn sm">{showEarn ? "Hide earnings" : "Show earnings, rounded"}</button>
            </form>
            <div className="fld" style={{ marginTop: 16 }}><label>Caption, ready to paste</label><textarea readOnly rows={3} defaultValue={caption} style={{ width: "100%", fontSize: 13.5 }} /></div>
          </div>
          <a href={cardUrl} target="_blank" rel="noopener" style={{ display: "block" }}>
            <img src={cardUrl} alt="Your Colatch flex card" width={1080} height={1920} style={{ width: "100%", height: "auto", borderRadius: 18, boxShadow: "0 24px 48px -26px rgba(31,21,36,.6)", background: "#1B1342", aspectRatio: "9/16" }} />
          </a>
        </div>
      </div>

      <Section id="refer" title="Refer and earn" sub={`Your code ${code}`}>
        <Grid cols={2}>
          <Card>
            <h3 className="cr-h3">Bring a brand → earn {brandTierFor(nb).pct}% of our fee for {REF.months} months</h3>
            <div className="row" style={{ gap: 6, margin: "0 0 10px" }}>
              {[...BRAND_TIERS].reverse().map((t) => <span key={t.pct} className={`pill ${brandTierFor(nb).pct === t.pct ? "good" : ""}`}>{t.label}: {t.pct}%</span>)}
            </div>
            {brandTierFor(nb).pct < 15 && <p className="hint" style={{ margin: "0 0 8px" }}>{(nb < 5 ? 5 : 10) - nb} more {(nb < 5 ? 5 : 10) - nb === 1 ? "brand" : "brands"} and new earnings from every brand you've brought are at {nb < 5 ? 12 : 15}%.</p>}
            <p className="muted" style={{ margin: "0 0 12px" }}>You earn on each of their deals that gets paid, from Colatch's own fee, never from creators. Only brands new to Colatch count.</p>
            <a className="btn plum" href={waBrands} target="_blank" rel="noopener">Share with a brand on WhatsApp</a>
          </Card>
          <Card>
            <h3 className="cr-h3">Bring a creator → ₹{REF.creatorBonus} after their first paid deal</h3>
            <p className="muted" style={{ margin: "0 0 12px" }}>Paid once their first deal clears, so only real creators count.</p>
            <a className="btn plum" href={waCreators} target="_blank" rel="noopener">Share with a creator on WhatsApp</a>
            <p className="small" style={{ margin: "16px 0 0" }}>Your code <code className="k" style={{ fontSize: 15 }}>{code}</code></p>
            <p className="small" style={{ margin: "6px 0 0" }}>Invite link <code className="k" style={{ overflowWrap: "anywhere" }}>{origin}/c/{code}</code></p>
          </Card>
        </Grid>
        <div style={{ marginTop: 16 }}>
          <KpiStrip label="Referrals" items={[
            { label: "People you brought", value: refs.length, foot: `${nb} ${nb === 1 ? "brand" : "brands"} · ${nc} ${nc === 1 ? "creator" : "creators"}` },
            { label: "Referral earnings", value: inrShort(refTotal), title: inr(refTotal), foot: `${inr(refPaid)} paid out` },
            { label: "Next payout", value: inrShort(refTotal - refPaid), title: inr(refTotal - refPaid), foot: "earned, not yet paid out by the team" },
          ]} />
        </div>
        {earn.length > 0 && <div style={{ marginTop: 16 }}><DataTable caption="Referral earnings" rows={earn} rowKey={(e, i) => i} columns={[
          { key: "reason", label: "For", render: (e) => <Cell title={reasonLabel[e.reason] || e.reason} sub={istDay(e.created_at)} /> },
          { key: "status", label: "Status", primary: true, render: (e) => <span className={`pill ${e.status === "paid" ? "good" : e.status === "void" ? "low" : ""}`}>{({ pending: "Earned, payout pending", paid: "Paid out", void: "Cancelled" })[e.status] || e.status}</span> },
          { key: "amount", label: "Amount", num: true, primary: true, render: (e) => <Figure value={inr(e.amount)} /> },
        ]} /></div>}
      </Section>
      </div>
    </PublicShell>
  );
}
