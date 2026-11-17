import { redirect } from "next/navigation";
import { ClaimNote } from "@/app/(net)/join/_claim.js";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { colatchScore, TIERS, SCORE_RULE } from "@/lib/net/score";
import { TierBadge } from "../../_ui/Score";
import { PageHeader, KpiStrip, ChartCard, Split, Grid, Section, Card, AsideCard } from "@/components/ui";
import { ScoreRing, TierMark, TierBar, tierProgress } from "@/components/creator/Parts";

export const metadata = { title: "Your Colatch Score", robots: { index: false } };

const CSS = `
.pg-score .ladder{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.pg-score .step{padding:18px;border-radius:16px;border:1px solid var(--line);background:var(--paper);position:relative}
.pg-score .step.on{box-shadow:0 0 0 2px var(--p500),var(--sh-2)}
.pg-score .step.done{opacity:.72}
.pg-score .step .min{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-4);font-weight:600;margin-top:10px}
.pg-score .step p{margin:6px 0 0;font-size:13.5px;color:var(--ink-2);line-height:1.5}
.pg-score .you{position:absolute;top:-10px;right:14px;background:var(--gold-foil);color:var(--purple-deep);font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:.06em}
.pg-score .meterbar{height:8px;border-radius:99px;background:var(--ivory-2);overflow:hidden;margin-top:8px}
.pg-score .meterbar i{display:block;height:100%;border-radius:99px;background:var(--p500)}
.pg-score .step .you{color:var(--p900)}
.pg-score .part{padding:14px 0;border-bottom:1px solid var(--line-2)}
.pg-score .part:last-child{border-bottom:0}
.pg-score .part .h{display:flex;justify-content:space-between;gap:12px;font-size:14.5px}
.pg-score .part .h b{font-weight:600}
.pg-score .part .pts-how{font-size:12.5px;color:var(--ink-3);margin-top:6px}
.pg-score .rule{display:flex;gap:14px;align-items:flex-start;padding:18px 20px;border-radius:16px;background:linear-gradient(135deg,#1B1342,#1B1342);color:#F4EFE3}
.pg-score .rule b{color:#fff}
@media(max-width:820px){.pg-score .ladder{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export default async function Page() {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/score");
  // A pending profile claim sees none of that creator's data, and writes nothing.
  if (me.claimPending) return <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator/score"><ClaimNote status="pending" /></PublicShell>;
  const c = me.creator;
  const s = await colatchScore(env, c.id);
  const idx = TIERS.findIndex((t) => t.tier === s.tier);

  const prog = tierProgress(s);
  const hero = (
    <PageHeader variant="hero" eyebrow="Colatch Score" title={`You're <b>${s.tier}.</b>`}
      sub={s.next ? s.next.need : "That's the top. Brands see you first, you're paid fastest and every new brief reaches you a day early."}
      meta={<div className="cr-fig cr-dark cr-scorehero"><ScoreRing score={s.score} size={132} /><div style={{ minWidth: 0 }}><p className="cr-fig__l">Your tier</p><div style={{ marginTop: 8 }}><TierMark tier={s.tier} /></div><p className="cr-fig__n">{prog.nxt ? <><b>{prog.gap}</b> {prog.gap === 1 ? "point" : "points"} to {prog.nxt.tier}</> : "Top tier"}</p></div></div>} />
  );

  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/score" hero={hero}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pg-score cr-page">
        <KpiStrip label="Your Colatch record" items={[
          { label: "Posts delivered", value: s.stats.delivered, foot: "verified live by Colatch" },
          { label: "Brand rating", value: s.stats.rating != null ? `★ ${s.stats.rating}` : "–", foot: `${s.stats.ratings} ${s.stats.ratings === 1 ? "review" : "reviews"}` },
          { label: "On time", value: s.stats.timed ? `${s.stats.onTime}/${s.stats.timed}` : "–", foot: "posts live by the agreed date" },
          { label: "Brand sign-offs", value: s.stats.signoffs, foot: "brands that approved your work" },
        ]} />

        <Grid cols={2}>
          <ChartCard title="Points by source" period="Out of 100" figure={s.score} foot="Every part is checked by Colatch. Nobody can buy it.">
            {s.score > 0 ? <Split label="Colatch Score points by source" parts={s.parts.map((p) => ({ label: p.label, n: p.points }))} /> : <p className="hint" style={{ margin: 0 }}>No points yet. Your first verified live post adds points here.</p>}
          </ChartCard>
          <ChartCard title={prog.nxt ? `Progress to ${prog.nxt.tier}` : "Top tier reached"} period={`${prog.cur.tier} tier`} figure={prog.nxt ? `${prog.pct}%` : "100%"}
            foot={prog.nxt ? `${prog.gap} ${prog.gap === 1 ? "point" : "points"} more and you unlock: ${prog.nxt.perk}` : "Icon creators see every new brief 24 hours early."}>
            <TierBar s={s} />
          </ChartCard>
        </Grid>

        <Card tone="night" pad="lg">
          <div className="row" style={{ gap: 14, alignItems: "flex-start", flexWrap: "nowrap" }}>
            <span style={{ fontSize: 22, lineHeight: 1, color: "var(--gold-2)" }} aria-hidden="true">♛</span>
            <div><b>{SCORE_RULE}</b><div style={{ marginTop: 6, fontSize: 14, color: "var(--ui-on-night-2)" }}>Your score is built from things Colatch has checked: posts we verified live, brands signing off your work, their star ratings and how often you go live on time. Nobody can buy it, and it goes up every time you deliver.</div></div>
          </div>
        </Card>

        <Section id="tiers" title="The four tiers" sub={`You're ${s.tier}${prog.nxt ? `; ${prog.nxt.tier} starts at ${prog.nxt.min} points` : ""}.`}>
          <div className="ladder">
            {TIERS.map((t, i) => (
              <div key={t.tier} className={`step${i === idx ? " on" : ""}${i < idx ? " done" : ""}`}>
                {i === idx && <span className="you">YOU</span>}
                <TierBadge tier={t.tier} />
                <div className="min">{t.min === 0 ? "Start" : `${t.min}+ points`}</div>
                <p>{t.perk}</p>
              </div>
            ))}
          </div>
        </Section>

        <Grid aside={<>
          <AsideCard eyebrow="Unlocked" title="Your perks right now">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{s.perks.map((p) => <li key={p}>{p}</li>)}</ul>
          </AsideCard>
          <AsideCard eyebrow="Share" title="Show it off">
            <p style={{ margin: 0, color: "var(--ink-2)" }}>Your tier is on your <a className="link" href={`/m/${c.handle}`}>media kit</a> and your <a className="link" href="/creator/earnings#flex">flex card</a>. Post the card on your story: every creator who joins with your code and finishes a paid deal earns you ₹500.</p>
          </AsideCard>
        </>}>
          <Section id="parts" title={`Where your ${s.score} points come from`} sub="What each part counts and how to raise it.">
            <Card>
              {s.parts.map((p) => (
                <div key={p.label} className="part">
                  <div className="h"><b>{p.label}</b><span className="muted">{p.points} / {p.max}</span></div>
                  <div className="meterbar"><i style={{ width: `${p.max ? Math.round((p.points / p.max) * 100) : 0}%` }} /></div>
                  <div className="pts-how">{p.how}</div>
                </div>
              ))}
            </Card>
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
