import { notFound } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { compact, inr, erBand } from "@/lib/net/creators";
import { list } from "@/lib/net/match";

// Public media kit, auto-built from the creator's Colatch profile. Only creators with a portal login get one.
const getCreator = (raw) => {
  const handle = decodeURIComponent(String(raw ?? "")).replace(/^@/, "").toLowerCase();
  return env.DB.prepare(`SELECT c.* FROM creators c JOIN creator_accounts a ON a.creator_id = c.id WHERE c.handle = ? AND c.status <> 'blacklisted'`).bind(handle).first();
};

export async function generateMetadata({ params }) {
  const c = await getCreator(params.handle).catch(() => null);
  const name = c ? c.name || c.handle : "Media kit";
  return { title: `${name} · Media kit · Colatch`, description: c?.bio_pitch || `${name} on Colatch`, robots: { index: true } };
}

export default async function Page({ params }) {
  const c = await getCreator(params.handle);
  if (!c) notFound();
  const proofs = (await env.DB.prepare("SELECT d.id, d.brand, d.deliverable, d.actual_views, d.live_at FROM creator_deals d WHERE d.creator_id=? AND d.proof_public=1 AND d.brand_signoff_at IS NOT NULL ORDER BY d.live_at DESC LIMIT 12").bind(c.id).all()).results ?? [];
  const rate = await env.DB.prepare("SELECT AVG(r.stars) a, COUNT(*) n FROM ratings r JOIN creator_deals d ON d.id=r.deal_id WHERE r.by_side='brand' AND d.creator_id=?").bind(c.id).first();
  const done = (await env.DB.prepare("SELECT COUNT(*) n FROM creator_deals WHERE creator_id=? AND stage IN ('live','paid')").bind(c.id).first())?.n ?? 0;
  const b = erBand(c.engagement_rate, c.followers);
  const links = String(c.portfolio_links || "").split(/\s+/).filter((u) => /^https?:\/\//.test(u)).slice(0, 6);
  const name = c.name || c.handle;
  const hero = (
    <section className="hero"><div className="hero-in">
      <div className="eb">Colatch media kit{c.verified ? " · Instagram verified ✓" : ""}</div>
      <div className="row" style={{ gap: 20, marginTop: 16, flexWrap: "nowrap" }}>
        {c.profile_pic && <img src={c.profile_pic} alt="" style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(232,184,75,.6)" }} />}
        <div><h1 style={{ margin: 0 }}>{name}</h1><p style={{ margin: "8px 0 0" }}>@{c.handle}{c.city ? ` · ${c.city}` : ""}{c.language ? ` · ${c.language}` : ""}</p></div>
      </div>
      {c.bio_pitch && <p style={{ fontSize: 18, marginTop: 20 }}>{c.bio_pitch}</p>}
      <div className="row" style={{ marginTop: 16, gap: 8 }}>{[...list(c.skills), ...list(c.niche)].map((t, i) => <span key={t + i} className="tag" style={{ background: "rgba(255,255,255,.1)", color: "#F4EFE3" }}>{t}</span>)}</div>
    </div></section>
  );
  return (
    <PublicShell mode="client" hero={hero}>
      <div className="grid4">
        <div className="panel kpi"><div className="k">Followers</div><div className="v">{compact(c.followers)}</div><div className="s">{c.verified ? "From Instagram" : "Self-reported"}</div></div>
        <div className="panel kpi"><div className="k">Engagement</div><div className="v">{c.engagement_rate != null ? `${c.engagement_rate}%` : "—"}</div><div className="s">{c.engagement_rate != null ? <span className={`pill ${b.tone}`}>{b.label}</span> : "Not measured yet"}</div></div>
        <div className="panel kpi"><div className="k">Avg reel views</div><div className="v">{compact(c.avg_views)}</div><div className="s">{c.rate_reel && c.avg_views ? `≈ ₹${(c.rate_reel / c.avg_views).toFixed(2)} per view` : "Self-reported"}</div></div>
        <div className="panel kpi"><div className="k">Colatch campaigns</div><div className="v">{done}</div><div className="s">{rate?.a ? "★ " + Number(rate.a).toFixed(1) + " from " + rate.n + (rate.n === 1 ? " brand" : " brands") : "completed"}</div></div>
      </div>

      <div className="grid2 sec" style={{ alignItems: "start" }}>
        <div className="panel pad"><h2>Rates</h2>
          <table className="tbl"><tbody>
            <tr><td>1 Reel</td><td className="num"><b>{c.rate_reel ? inr(c.rate_reel) : "On request"}</b></td></tr>
            <tr><td>1 Story</td><td className="num"><b>{c.rate_story ? inr(c.rate_story) : "On request"}</b></td></tr>
            <tr><td>Product-only deals</td><td className="num">{c.open_to_barter ? "Open to it" : "Paid deals only"}</td></tr>
          </tbody></table>
          <p className="hint" style={{ margin: "12px 0 0" }}>Creator's own rates. Bookings through Colatch include payment protection and ASCI-compliant contracts.</p>
        </div>
        <div className="panel pad"><h2>Best work</h2>
          {links.length ? <div className="stack">{links.map((u, i) => <a key={u} className="btn" style={{ justifyContent: "space-between", width: "100%" }} href={u} target="_blank" rel="noopener"><span>Sample {i + 1}</span><span>↗</span></a>)}</div> : <p className="hint">Samples on request.</p>}
        </div>
      </div>

      {proofs.length > 0 && <div className="sec"><div className="h2">Brand-verified work</div><div className="grid3">{proofs.map((p) => <a key={p.id} className="opp" href={`/proof/${p.id}`} style={{ padding: "16px 18px" }}><div className="br">✓ Verified</div><h3 style={{ fontSize: 16 }}>{p.brand}</h3><div className="facts"><span>{p.deliverable}</span><span><b>{compact(p.actual_views)}</b> views</span></div></a>)}</div></div>}

      <div className="panel pad sec" style={{ textAlign: "center" }}>
        <h3 style={{ fontSize: 22, fontWeight: 300 }}>Want {name.split(" ")[0]} for your brand?</h3>
        <p className="muted">Send a brief and Colatch will confirm availability within 2 working days.</p>
        <a className="btn-foil" style={{ marginTop: 10 }} href="/brief">Book through Colatch →</a>
      </div>
    </PublicShell>
  );
}
