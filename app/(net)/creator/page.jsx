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
import { ScoreStrip } from "../_ui/Score";
import { brandTrust, payByLine, isFeatured } from "@/lib/net/trust";
import { nextMove, isMine } from "@/lib/net/moves";
import { MoveRow } from "../_ui/Moves";

export const metadata = { title: "Your opportunities", robots: { index: false } };

export default async function Page({ searchParams }) {
  const me = await currentCreator();
  if (!me) redirect("/creator/login");
  // A pending profile claim sees none of that creator's data, and writes nothing.
  if (me.claimPending) return <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator"><ClaimNote status="pending" /></PublicShell>;
  const c = me.creator;
  const today = new Date().toISOString().slice(0, 10);
  const camps = (await env.DB.prepare("SELECT * FROM campaigns WHERE status='open' AND is_open=1 AND (deadline IS NULL OR deadline >= ?) ORDER BY created_at DESC LIMIT 300").bind(today).all()).results ?? [];
  const applied = new Set(((await env.DB.prepare("SELECT campaign_id FROM campaign_applications WHERE (creator_id=? OR handle=?) AND status <> 'withdrawn'").bind(c.id, c.handle).all()).results ?? []).map((r) => r.campaign_id));
  const revealed = new Set(((await env.DB.prepare("SELECT campaign_id FROM creator_deals WHERE creator_id=? AND sow_accepted_at IS NOT NULL").bind(c.id).all()).results ?? []).map((r) => r.campaign_id));
  const brandLabel = (k) => (revealed.has(k.id) ? k.brand || blindBrand(k) : blindBrand(k));
  const sc = await colatchScore(env, c.id);
  // Icon early access: briefs younger than 24 hours are shown only to Icon creators (and to anyone already in them).
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const isFresh = (k) => String(k.created_at || "") > cutoff;
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
  const pendingApps = ((await env.DB.prepare("SELECT a.status, k.title, k.slug, k.id FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id WHERE a.creator_id=? AND a.status IN ('new','shortlisted') ORDER BY a.created_at DESC LIMIT 5").bind(c.id).all()).results ?? []);

  const hero = (
    <section className="hero"><div className="hero-in">
      <div className="eb">{welcome ? "Welcome to Colatch" : "Your opportunities"}</div>
      <h1>{myMoves.length ? <>{myMoves.length === 1 ? "One thing" : `${myMoves.length} things`} need <b>you, {first}.</b></> : mine.length ? <>{mine.length} {mine.length === 1 ? "brief fits" : "briefs fit"} <b>you, {first}.</b></> : <>Your matches land <b>here.</b></>}</h1>
      <p>{myMoves.length ? "Your move first, then what you're waiting on, then new briefs that fit you." : "Briefs where you meet what the brand asked for: talent, size, city and language. You decide what to apply for."}</p>
    </div></section>
  );

  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator" hero={hero} moves={myMoves.length}>
      {(myMoves.length > 0 || waiting.length > 0 || pendingApps.length > 0) && (
        <section aria-labelledby="sheet-mine" style={{ marginBottom: 32 }}>
          {myMoves.length > 0 && <div className="sheet" style={{ marginBottom: 24 }}>
            <div className="sheet__h"><h2 id="sheet-mine">Your move</h2><span className="n">{myMoves.length}</span></div>
            {myMoves.map(({ d, m }) => <MoveRow key={d.id} kind="mine" href={`/creator/deals/${d.id}`} title={m.forCreator} sub={`${d.brand || "Brand"} · ${d.deliverable || "Deal"}`} cta="Open" />)}
          </div>}
          {(waiting.length > 0 || pendingApps.length > 0) && <div className="sheet">
            <div className="sheet__h"><h2 id={myMoves.length ? undefined : "sheet-mine"}>Waiting on others</h2><span className="n">{waiting.length + pendingApps.length}</span></div>
            {waiting.map(({ d, m }) => <MoveRow key={d.id} kind="wait" href={`/creator/deals/${d.id}`} title={m.forCreator} sub={`${d.brand || "Brand"} · ${d.deliverable || "Deal"}`} cta="View" />)}
            {pendingApps.map((a) => <MoveRow key={a.id} kind="wait" href={`/creator/o/${a.slug}`} title={a.status === "shortlisted" ? "Shortlisted: the brand decides next" : "Applied: Colatch is reviewing"} sub={a.title} cta="View" />)}
          </div>}
        </section>
      )}
      <ScoreStrip s={sc} />
      {early.length > 0 && (
        <div className="note info" style={{ marginBottom: 20 }}>
          <b>{early.length} new {early.length === 1 ? "brief that fits you is" : "briefs that fit you are"} open to Icon creators right now.</b> {early.length === 1 ? "It opens" : "They open"} to you within 24 hours. Icon creators see every brief a day early. <a className="link" href="/creator/score">How to get there →</a>
        </div>
      )}
      {sc.tier === "Icon" && camps.some(isFresh) && (
        <div className="note good" style={{ marginBottom: 20 }}><b>Icon early access:</b> briefs marked “Early” below are visible only to Icon creators for their first 24 hours.</div>
      )}
      {gaps.length > 0 && (
        <div className="note warn" style={{ marginBottom: 20 }}>
          <b>Complete your profile to see more briefs.</b> Missing: {gaps.slice(0, 4).join(", ")}.
          {unlockable.length > 0 && <> {unlockable.length} more {unlockable.length === 1 ? "brief is" : "briefs are"} waiting for this.</>} <a className="link" href="/creator/profile">Update profile →</a>
        </div>
      )}

      <div className="sheet__h" style={{ marginTop: 8 }}><h2>Briefs that fit you</h2><span className="n">{mine.length}</span></div>
      <div className="spread" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          {(c.skills || "").split(",").filter(Boolean).map((s) => <span key={s} className="tag">{s.trim()}</span>)}
          {c.city && <span className="tag">{c.city}</span>}
          {c.followers ? <span className="tag">{compact(c.followers)} followers</span> : null}
        </div>
        <a className="link small" href="/creator/profile">Edit what I do</a>
      </div>

      <div className="stack">
        {mine.map(({ k, m }) => {
          const cash = !NON_CASH.includes(k.pay_type || "cash");
          return (
            <a key={k.id} className="opp" href={`/creator/o/${k.slug}`}>
              <div className="top">
                <div style={{ minWidth: 0 }}><div className="br">{brandLabel(k)}{trustById.get(k.id)?.funded ? " · Brand has paid ✓" : ""}</div><h3>{k.title}</h3></div>
                <div className="row" style={{ gap: 10, flex: "none" }}>
                  {isFeatured(k) && <span className="pill ok">Featured</span>}
                  {sc.tier === "Icon" && isFresh(k) && <span className="pill ok">Early</span>}
                  {applied.has(k.id) && <span className="pill good">Applied</span>}
                  <div className="score sm" style={{ "--v": m.score }} title="Match score"><i>{m.score}</i></div>
                </div>
              </div>
              {k.brief && <p>{k.brief.length > 220 ? k.brief.slice(0, 220) + "…" : k.brief}</p>}
              <div className="why">{m.reasons.map((r) => <span key={r}>{r}</span>)}</div>
              <div className="facts">
                <span className="pill">{PAY_LABEL[k.pay_type || "cash"]}</span>
                {rewardLine(k) !== PAY_LABEL[k.pay_type || "cash"] && <span><b>{rewardLine(k)}</b></span>}
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
        {!mine.length && (
          <div className="panel empty"><b>No open brief fits you right now.</b>New briefs come in every week; check back here. Meanwhile, a complete profile with your best reels helps you rank higher.</div>
        )}
      </div>

      {unlockable.length > 0 && (
        <div className="sec"><div className="h2">Unlock by completing your profile</div>
          <div className="stack">{unlockable.slice(0, 5).map(({ k, m }) => (
            <div key={k.id} className="opp" style={{ opacity: 0.75 }}><div className="br">{brandLabel(k)}</div><h3>{k.title}</h3>
              <div className="why">
                {m.blockers.map((b) => <span key={b} className="no">{b}</span>)}
                {requirementChips(k).slice(0, 3).map((r) => <span key={"r" + r} style={{ background: "var(--ivory-2)", color: "var(--accent-ink)" }}>{r}</span>)}
              </div></div>
          ))}</div></div>
      )}
    </PublicShell>
  );
}
