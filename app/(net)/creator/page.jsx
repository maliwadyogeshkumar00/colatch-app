import { redirect } from "next/navigation";
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

export const metadata = { title: "Your opportunities · Colatch", robots: { index: false } };

export default async function Page({ searchParams }) {
  const me = await currentCreator();
  if (!me) redirect("/creator/login");
  const c = me.creator;
  const today = new Date().toISOString().slice(0, 10);
  const camps = (await env.DB.prepare("SELECT * FROM campaigns WHERE status='open' AND (deadline IS NULL OR deadline >= ?) ORDER BY created_at DESC LIMIT 300").bind(today).all()).results ?? [];
  const applied = new Set(((await env.DB.prepare("SELECT campaign_id FROM campaign_applications WHERE creator_id=? OR handle=?").bind(c.id, c.handle).all()).results ?? []).map((r) => r.campaign_id));
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

  const hero = (
    <section className="hero"><div className="hero-in">
      <div className="eb">{welcome ? "Welcome to Colatch" : "Your opportunities"}</div>
      <h1>{mine.length ? <>{mine.length} {mine.length === 1 ? "brief fits" : "briefs fit"} <b>you, {first}.</b></> : <>Your matches land <b>here.</b></>}</h1>
      <p>We only show briefs where you meet what the brand asked for: your talent, size, city and language. Higher match means the brand is more likely to pick you. You decide what to apply for.</p>
    </div></section>
  );

  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator" hero={hero}>
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
                <div style={{ minWidth: 0 }}><div className="br">{brandLabel(k)}{k.funded ? " · Budget funded ✓" : ""}</div><h3>{k.title}</h3></div>
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
                <span className={`pill ${cash ? "good" : ""}`}>{PAY_LABEL[k.pay_type || "cash"]}</span>
                <span><b>{rewardLine(k)}</b></span>
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
          <div className="panel empty"><b>No open brief fits you right now.</b>New briefs come in every week, and we'll WhatsApp you when one matches. Meanwhile, a complete profile with your best reels helps you rank higher.</div>
        )}
      </div>

      {unlockable.length > 0 && (
        <div className="sec"><div className="h2">Unlock by completing your profile</div>
          <div className="stack">{unlockable.slice(0, 5).map(({ k, m }) => (
            <div key={k.id} className="opp" style={{ opacity: 0.75 }}><div className="br">{brandLabel(k)}</div><h3>{k.title}</h3>
              <div className="why">
                {m.blockers.map((b) => <span key={b} className="no">{b}</span>)}
                {requirementChips(k).slice(0, 3).map((r) => <span key={"r" + r} style={{ background: "var(--ivory-2)", color: "var(--p700)" }}>{r}</span>)}
              </div></div>
          ))}</div></div>
      )}
    </PublicShell>
  );
}
