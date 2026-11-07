import { notFound, redirect } from "next/navigation";
import PublicShell, { Hero } from "../../_ui/PublicShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { compact, inr } from "@/lib/net/creators";

// #81 A brand's private roster of favourite creators. Any of the brand's shortlist links opens it.
export const metadata = { title: "My creator roster · Colatch", robots: { index: false } };

async function brandFor(token) {
  const t = String(token || "");
  if (t.length < 16) return null;
  const k = await env.DB.prepare("SELECT id, slug, client_email, client_company, brand FROM campaigns WHERE share_token=?").bind(t).first();
  return k && k.client_email ? { ...k, email: String(k.client_email).toLowerCase() } : null;
}

async function remove(f) {
  "use server";
  const token = String(f.get("token") ?? "");
  const b = await brandFor(token);
  if (!b) notFound();
  await env.DB.prepare("DELETE FROM brand_roster WHERE brand_email=? AND creator_id=?").bind(b.email, String(f.get("creator") ?? "")).run();
  redirect(flashUrl(`/roster/${encodeURIComponent(token)}`, "ok", "Removed from your roster."));
}

async function note(f) {
  "use server";
  const token = String(f.get("token") ?? "");
  const b = await brandFor(token);
  if (!b) notFound();
  await env.DB.prepare("UPDATE brand_roster SET note=? WHERE brand_email=? AND creator_id=?").bind(String(f.get("note") ?? "").trim().slice(0, 300) || null, b.email, String(f.get("creator") ?? "")).run();
  redirect(flashUrl(`/roster/${encodeURIComponent(token)}`, "ok", "Note saved."));
}

const CSS = `.pg-roster .card-r{display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:16px;align-items:center}
.pg-roster .card-r .lbl{margin-bottom:2px}
@media(max-width:760px){.pg-roster .card-r{grid-template-columns:1fr 1fr}}`;

export default async function Page({ params, searchParams }) {
  const b = await brandFor(params.token);
  if (!b) notFound();
  const rows = (await env.DB.prepare(
    `SELECT r.creator_id, r.note, r.created_at, c.name, c.handle, c.city, c.followers, c.profile_pic,
       (SELECT d.actual_views FROM creator_deals d JOIN campaigns k ON k.id=d.campaign_id WHERE d.creator_id=r.creator_id AND LOWER(k.client_email)=r.brand_email AND d.live_at IS NOT NULL ORDER BY d.live_at DESC LIMIT 1) AS last_views,
       (SELECT d.fee FROM creator_deals d JOIN campaigns k ON k.id=d.campaign_id WHERE d.creator_id=r.creator_id AND LOWER(k.client_email)=r.brand_email AND d.live_at IS NOT NULL ORDER BY d.live_at DESC LIMIT 1) AS last_fee,
       (SELECT k.slug FROM creator_deals d JOIN campaigns k ON k.id=d.campaign_id WHERE d.creator_id=r.creator_id AND LOWER(k.client_email)=r.brand_email ORDER BY d.created_at DESC LIMIT 1) AS last_slug
     FROM brand_roster r JOIN creators c ON c.id=r.creator_id WHERE r.brand_email=? ORDER BY r.created_at DESC`
  ).bind(b.email).all()).results ?? [];
  const hero = (
    <Hero eyebrow={`My roster · ${b.client_company || b.brand || ""}`} title="Your <b>favourite creators</b>, one click from rebooking.">
      <p>Creators you saved from your shortlists. Rebook any of them through Colatch at our 12% repeat rate, with payment protection and a replacement guarantee.</p>
    </Hero>
  );
  return (
    <PublicShell mode="client" hero={hero}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pg-roster">
        <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>
        <p style={{ margin: "0 0 16px" }}><a className="link" href={`/shortlist/${encodeURIComponent(params.token)}`}>← Back to the shortlist</a></p>
        <div className="stack">
          {rows.map((r) => (
            <div key={r.creator_id} className="panel pad">
              <div className="card-r">
                <div className="who"><div className="ava" style={{ width: 48, height: 48 }}>{r.profile_pic ? <img src={r.profile_pic} alt="" /> : String(r.name || r.handle || "?").slice(0, 2).toUpperCase()}</div>
                  <div><b>{r.name || r.handle}</b><span>@{r.handle}{r.city ? ` · ${r.city}` : ""}</span></div></div>
                <div><div className="lbl">Followers</div><b>{compact(r.followers)}</b></div>
                <div><div className="lbl">Last result with you</div><b>{r.last_views ? `${compact(r.last_views)} views` : "Not booked yet"}</b>{r.last_views && r.last_fee ? <div className="hint">₹{(r.last_fee / r.last_views).toFixed(2)} per view · {inr(r.last_fee)}</div> : null}</div>
                <div className="row" style={{ gap: 8 }}>
                  <a className="btn sm plum" href={`/brief?${r.last_slug ? `again=${encodeURIComponent(r.last_slug)}&` : ""}creator=${encodeURIComponent(r.handle)}`}>Book again</a>
                  <form action={remove}><input type="hidden" name="token" value={params.token} /><input type="hidden" name="creator" value={r.creator_id} /><button className="btn sm">Remove</button></form>
                </div>
              </div>
              <form action={note} className="row" style={{ marginTop: 12 }}>
                <input type="hidden" name="token" value={params.token} /><input type="hidden" name="creator" value={r.creator_id} />
                <input className="in" name="note" style={{ flex: 1, minWidth: 200 }} placeholder="Private note (e.g. great with product demos)" defaultValue={r.note ?? ""} />
                <button className="btn sm">Save note</button>
              </form>
            </div>
          ))}
          {!rows.length && <div className="panel empty"><b>No saved creators yet.</b>Tap "Save to my roster" on any creator in your shortlist and they'll appear here.</div>}
        </div>
      </div>
    </PublicShell>
  );
}
