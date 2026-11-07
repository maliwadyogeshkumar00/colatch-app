import { redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { colatchScore, TIERS, SCORE_RULE } from "@/lib/net/score";
import { ScoreRing, TierBadge, TIER_STYLE } from "../../_ui/Score";

export const metadata = { title: "Your Colatch Score · Colatch", robots: { index: false } };

const CSS = `
.pg-score .ladder{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.pg-score .step{padding:18px;border-radius:16px;border:1px solid var(--line);background:var(--paper);position:relative}
.pg-score .step.on{box-shadow:0 0 0 2px var(--gold-2),var(--sh-2)}
.pg-score .step.done{opacity:.72}
.pg-score .step .min{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-4);font-weight:600;margin-top:10px}
.pg-score .step p{margin:6px 0 0;font-size:13.5px;color:var(--ink-2);line-height:1.5}
.pg-score .you{position:absolute;top:-10px;right:14px;background:var(--gold-foil);color:var(--purple-deep);font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:.06em}
.pg-score .bar{height:8px;border-radius:99px;background:rgba(31,21,36,.07);overflow:hidden;margin-top:8px}
.pg-score .bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#6A4A78,#C8962E)}
.pg-score .part{padding:14px 0;border-bottom:1px solid var(--line-2)}
.pg-score .part:last-child{border-bottom:0}
.pg-score .part .h{display:flex;justify-content:space-between;gap:12px;font-size:14.5px}
.pg-score .part .h b{font-weight:600}
.pg-score .part .how{font-size:12.5px;color:var(--ink-3);margin-top:6px}
.pg-score .rule{display:flex;gap:14px;align-items:flex-start;padding:18px 20px;border-radius:16px;background:linear-gradient(135deg,#2E1B36,#1E1128);color:#F4EFE3}
.pg-score .rule b{color:#F2D163}
@media(max-width:820px){.pg-score .ladder{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export default async function Page() {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/score");
  const c = me.creator;
  const s = await colatchScore(env, c.id);
  const idx = TIERS.findIndex((t) => t.tier === s.tier);

  const hero = (
    <section className="hero"><div className="hero-in">
      <div className="eb">Colatch Score</div>
      <div className="row" style={{ gap: 26, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        <ScoreRing score={s.score} tier={s.tier} size={120} />
        <div>
          <h1 style={{ margin: 0 }}>You're <b>{s.tier}.</b></h1>
          <p style={{ margin: "10px 0 0" }}>{s.next ? s.next.need : "That's the top. Brands see you first, you're paid fastest and every new brief reaches you a day early."}</p>
        </div>
      </div>
    </div></section>
  );

  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/score" hero={hero}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pg-score">
        <div className="rule">
          <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">♛</span>
          <div><b>{SCORE_RULE}</b><div style={{ marginTop: 6, fontSize: 14, color: "rgba(244,239,227,.78)" }}>Your score is built from things Colatch has checked: posts we verified live, brands signing off your work, their star ratings and how often you go live on time. Nobody can buy it, and it goes up every time you deliver.</div></div>
        </div>

        <div className="sec">
          <div className="h2">The four tiers</div>
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
        </div>

        <div className="sec grid2">
          <div className="panel pad">
            <h2>Where your {s.score} points come from</h2>
            {s.parts.map((p) => (
              <div key={p.label} className="part">
                <div className="h"><b>{p.label}</b><span className="muted">{p.points} / {p.max}</span></div>
                <div className="bar"><i style={{ width: `${p.max ? Math.round((p.points / p.max) * 100) : 0}%` }} /></div>
                <div className="how">{p.how}</div>
              </div>
            ))}
          </div>
          <div className="stack">
            <div className="panel pad">
              <h2>Your perks right now</h2>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{s.perks.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <div className="panel pad">
              <h2>Your Colatch record</h2>
              <div className="grid2" style={{ gap: 12 }}>
                <div className="kpi" style={{ padding: 0 }}><div className="k">Posts delivered</div><div className="v">{s.stats.delivered}</div></div>
                <div className="kpi" style={{ padding: 0 }}><div className="k">Brand rating</div><div className="v">{s.stats.rating != null ? `★ ${s.stats.rating}` : "–"}</div><div className="s">{s.stats.ratings} {s.stats.ratings === 1 ? "review" : "reviews"}</div></div>
                <div className="kpi" style={{ padding: 0 }}><div className="k">On time</div><div className="v">{s.stats.timed ? `${s.stats.onTime}/${s.stats.timed}` : "–"}</div></div>
                <div className="kpi" style={{ padding: 0 }}><div className="k">Brand sign-offs</div><div className="v">{s.stats.signoffs}</div></div>
              </div>
            </div>
            <div className="panel pad" style={{ background: TIER_STYLE[s.tier]?.bg?.startsWith("linear") ? "var(--paper)" : "var(--paper)" }}>
              <h2>Show it off</h2>
              <p style={{ margin: 0, color: "var(--ink-2)" }}>Your tier is on your <a className="link" href={`/m/${c.handle}`}>media kit</a> and your <a className="link" href="/creator/earnings#flex">flex card</a>. Post the card on your story: every creator who joins with your code and finishes a paid deal earns you ₹500.</p>
            </div>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
