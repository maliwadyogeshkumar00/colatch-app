import { redirect } from "next/navigation";
import { ClaimNote } from "@/app/(net)/join/_claim.js";
import PublicShell from "../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { match, profileGaps } from "@/lib/net/match";
import { requirementChips, PAY_LABEL, daysLeft, rewardLine, NON_CASH } from "@/lib/net/campaign";
import { compact } from "@/lib/net/creators";
import { blindBrand } from "@/lib/net/guard";
import { colatchScore } from "@/lib/net/score";
import { PageHeader, KpiStrip, Grid, Section, AsideCard, EmptyState, Tags } from "@/components/ui";
import { inrShort } from "@/lib/net/dashboard";
import { ScoreCard, HeroFigure, istDay } from "@/components/creator/Parts";
import { brandTrust, payByLine, isFeatured } from "@/lib/net/trust";
import { nextMove, isMine } from "@/lib/net/moves";
import { MoveRow } from "../_ui/Moves";
import { dealState, APP_LABEL } from "../_ui/dealState";

export const metadata = { title: "Your opportunities", robots: { index: false } };

export default async function Page({ searchParams }) {
  const me = await currentCreator();
  if (!me) redirect("/creator/login");
  // A pending profile claim sees none of that creator's data, and writes nothing.
  if (me.claimPending) return <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator"><ClaimNote status="pending" /></PublicShell>;
  const c = me.creator;
  const today = new Date().toISOString().slice(0, 10);
  // published_at: when the team last published the brief (campaigns has no column for it, so it comes from the audit log).
  const camps = (await env.DB.prepare("SELECT k.*, (SELECT MAX(a.at) FROM audit_log a WHERE a.entity='campaign' AND a.entity_id=k.id AND a.action IN ('campaign.approve','campaign.publish','campaign.reopen')) AS published_at FROM campaigns k WHERE k.status='open' AND k.is_open=1 AND (k.deadline IS NULL OR k.deadline >= ?) ORDER BY k.created_at DESC LIMIT 300").bind(today).all()).results ?? [];
  const appRows = (await env.DB.prepare("SELECT campaign_id, match_score, status FROM campaign_applications WHERE (creator_id=? OR handle=?) AND status <> 'withdrawn'").bind(c.id, c.handle).all()).results ?? [];
  const applied = new Set(appRows.map((r) => r.campaign_id));
  // The chip on a brief card shows where that application or deal stands now, with the same labels as My deals.
  const appStatus = new Map(appRows.map((r) => [r.campaign_id, r.status]));
  const dealByCampaign = new Map();
  for (const d of ((await env.DB.prepare("SELECT campaign_id, stage, pay_status, sow_accepted_at, draft_status, live_at, post_url FROM creator_deals WHERE creator_id=? AND stage <> 'dropped' ORDER BY updated_at ASC").bind(c.id).all().catch(() => ({ results: [] }))).results ?? [])) {
    if (d.campaign_id && (d.stage !== "cancelled" || !dealByCampaign.has(d.campaign_id))) dealByCampaign.set(d.campaign_id, d);
  }
  const briefState = (id) => dealByCampaign.has(id) ? dealState(dealByCampaign.get(id)) : appStatus.get(id) === "new" ? ["Applied", "good"] : APP_LABEL[appStatus.get(id)] || ["Applied", "good"];
  // Once applied, show the score saved with the application, the same one the brand and the team see.
  const savedScore = new Map(appRows.filter((r) => r.match_score != null).map((r) => [r.campaign_id, Number(r.match_score)]));
  const revealed = new Set(((await env.DB.prepare("SELECT campaign_id FROM creator_deals WHERE creator_id=? AND sow_accepted_at IS NOT NULL").bind(c.id).all()).results ?? []).map((r) => r.campaign_id));
  const brandLabel = (k) => (revealed.has(k.id) ? k.brand || blindBrand(k) : blindBrand(k));
  const sc = await colatchScore(env, c.id);
  // Icon early access: for 24 hours after a brief is published it is shown only to Icon creators (and to anyone
  // already in it). The window starts at publish time, not creation: every brief is created 'pending' and published
  // later. Without a recorded publish time the window can't be placed, so the brief is open to everyone.
  const isFresh = (k) => { const t = k.published_at ? new Date(k.published_at).getTime() : NaN; return Number.isFinite(t) && Date.now() - t < 24 * 36e5; };
  const early = sc.tier === "Icon" ? [] : camps.filter((k) => isFresh(k) && !applied.has(k.id) && match(c, k).eligible);
  const visible = sc.tier === "Icon" ? camps : camps.filter((k) => !isFresh(k) || applied.has(k.id));
  const scored = visible.map((k) => ({ k, m: match(c, k) }));
  // Featured briefs (a paid 7-day slot) sit on top; the rest by match score.
  const mine = scored.filter((x) => x.m.eligible).sort((a, b) => (isFeatured(b.k) ? 1 : 0) - (isFeatured(a.k) ? 1 : 0) || b.m.score - a.m.score);
  const trustById = new Map(await Promise.all(mine.slice(0, 40).map(async ({ k }) => [k.id, await brandTrust(env, k).catch(() => null)])));
  // briefs hidden only because the profile is missing something — the creator can unlock these
  const unlockable = scored.filter((x) => !x.m.eligible && x.m.blockers.every((b) => b.startsWith("Add your")));
  const gaps = profileGaps(c);
  const welcome = searchParams?.welcome;
  const countdown = (d) => { const n = daysLeft(d); return n == null ? "" : n <= 0 ? "Last day" : n === 1 ? "1 day left" : n + " days left"; };
  const urgent = (d) => { const n = daysLeft(d); return n != null && n <= 2; };
  const first = (c.name || c.handle).split(" ")[0];

  // The call sheet: every live deal, sorted by whose move it is (worked out by the deal state machine).
  const deals = (await env.DB.prepare("SELECT * FROM creator_deals WHERE creator_id=? AND stage <> 'cancelled' AND pay_status NOT IN ('paid','refunded') ORDER BY updated_at DESC LIMIT 30").bind(c.id).all()).results ?? [];
  const moves = deals.map((d) => ({ d, m: nextMove(d) })).filter((x) => x.m);
  const myMoves = moves.filter((x) => isMine(x.m, "creator"));
  const waiting = moves.filter((x) => !isMine(x.m, "creator"));
  // With no deal waiting on them, the creator's move is the best brief they haven't applied to, or a profile gap.
  const pendingApps = ((await env.DB.prepare("SELECT a.status, k.title, k.slug, k.id FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id WHERE a.creator_id=? AND a.status IN ('new','shortlisted') ORDER BY a.created_at DESC LIMIT 5").bind(c.id).all()).results ?? []);

  const nextBrief = mine.find((x) => !applied.has(x.k.id)) || null;

  // Read-only figures for the desk (each wrapped so a failure never breaks the page).
  const ist = new Date(Date.now() + 5.5 * 36e5);
  const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 36e5).toISOString();
  const allDeals = (await env.DB.prepare("SELECT id, stage, pay_status, live_at, sow_accepted_at, fee FROM creator_deals WHERE creator_id=? AND stage <> 'dropped'").bind(c.id).all().catch(() => ({ results: [] }))).results ?? [];
  const paidMonth = Number((await env.DB.prepare("SELECT COALESCE(SUM(l.amount_paise),0) s FROM finance_ledger l JOIN creator_deals d ON d.id=l.deal_id WHERE d.creator_id=? AND l.kind='creator_payout_sent' AND l.at >= ?::timestamptz").bind(c.id, monthStart).first().catch(() => null))?.s ?? 0) / 100;
  const openDeal = (d) => d.stage !== "cancelled" && d.pay_status !== "refunded" && d.pay_status !== "paid";
  const due = allDeals.filter((d) => openDeal(d) && d.fee && (d.pay_status === "funded" || d.pay_status === "released")).reduce((s, d) => s + Number(d.fee || 0), 0);
  const agreed = allDeals.filter((d) => openDeal(d) && d.fee && d.pay_status === "unfunded" && d.sow_accepted_at).reduce((s, d) => s + Number(d.fee || 0), 0);
  const nSelected = appRows.filter((r) => r.status === "accepted").length;
  const nLive = allDeals.filter((d) => openDeal(d) && d.live_at).length;
  const nPaid = allDeals.filter((d) => d.pay_status === "paid").length;
  const monthName = ist.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const showAll = searchParams?.briefs === "all";
  const PAGE = 12;
  const shown = showAll ? mine : mine.slice(0, PAGE);
  const tags = (() => { const sk = (c.skills || "").split(",").map((s) => s.trim()).filter(Boolean); return sk.length > 1 ? sk.filter((s) => s.toLowerCase() !== "creator") : sk; })().map((s) => s.charAt(0).toUpperCase() + s.slice(1));

  // The one gold action on the desk: the creator's next move.
  const firstMove = myMoves[0];
  const cta = firstMove ? { href: `/creator/deals/${firstMove.d.id}`, label: "Open your next deal" }
    : nextBrief ? { href: `/creator/o/${nextBrief.k.slug}`, label: "See your best match" }
    : gaps.length ? { href: "/creator/profile", label: "Finish your profile" } : null;

  const title = myMoves.length ? `${myMoves.length === 1 ? "One deal needs" : `${myMoves.length} deals need`} <b>you, ${first}.</b>` : mine.length ? `${mine.length} ${mine.length === 1 ? "brief fits" : "briefs fit"} <b>you, ${first}.</b>` : "Your matches land <b>here.</b>";
  const hero = (
    <PageHeader variant="hero" eyebrow={`${welcome ? "Welcome to Colatch" : "Your opportunities"} · ${istDay(new Date())}`} title={title}
      sub={myMoves.length ? "Your move first, then what you're waiting on, then new briefs that fit you." : "Briefs where you meet what the brand asked for: talent, size, city and language. You decide what to apply for."}
      actions={cta ? <a className="btn-foil" href={cta.href}>{cta.label} <span aria-hidden="true">→</span></a> : null}
      meta={<HeroFigure label={`Paid to you in ${monthName}`} value={paidMonth} note={due || agreed ? `<b>${inrShort(due)}</b> due to you${agreed ? ` · ${inrShort(agreed)} agreed, waiting for brand payment` : ""}` : "Nothing due right now. Your next payout shows here."} />} />
  );
  const queueN = myMoves.length + (nextBrief ? 1 : 0) + (gaps.length ? 1 : 0);

  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator" hero={hero} moves={myMoves.length}>
      <div className="cr-page">
        <KpiStrip label="Your deals at a glance" items={[
          { label: "Applied", value: appRows.length, foot: `${pendingApps.length} waiting on a decision`, href: "/creator/applications" },
          { label: "Selected", value: nSelected, foot: "Brands picked you", href: "/creator/applications?status=accepted" },
          { label: "Live", value: nLive, foot: "Posts up, payout pending", href: "/creator/applications" },
          { label: "Paid", value: nPaid, foot: "Deals paid in full", href: "/creator/earnings" },
        ]} />

        <Grid aside={<>
          <ScoreCard s={sc} />
          {early.length > 0 && (
            <div className="note info">
              <b>{early.length} more {early.length === 1 ? "brief is" : "briefs are"} open to Icon creators first.</b> {early.length === 1 ? "It opens" : "They open"} to you within 24 hours; the ones that fit you will appear here. Icon creators see every brief a day early. <a className="link" href="/creator/score">How to get there →</a>
            </div>
          )}
          {sc.tier === "Icon" && camps.some(isFresh) && (
            <div className="note good"><b>Icon early access:</b> briefs marked “Early” below are visible only to Icon creators for their first 24 hours.</div>
          )}
          <AsideCard eyebrow="What brands match you on" title="Your profile" foot={<a className="link" href="/creator/profile">Edit what I do →</a>}>
            {tags.length || c.city || c.followers ? <Tags items={[...tags, ...(c.city ? [c.city] : []), ...(c.followers ? [`${compact(c.followers)} followers`] : [])]} max={8} /> : <p className="hint" style={{ margin: 0 }}>Add what you do, your city and followers to see more briefs.</p>}
          </AsideCard>
        </>}>
          {queueN > 0 ? (
            <Section id="sheet-mine" title="Your move" sub={`${queueN} ${queueN === 1 ? "thing" : "things"} waiting on you`}>
              <div className="sheet">
                {myMoves.map(({ d, m }) => <MoveRow key={d.id} kind="mine" href={`/creator/deals/${d.id}`} title={m.forCreator} sub={`${d.brand || "Brand"} · ${d.deliverable || "Deal"}`} cta="Open" />)}
                {nextBrief && <MoveRow kind="mine" href={`/creator/o/${nextBrief.k.slug}`} title={`Apply: ${nextBrief.k.title}`} sub={`${nextBrief.m.score}/100 match · ${rewardLine(nextBrief.k)}${countdown(nextBrief.k.deadline) ? " · " + countdown(nextBrief.k.deadline) : ""}`} cta="See brief" />}
                {gaps.length > 0 && <MoveRow kind="mine" href="/creator/profile" title="Finish your profile" sub={`Missing: ${gaps.slice(0, 3).join(", ")}${unlockable.length ? ` · unlocks ${unlockable.length} more ${unlockable.length === 1 ? "brief" : "briefs"}` : ""}`} cta="Update" />}
              </div>
            </Section>
          ) : (
            <Section id="sheet-mine" title="Your move">
              <EmptyState title="Nothing waiting on you." body="No deal needs your action and you've applied to every brief that fits. New briefs come in every week." action={<a className="btn sm" href="/creator/applications">See my deals</a>} />
            </Section>
          )}
          {(waiting.length > 0 || pendingApps.length > 0) && (
            <Section id="sheet-wait" title="Waiting on others" sub={`${waiting.length + pendingApps.length} with the brand or the Colatch team`}>
              <div className="sheet">
                {waiting.map(({ d, m }) => <MoveRow key={d.id} kind="wait" href={`/creator/deals/${d.id}`} title={m.forCreator} sub={`${d.brand || "Brand"} · ${d.deliverable || "Deal"}`} cta="View" />)}
                {pendingApps.map((a) => <MoveRow key={a.id} kind="wait" href={`/creator/o/${a.slug}`} title={a.status === "shortlisted" ? "Shortlisted: the brand decides next" : "Applied: Colatch is reviewing"} sub={a.title} cta="View" />)}
              </div>
            </Section>
          )}

          <Section id="briefs" title="Briefs that fit you" sub={mine.length ? `${mine.length} open ${mine.length === 1 ? "brief" : "briefs"} · featured first, then best match` : "None open right now"}
            actions={<a className="btn sm" href="/creator/profile">Edit what I do</a>}>
            {mine.length ? (
              <div className="cr-briefs">
                {shown.map(({ k, m }) => {
                  const cash = !NON_CASH.includes(k.pay_type || "cash");
                  const score = savedScore.get(k.id) ?? m.score;
                  return (
                    <a key={k.id} className="opp cr-brief" href={`/creator/o/${k.slug}`}>
                      <div className="top">
                        <div style={{ minWidth: 0 }}><div className="br">{brandLabel(k)}{trustById.get(k.id)?.funded ? " · Brand has paid ✓" : ""}</div><h3>{k.title}</h3></div>
                        <div className="score sm" style={{ "--v": score }} title="Match score"><i>{score}</i></div>
                      </div>
                      {(isFeatured(k) || (sc.tier === "Icon" && isFresh(k)) || applied.has(k.id)) && <div className="cr-brief__pills">
                        {isFeatured(k) && <span className="pill ok">Featured</span>}
                        {sc.tier === "Icon" && isFresh(k) && <span className="pill ok">Early</span>}
                        {applied.has(k.id) && (() => { const [st, tone] = briefState(k.id); return <span className={`pill ${tone}`}>{st}</span>; })()}
                      </div>}
                      <div className="cr-brief__pay">{rewardLine(k) !== PAY_LABEL[k.pay_type || "cash"] && <span className="cr-brief__reward">{rewardLine(k)}</span>}{PAY_LABEL[k.pay_type || "cash"] && <span className="pill">{PAY_LABEL[k.pay_type || "cash"]}</span>}</div>
                      {k.brief && <p>{k.brief.length > 160 ? k.brief.slice(0, 160) + "…" : k.brief}</p>}
                      <div className="why">{m.reasons.map((r) => <span key={r}>{r}</span>)}</div>
                      <div className="facts">
                        {countdown(k.deadline) && <span className={urgent(k.deadline) ? "pill ok" : ""}>{countdown(k.deadline)}</span>}
                        {cash && <span>{payByLine(k)}</span>}
                        {trustById.get(k.id)?.verified && <span className="pill good">Verified brand</span>}
                        {trustById.get(k.id)?.onTimePct != null && <span>Pays on time {trustById.get(k.id).onTimePct}%</span>}
                        {k.deliverables && <span>{k.deliverables}</span>}
                        {k.shoot_date && <span>Shoot {k.shoot_date}</span>}
                        {k.creators_needed ? <span>{k.creators_needed} creators</span> : null}
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No open brief fits you right now." body="New briefs come in every week; check back here. Meanwhile, a complete profile with your best reels helps you rank higher." action={<a className="btn sm" href="/creator/profile">Improve my profile</a>} />
            )}
            {mine.length > PAGE && <p className="cr-more">{showAll ? <a className="btn sm" href="/creator#briefs">Show the top {PAGE}</a> : <a className="btn sm" href="/creator?briefs=all#briefs">Show all {mine.length} briefs</a>}</p>}
          </Section>

          {unlockable.length > 0 && (
            <Section id="unlock" title="Unlock by completing your profile" sub={`${unlockable.length} ${unlockable.length === 1 ? "brief" : "briefs"} you'd see with a fuller profile`}>
              <div className="cr-briefs">{unlockable.slice(0, 5).map(({ k, m }) => (
                <div key={k.id} className="opp cr-brief cr-brief--locked"><div className="br">{brandLabel(k)}</div><h3>{k.title}</h3>
                  <div className="why">
                    {m.blockers.map((b) => <span key={b} className="no">{b}</span>)}
                    {requirementChips(k).slice(0, 3).map((r) => <span key={"r" + r}>{r}</span>)}
                  </div></div>
              ))}</div>
            </Section>
          )}
        </Grid>
      </div>
    </PublicShell>
  );
}
