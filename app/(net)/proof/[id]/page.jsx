import { notFound } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { compact } from "@/lib/net/creators";

// Public proof of work: only exists once the brand signed off and allowed it to be shown.
async function load(id) {
  return env.DB.prepare(
    `SELECT d.id, d.brand, d.deliverable, d.post_url, d.live_at, d.actual_views, d.likes, d.comments, d.brand_signoff_at, d.pay_status,
            c.name, c.handle, c.profile_pic, c.verified, c.owner_verified,
            (SELECT stars FROM ratings r WHERE r.deal_id = d.id AND r.by_side = 'brand') AS stars
     FROM creator_deals d JOIN creators c ON c.id = d.creator_id WHERE d.id = ? AND d.proof_public = 1 AND d.brand_signoff_at IS NOT NULL`
  ).bind(String(id)).first();
}

export async function generateMetadata({ params }) {
  const d = await load(params.id).catch(() => null);
  if (!d) return { title: "Proof not found · Colatch" };
  return { title: `Verified work · ${d.name || d.handle} × ${d.brand} · Colatch` };
}

export default async function Page({ params }) {
  const d = await load(params.id);
  if (!d) notFound();
  const name = d.name || d.handle;
  return (
    <PublicShell mode="client">
      <div className="wrap narrow" style={{ padding: 0 }}>
        <div className="panel pad" style={{ textAlign: "center", padding: "34px 26px" }}>
          <div className="lbl" style={{ color: "var(--good)" }}>✓ Verified by Colatch</div>
          {d.profile_pic && <img src={d.profile_pic} alt="" style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", margin: "18px auto 0" }} />}
          <h1 style={{ margin: "14px 0 4px", fontWeight: 300, fontSize: 30, color: "var(--p900)" }}>{name} × <b style={{ fontWeight: 600 }}>{d.brand}</b></h1>
          <p className="muted" style={{ margin: 0 }}>@{d.handle} · {d.deliverable || "Campaign"} · live {String(d.live_at).slice(0, 10)}</p>
          <div className="grid3" style={{ marginTop: 24, textAlign: "left" }}>
            <div className="panel kpi" style={{ boxShadow: "none" }}><div className="k">Views</div><div className="v">{compact(d.actual_views)}</div></div>
            <div className="panel kpi" style={{ boxShadow: "none" }}><div className="k">Engagement</div><div className="v">{compact((d.likes || 0) + (d.comments || 0))}</div></div>
            <div className="panel kpi" style={{ boxShadow: "none" }}><div className="k">Brand rating</div><div className="v">{d.stars ? "★".repeat(d.stars) : "—"}</div></div>
          </div>
          <ul style={{ textAlign: "left", margin: "22px 0 0", paddingLeft: 20, lineHeight: 1.8, color: "var(--ink-2)" }}>
            <li>The brand approved the draft and signed off the final post on {String(d.brand_signoff_at).slice(0, 10)}.</li>
            <li>The post was checked live by the Colatch team.</li>
            <li>{d.pay_status === "paid" ? "The creator was paid through Colatch." : "Payment is handled through Colatch."}</li>
            {d.owner_verified ? <li>The creator proved they own @{d.handle}.</li> : null}
          </ul>
          <div className="row" style={{ justifyContent: "center", marginTop: 22 }}>
            {d.post_url && <a className="btn" href={d.post_url} target="_blank" rel="noopener">See the post ↗</a>}
            <a className="btn-foil" href="/brief">Work with {name.split(" ")[0]} →</a>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
