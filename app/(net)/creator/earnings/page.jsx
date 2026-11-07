import { redirect } from "next/navigation";
import { headers } from "next/headers";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { inr, compact } from "@/lib/net/creators";
import { ensureCode, REF } from "@/lib/net/referral";
import { creatorRating } from "@/lib/net/trust";
import { colatchScore } from "@/lib/net/score";
import { TierBadge } from "../../_ui/Score";

async function setShowEarnings(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/earnings");
  const on = String(fd.get("show") ?? "") === "1" ? 1 : 0;
  await env.DB.prepare("UPDATE creators SET show_earnings=?, updated_at=datetime('now') WHERE id=?").bind(on, me.creator.id).run();
  redirect("/creator/earnings#flex");
}

export const metadata = { title: "Earnings · Colatch", robots: { index: false } };

const reasonLabel = { creator_first_deal: "Creator you referred got their first paid deal", brand_fee_share: "Brand you referred ran a campaign" };
const ms = (s) => Date.parse(String(s).replace(" ", "T") + "Z");

export default async function Page() {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/earnings");
  const c = me.creator;
  const code = await ensureCode(env, "creator", c.id, c.name || c.handle);
  const deals = (await env.DB.prepare("SELECT d.*, k.payment_days FROM creator_deals d LEFT JOIN campaigns k ON k.id=d.campaign_id WHERE d.creator_id=? AND d.stage <> 'dropped' ORDER BY d.created_at").bind(c.id).all()).results ?? [];
  const paid = deals.filter((d) => d.pay_status === "paid");
  const earned = paid.reduce((s, d) => s + (d.fee || 0) - (d.tds_amount || 0), 0);
  const tds = paid.reduce((s, d) => s + (d.tds_amount || 0), 0);
  const rewards = deals.filter((d) => d.live_at).reduce((s, d) => s + (d.reward_value || 0), 0);
  const pending = deals.filter((d) => d.pay_status !== "paid" && d.fee).reduce((s, d) => s + d.fee, 0);
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
  const waCreators = `https://wa.me/?text=${encodeURIComponent(`I get paid brand deals through Colatch. You only see briefs that fit you, pay is shown upfront, and they pay on time. Join free: ${origin}/r/${code}?to=join`)}`;
  const waBrands = `https://wa.me/?text=${encodeURIComponent(`If you need creators for a campaign, Colatch shortlists the right ones in 2 working days, holds payment until the work is approved and shows real cost per view. Post a brief: ${origin}/r/${code}?to=brief`)}`;
  const nb = refs.filter((r) => r.referred_type === "brand").length;
  const nc = refs.filter((r) => r.referred_type === "creator").length;
  const sc = await colatchScore(env, c.id);
  const showEarn = Number(c.show_earnings) === 1;
  const cardUrl = `/c/${code}/card`;
  const caption = `${sc.stats.delivered ? `${sc.stats.delivered} brand ${sc.stats.delivered === 1 ? "deal" : "deals"} done through @colatch` : "I've joined @colatch"} 💛 You only see briefs that fit you, pay is shown upfront and every payment goes through Colatch. Join free with my code ${code}: ${origin}/c/${code}`;
  const waCard = `https://wa.me/?text=${encodeURIComponent(caption)}`;

  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/earnings">
      <div className="lbl">Earnings</div>
      <h1 style={{ margin: "6px 0 20px", fontWeight: 300, fontSize: 32, color: "var(--p900)" }}>{inr(earned + refPaid)} <span style={{ fontSize: 16, color: "var(--ink-3)" }}>earned through Colatch</span></h1>

      <div className="grid4">
        <div className="panel kpi"><div className="k">Paid to you</div><div className="v">{inr(earned)}</div><div className="s">{paid.length} {paid.length === 1 ? "deal" : "deals"}{tds ? ` · ${inr(tds)} TDS you can claim back` : ""}</div></div>
        <div className="panel kpi"><div className="k">On the way</div><div className="v">{inr(pending)}</div><div className="s">deals not yet paid</div></div>
        <div className="panel kpi"><div className="k">Paid on time</div><div className="v">{timed.length ? Math.round((onTime / timed.length) * 100) + "%" : "—"}</div><div className="s">{avgDays != null ? "avg " + avgDays.toFixed(1) + " days after going live" : "after your first payout"}</div></div>
        <div className="panel kpi"><div className="k">Products &amp; tickets</div><div className="v">{inr(rewards)}</div><div className="s">value received</div></div>
      </div>

      <div className="sec">
        <div className="h2">Your track record</div>
        <div className="grid4">
          <div className="panel kpi"><div className="k">Views delivered</div><div className="v">{compact(views)}</div><div className="s">across Colatch campaigns</div></div>
          <div className="panel kpi"><div className="k">Brand rating</div><div className="v">{rating.rating != null ? "★ " + rating.rating : "—"}</div><div className="s">{rating.n} brand {rating.n === 1 ? "review" : "reviews"}</div></div>
          <div className="panel kpi"><div className="k">Rebooked by</div><div className="v">{rebooked}</div><div className="s">brands that came back</div></div>
          <div className="panel kpi"><div className="k">Rate growth</div><div className="v">{growth != null ? (growth > 0 ? "+" : "") + growth + "%" : "—"}</div><div className="s">first deal vs latest · {proofs} verified {proofs === 1 ? "proof" : "proofs"}</div></div>
        </div>
        <p className="hint" style={{ margin: "10px 0 0" }}>Your record is verified by Colatch: brand-approved posts, real views and payouts. It shows on your <a className="link" href={`/m/${c.handle}`}>media kit</a>, and you can't get it from deals done off-platform.</p>
      </div>

      <div className="sec panel pad" id="flex">
        <div className="grid2" style={{ alignItems: "center", gridTemplateColumns: "minmax(0,1fr) 260px" }}>
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
            <img src={cardUrl} alt="Your Colatch flex card" width={1080} height={1920} style={{ width: "100%", height: "auto", borderRadius: 18, boxShadow: "0 24px 48px -26px rgba(31,21,36,.6)", background: "#1E1128", aspectRatio: "9/16" }} />
          </a>
        </div>
      </div>

      <div className="sec panel pad">
        <h2>Refer and earn</h2>
        <div className="grid2" style={{ alignItems: "start" }}>
          <div>
            <h3>Bring a brand → earn {REF.brandSharePct}% of our fee for {REF.months} months</h3>
            <p className="muted" style={{ margin: "0 0 12px" }}>Every campaign they run pays you, paid from Colatch's own fee, never from creators. You also get first look at their briefs.</p>
            <a className="btn-foil" href={waBrands} target="_blank" rel="noopener">Share with a brand on WhatsApp</a>
          </div>
          <div>
            <h3>Bring a creator → ₹{REF.creatorBonus} after their first paid deal</h3>
            <p className="muted" style={{ margin: "0 0 12px" }}>Paid once their first deal clears, so only real creators count.</p>
            <a className="btn plum" href={waCreators} target="_blank" rel="noopener">Share with a creator on WhatsApp</a>
          </div>
        </div>
        <div className="row" style={{ marginTop: 18 }}>Your code <code className="k" style={{ fontSize: 15 }}>{code}</code> · <code className="k">{origin}/r/{code}</code></div>
        <div className="grid3" style={{ marginTop: 18 }}>
          <div className="panel kpi" style={{ boxShadow: "none" }}><div className="k">People you brought</div><div className="v">{refs.length}</div><div className="s">{nb} {nb === 1 ? "brand" : "brands"} · {nc} {nc === 1 ? "creator" : "creators"}</div></div>
          <div className="panel kpi" style={{ boxShadow: "none" }}><div className="k">Referral earnings</div><div className="v">{inr(refTotal)}</div><div className="s">{inr(refPaid)} paid out</div></div>
          <div className="panel kpi" style={{ boxShadow: "none" }}><div className="k">Next payout</div><div className="v">{inr(refTotal - refPaid)}</div><div className="s">paid with your next deal</div></div>
        </div>
        {earn.length > 0 && <table className="tbl" style={{ marginTop: 14 }}><tbody>{earn.map((e, i) => <tr key={i}><td>{reasonLabel[e.reason] || e.reason}</td><td>{String(e.created_at).slice(0, 10)}</td><td className="num">{inr(e.amount)}</td><td><span className={`pill ${e.status === "paid" ? "good" : ""}`}>{e.status}</span></td></tr>)}</tbody></table>}
      </div>
    </PublicShell>
  );
}
