import { notFound } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { flexData, cleanCode } from "@/lib/net/flex";
import { TierBadge } from "../../_ui/Score";
import { REF } from "@/lib/net/referral";

export async function generateMetadata({ params }) {
  const f = await flexData(env, params.code).catch(() => null);
  const code = cleanCode(params.code);
  const title = f ? (f.ownerType === "creator" ? `${f.name} invited you to Colatch` : `Join Colatch with ${f.name}`) : "Join Colatch";
  const description = "Paid brand deals that fit what you do. Free to join, brands are verified, and every payment goes through Colatch.";
  const image = `/c/${code}/card`;
  return {
    title: `${title} · Colatch`, description, robots: { index: false },
    openGraph: { title, description, images: [{ url: image, width: 1080, height: 1920 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const CSS = `
.pg-flex .wrapx{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:40px;align-items:start}
.pg-flex .card{width:100%;aspect-ratio:9/16;border-radius:22px;box-shadow:0 30px 60px -30px rgba(31,21,36,.55);display:block;background:#1E1128}
.pg-flex .gets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:22px}
.pg-flex .get{padding:18px;border-radius:14px;background:var(--paper);border:1px solid var(--line)}
.pg-flex .get b{display:block;color:var(--p900);font-size:15px}
.pg-flex .get span{font-size:13.5px;color:var(--ink-3)}
@media(max-width:820px){.pg-flex .wrapx{grid-template-columns:1fr}.pg-flex .card{max-width:320px;margin:0 auto}}
`;

const GETS = [
  ["Only briefs that fit you", "We match on what you do, your city, size and language. No spam."],
  ["Brands are verified", "Budgets are paid into Colatch before you start. No chasing payments."],
  ["Clear terms up front", "Pay, deliverables, revisions and usage rights are fixed before you apply."],
  ["Your Colatch Score", "Every verified deal raises it. Higher tiers get paid faster and see briefs first."],
];

export default async function Page({ params }) {
  const f = await flexData(env, params.code);
  if (!f) notFound();
  const first = String(f.name).split(" ")[0];
  const hero = (
    <section className="hero"><div className="hero-in">
      <div className="eb">{f.ownerType === "creator" ? "Personal invite" : "Invite"} · code {f.code}</div>
      <h1>{f.ownerType === "creator" ? <>{first} thinks you belong <b>on Colatch.</b></> : <>{f.name} invited you <b>to Colatch.</b></>}</h1>
      <p>Paid brand deals made for what you do. Free to join, and you choose what to apply for.</p>
      <div className="row" style={{ marginTop: 22, gap: 12 }}>
        <a className="btn-foil" href={`/r/${f.code}?to=join`}>Join with code {f.code} →</a>
        <a href={`/r/${f.code}?to=brief`} style={{ color: "rgba(244,239,227,.85)", fontSize: 14 }}>I'm a brand →</a>
      </div>
    </div></section>
  );
  return (
    <PublicShell hero={hero}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pg-flex">
        <div className="wrapx">
          <div>
            {f.ownerType === "creator" && (
              <div className="panel pad">
                <div className="row" style={{ gap: 12 }}>
                  <h2 style={{ margin: 0 }}>{f.name}{f.handle ? <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}> · @{f.handle}</span> : null}</h2>
                  {f.tier && <TierBadge tier={f.tier} size="sm" />}
                </div>
                <div className="grid3" style={{ marginTop: 16 }}>
                  <div className="kpi" style={{ padding: 0 }}><div className="k">Deals delivered</div><div className="v">{f.delivered}</div></div>
                  <div className="kpi" style={{ padding: 0 }}><div className="k">Brand rating</div><div className="v">{f.rating != null ? `★ ${f.rating}` : "New"}</div></div>
                  <div className="kpi" style={{ padding: 0 }}><div className="k">Colatch Score</div><div className="v">{f.score}</div></div>
                </div>
                {f.handle && <p className="small muted" style={{ margin: "14px 0 0" }}>See {first}'s verified work on their <a className="link" href={`/m/${f.handle}`}>media kit</a>.</p>}
              </div>
            )}
            <div className="gets">{GETS.map(([b, s]) => <div key={b} className="get"><b>{b}</b><span>{s}</span></div>)}</div>
            <div className="note info" style={{ marginTop: 18 }}>
              Joining with {f.code} costs you nothing. {f.ownerType === "creator" ? `${first} gets ₹${REF.creatorBonus} from Colatch after your first paid deal, so they have every reason to help you land it.` : "Colatch never charges creators to join or apply."}
            </div>
          </div>
          <img className="card" src={`/c/${f.code}/card`} alt={`${f.name}'s Colatch card with code ${f.code}`} width={1080} height={1920} />
        </div>
      </div>
    </PublicShell>
  );
}
