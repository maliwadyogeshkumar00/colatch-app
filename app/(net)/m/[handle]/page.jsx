import { notFound } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { compact, inr, erBand, creatorPlatforms } from "@/lib/net/creators";
import { formatAudience, audienceSourceLabel } from "@/lib/net/audience";
import { list } from "@/lib/net/match";
import { safeUrl } from "@/lib/net/guard";
import { colatchScore } from "@/lib/net/score";
import { Grid, Section, Card, AsideCard } from "@/components/ui";
import { ScoreRing, TierMark, Facts } from "@/components/creator/Parts";
import { AudienceBars, PlatformList } from "../../_ui/CreatorProfileFields";

// Public media kit, auto-built from the creator's Colatch profile. Only creators with a portal login get one.
const getCreator = (raw) => {
  const handle = decodeURIComponent(String(raw ?? "")).replace(/^@/, "").toLowerCase();
  return env.DB.prepare(`SELECT c.* FROM creators c JOIN creator_accounts a ON a.creator_id = c.id WHERE c.handle = ? AND c.status <> 'blacklisted' AND COALESCE(a.claim_status, 'own') <> 'pending'`).bind(handle).first();
};

export async function generateMetadata({ params }) {
  const c = await getCreator(params.handle).catch(() => null);
  const name = c ? c.name || c.handle : "Media kit";
  if (!c) notFound();
  return { title: `${name}: media kit`, description: String(c.bio_pitch || `${name} (@${c.handle}) on Colatch: rates, audience and brand-verified work.`).slice(0, 160), alternates: { canonical: `/m/${c.handle}` }, robots: { index: true } };
}

export default async function Page({ params }) {
  const c = await getCreator(params.handle);
  if (!c) notFound();
  const proofs = (await env.DB.prepare("SELECT d.id, d.brand, d.deliverable, d.actual_views, d.live_at FROM creator_deals d WHERE d.creator_id=? AND d.proof_public=1 AND d.brand_signoff_at IS NOT NULL ORDER BY d.live_at DESC LIMIT 12").bind(c.id).all()).results ?? [];
  const rate = await env.DB.prepare("SELECT AVG(r.stars) a, COUNT(*) n FROM ratings r JOIN creator_deals d ON d.id=r.deal_id WHERE r.by_side='brand' AND d.creator_id=?").bind(c.id).first();
  const done = (await env.DB.prepare("SELECT COUNT(*) n FROM creator_deals WHERE creator_id=? AND stage IN ('live','paid')").bind(c.id).first())?.n ?? 0;
  const b = erBand(c.engagement_rate, c.followers);
  const links = String(c.portfolio_links || "").split(/\s+/).map(safeUrl).filter(Boolean).slice(0, 6);
  const name = c.name || c.handle;
  // Uploaded work samples (lib/net/blob.ts). Only https URLs are rendered.
  const media = ((await env.DB.prepare("SELECT id, url, caption FROM creator_media WHERE creator_id=? ORDER BY created_at LIMIT 6").bind(c.id).all().catch(() => ({ results: [] }))).results ?? [])
    .map((m) => ({ ...m, url: safeUrl(m.url) })).filter((m) => m.url);
  const sc = await colatchScore(env, c.id);
  const aud = formatAudience(c.audience);
  // Other platforms: name and numbers only. Links and handles stay with the Colatch team, like contact details.
  const platforms = await creatorPlatforms(env, c.id);
  const tags = tagList([...list(c.skills), ...list(c.niche)]);
  const pic = safeUrl(c.profile_pic);
  const first = name.split(" ")[0];
  const hero = (
    <header className="cr-kit cr-own-cta">
      <div className="cr-kit__in">
        <p className="cr-kit__crumb">Colatch media kit{c.verified ? " · Instagram verified ✓" : ""}</p>
        <div className="cr-kit__top">
          <div className="cr-kit__pic">{pic ? <img src={pic} alt="" /> : <span aria-hidden="true">{String(name).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>}</div>
          <div className="cr-kit__id">
            <div className="cr-kit__badges"><span className="cr-kit__no">@{c.handle}</span><TierMark tier={sc.tier} /></div>
            <h1 className="cr-kit__name">{name}</h1>
            <p className="cr-kit__meta">{[c.city, c.language, done ? `${done} Colatch ${done === 1 ? "campaign" : "campaigns"}` : null].filter(Boolean).join(" · ")}</p>
            {c.bio_pitch && <p className="cr-kit__bio">{c.bio_pitch}</p>}
            {tags.length > 0 && <div className="cr-herotags">{tags.map((t, i) => <span key={t + i}>{t}</span>)}</div>}
          </div>
          <div className="cr-kit__cta"><a className="btn-foil" href="/brief">Book {first} through Colatch →</a><span>Availability confirmed in 2 working days</span></div>
        </div>
        <dl className="cr-kit__stats">
          <div><dt>Followers</dt><dd>{compact(c.followers)}</dd><p>{c.verified ? "From Instagram" : "Self-reported"}</p></div>
          <div><dt>Engagement</dt><dd>{c.engagement_rate != null ? `${c.engagement_rate}%` : "—"}</dd><p>{c.engagement_rate != null ? <span className={`pill ${b.tone}`}>{b.label}</span> : "Not measured yet"}</p></div>
          <div><dt>Avg reel views</dt><dd>{compact(c.avg_views)}</dd><p>{c.rate_reel && c.avg_views ? `≈ ₹${(c.rate_reel / c.avg_views).toFixed(2)} per view` : "Self-reported"}</p></div>
          <div><dt>Colatch campaigns</dt><dd>{done}</dd><p>{rate?.a ? "★ " + Number(rate.a).toFixed(1) + " from " + rate.n + (rate.n === 1 ? " brand" : " brands") : "completed"}</p></div>
        </dl>
      </div>
    </header>
  );
  return (
    <PublicShell mode="client" hero={hero}>
      <div className="cr-page">
        <Grid aside={<>
          <section className="ui-card ui-card--paper ui-aside" aria-labelledby="kit-score-h">
            <div className="ui-aside__head"><p className="ui-aside__eb">Colatch Score</p><h2 className="ui-aside__title" id="kit-score-h">{sc.tier} tier</h2></div>
            <div className="ui-aside__body">
              <div className="cr-scorecard__row"><ScoreRing score={sc.score} size={96} /><p className="cr-scorecard__next" style={{ margin: 0 }}>Built only from work Colatch verified: live posts, brand sign-offs, star ratings and on-time delivery. It can't be bought or self-reported.</p></div>
            </div>
          </section>
          <AsideCard eyebrow="Rates" title="Book this creator">
            <Facts className="cr-facts--num" rows={[
              { label: "1 Reel", value: <b>{c.rate_reel ? inr(c.rate_reel) : "On request"}</b> },
              { label: "1 Story", value: <b>{c.rate_story ? inr(c.rate_story) : "On request"}</b> },
              { label: "Product-only deals", value: c.open_to_barter ? "Open to it" : "Paid deals only" },
            ]} />
            <p className="hint" style={{ margin: "12px 0 0" }}>Creator's own rates. Bookings through Colatch: the creator is paid after the post is checked live, and every deal has written terms with ASCI ad-disclosure rules.</p>
          </AsideCard>
        </>}>
          <Section id="work" title="Best work" sub={links.length ? `${links.length} ${links.length === 1 ? "sample" : "samples"} picked by ${first}` : null}>
            {links.length ? <div className="cr-samples">{links.map((u, i) => <a key={u} className="cr-sample" href={u} target="_blank" rel="noopener noreferrer nofollow"><span className="cr-sample__n">{String(i + 1).padStart(2, "0")}</span><span>Sample {i + 1}</span><span aria-hidden="true">↗</span></a>)}</div> : <Card><p className="hint" style={{ margin: 0 }}>Samples on request. Ask through Colatch when you send a brief.</p></Card>}
          </Section>

          {media.length > 0 && <Section id="samples" title="Work samples">
            <div className="cr-media">{media.map((m) => (
              <figure key={m.id} className="panel" style={{ margin: 0, overflow: "hidden" }}>
                <div style={{ aspectRatio: "4 / 5", overflow: "hidden" }}><img src={m.url} alt={m.caption || `Work sample by ${name}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
                {m.caption && <figcaption className="small muted" style={{ padding: "10px 14px" }}>{m.caption}</figcaption>}
              </figure>
            ))}</div>
          </Section>}

          {(aud || platforms.length > 0) && <Grid cols={aud && platforms.length > 0 ? 2 : undefined}>
            {aud && <section className="panel pad aud-card" aria-labelledby="aud-h">
              <h2 id="aud-h">Audience</h2>
              <p className="aud-src">{audienceSourceLabel(c)}</p>
              <AudienceBars aud={aud} />
            </section>}
            {platforms.length > 0 && <section className="panel pad" aria-labelledby="pf-h">
              <h2 id="pf-h">Also on</h2>
              <PlatformList platforms={platforms} />
              <p className="hint" style={{ margin: "12px 0 0" }}>Self-reported by the creator. Book any platform through Colatch.</p>
            </section>}
          </Grid>}

          {proofs.length > 0 && <Section id="proof" title="Brand-verified work" sub="Signed off by the brand on Colatch.">
            <div className="cr-briefs">{proofs.map((p) => <a key={p.id} className="opp" href={`/proof/${p.id}`} style={{ padding: "16px 18px" }}><div className="br">✓ Verified</div><h3 style={{ fontSize: 16 }}>{p.brand}</h3><div className="facts"><span>{p.deliverable}</span><span><b>{compact(p.actual_views)}</b> views</span></div></a>)}</div>
          </Section>}

          <Card tone="night" pad="lg">
            <h2 className="cr-kit__ask">Want {first} for your brand?</h2>
            <p style={{ margin: "8px 0 16px", color: "var(--ui-on-night-2)" }}>Send a brief and Colatch will confirm availability within 2 working days.</p>
            <a className="btn" href="/brief">Send a brief →</a>
          </Card>
        </Grid>
      </div>
    </PublicShell>
  );
}

/** Sentence case, no repeats, and no generic "Creator" tag once a specific type is set. */
function tagList(raw) {
  const seen = new Set();
  const out = raw.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  return out.length > 1 ? out.filter((t) => t.toLowerCase() !== "creator") : out;
}
