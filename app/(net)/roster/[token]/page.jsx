import { notFound, redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { PageHeader, KpiStrip, Grid, Section, AsideCard, DataTable, Cell, Figure, Avatar } from "@/components/ui";
import { safeUrl } from "@/lib/net/guard";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { compact, inr } from "@/lib/net/creators";

// #81 A brand's private roster of favourite creators. Any of the brand's shortlist links opens it.
// Checked here as well as in the page: metadata runs before the page streams, so a bad link gets a real 404 status.
export async function generateMetadata({ params }) {
  if (!(await brandFor(params.token))) notFound();
  return { title: "My creator roster", robots: { index: false } };
}

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



export default async function Page({ params, searchParams }) {
  const b = await brandFor(params.token);
  if (!b) notFound();
  const rows = (await env.DB.prepare(
    `SELECT r.creator_id, r.note, r.created_at, c.name, c.handle, c.city, c.followers, c.profile_pic,
       (SELECT d.actual_views FROM creator_deals d JOIN campaigns k ON k.id=d.campaign_id WHERE d.creator_id=r.creator_id AND LOWER(k.client_email)=r.brand_email AND d.live_at IS NOT NULL ORDER BY d.live_at DESC LIMIT 1) AS last_views,
       (SELECT d.fee FROM creator_deals d JOIN campaigns k ON k.id=d.campaign_id WHERE d.creator_id=r.creator_id AND LOWER(k.client_email)=r.brand_email AND d.live_at IS NOT NULL ORDER BY d.live_at DESC LIMIT 1) AS last_fee,
       (SELECT k.share_token FROM creator_deals d JOIN campaigns k ON k.id=d.campaign_id WHERE d.creator_id=r.creator_id AND LOWER(k.client_email)=r.brand_email ORDER BY d.created_at DESC LIMIT 1) AS last_token
     FROM brand_roster r JOIN creators c ON c.id=r.creator_id WHERE r.brand_email=? ORDER BY r.created_at DESC`
  ).bind(b.email).all()).results ?? [];
  const booked = rows.filter((r) => r.last_views);
  const cpvs = booked.filter((r) => r.last_fee).map((r) => r.last_fee / r.last_views);
  const bestCpv = cpvs.length ? Math.min(...cpvs) : null;
  const hero = (
    <PageHeader variant="hero" crumbs={[{ label: "Your shortlist", href: `/shortlist/${encodeURIComponent(params.token)}` }, { label: "My roster" }]}
      eyebrow={`My roster${b.client_company || b.brand ? ` · ${b.client_company || b.brand}` : ""}`} title="Your <b>favourite creators</b>, one click from rebooking."
      sub="Creators you saved from your shortlists. Rebook any of them through Colatch at our 12% repeat rate, with payment protection and a replacement guarantee." />
  );
  const columns = [
    { key: "who", label: "Creator", render: (r) => (
      <div className="v2b-roster-who">
        <span className="v2b-who"><Avatar name={r.name || r.handle} src={safeUrl(r.profile_pic) || undefined} size={40} /><Cell title={r.name || r.handle} sub={`@${r.handle}${r.city ? ` · ${r.city}` : ""}`} /></span>
        <form action={note} className="v2b-note">
          <input type="hidden" name="token" value={params.token} /><input type="hidden" name="creator" value={r.creator_id} />
          <input className="in" name="note" aria-label={`Private note about ${r.name || r.handle}`} placeholder="Private note (e.g. great with product demos)" defaultValue={r.note ?? ""} />
          <button className="btn sm">Save note</button>
        </form>
      </div>
    ) },
    { key: "followers", label: "Followers", num: true, render: (r) => <Figure value={compact(r.followers)} /> },
    { key: "last", label: "Last result with you", num: true, render: (r) => (r.last_views ? <Figure value={`${compact(r.last_views)} views`} note={r.last_fee ? `₹${(r.last_fee / r.last_views).toFixed(2)} per view · ${inr(r.last_fee)}` : null} /> : <span className="hint">Not booked yet</span>) },
    { key: "book", label: "Rebook", labelHidden: true, primary: true, render: (r) => (
      <span className="v2b-row-acts">
        <a className="btn sm plum" href={`/brief?${r.last_token ? `again=${encodeURIComponent(r.last_token)}&` : ""}creator=${encodeURIComponent(r.handle)}`}>Book again</a>
        <form action={remove}><input type="hidden" name="token" value={params.token} /><input type="hidden" name="creator" value={r.creator_id} /><button className="btn sm">Remove</button></form>
      </span>
    ) },
  ];
  return (
    <PublicShell mode="client" hero={hero}>
      <div className="pg-roster v2b">
        <div className="v2b-flash"><Flash sp={searchParams} /></div>
        {rows.length > 0 && <KpiStrip label="Roster at a glance" items={[
          { label: "Saved creators", value: rows.length, foot: "from your shortlists" },
          { label: "Booked with you before", value: booked.length, foot: "with a live post" },
          { featured: true, label: "Best cost per view", value: bestCpv != null ? `₹${bestCpv.toFixed(2)}` : "—", foot: bestCpv != null ? "from your last results" : "shows after a live post" },
        ]} />}
        <Grid aside={<>
          <AsideCard tone="night" eyebrow="Repeat rate" title="Rebook at 12%" foot={<a href="/faq">What brands pay</a>}>
            <p className="small">Booking a creator you have already paid through Colatch is charged at 12% instead of the standard fee, with the same payment protection.</p>
          </AsideCard>
          <AsideCard eyebrow="Add creators" title="Save from any shortlist" foot={<a href={`/shortlist/${encodeURIComponent(params.token)}`}>← Back to the shortlist</a>}>
            <p className="small">Tap "Save to my roster" on a creator card in your shortlist and they appear here.</p>
          </AsideCard>
        </>}>
          <Section id="roster" title="Saved creators" sub={rows.length ? "Newest first. Notes are private to your brand." : undefined}>
            <DataTable caption="Saved creators" rows={rows} columns={columns} rowKey={(r) => r.creator_id}
              empty={{ title: "No saved creators yet.", body: "Tap \"Save to my roster\" on any creator in your shortlist and they'll appear here.", action: <a className="btn sm" href={`/shortlist/${encodeURIComponent(params.token)}`}>Open your shortlist</a> }} />
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
