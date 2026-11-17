import { notFound } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { compact } from "@/lib/net/creators";
import { safeUrl } from "@/lib/net/guard";
import { PageHeader, KpiStrip, Grid, Section, Card, AsideCard, Avatar } from "@/components/ui";
import { day } from "@/components/team/labels";

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
  if (!d) notFound();
  const who = d.name || d.handle;
  return {
    title: `Verified work: ${who} × ${d.brand}`,
    description: `${who} (@${d.handle}) made ${d.deliverable || "a post"} for ${d.brand}. Checked live by Colatch and signed off by the brand${d.actual_views ? `, ${compact(d.actual_views)} views` : ""}.`,
    alternates: { canonical: `/proof/${d.id}` },
  };
}

export default async function Page({ params }) {
  const d = await load(params.id);
  if (!d) notFound();
  const name = d.name || d.handle;
  const pic = safeUrl(d.profile_pic);
  const post = safeUrl(d.post_url);
  const hero = (
    <PageHeader variant="hero" eyebrow="✓ Verified by Colatch" title={`${name.replace(/[<>&]/g, "")} × <b>${String(d.brand || "").replace(/[<>&]/g, "")}</b>`}
      sub={`@${d.handle} · ${d.deliverable || "Campaign"} · live ${day(d.live_at) || String(d.live_at).slice(0, 10)}`} />
  );
  return (
    <PublicShell mode="client" hero={hero}>
      <div className="v2b v2b-own-cta">
        <KpiStrip label="Results" items={[
          { label: "Views", value: compact(d.actual_views), foot: "checked by Colatch" },
          { label: "Engagement", value: compact((d.likes || 0) + (d.comments || 0)), foot: "likes + comments" },
          { label: "Brand rating", value: d.stars ? "★".repeat(d.stars) : "—", foot: d.stars ? `${d.stars} of 5` : "not rated" },
        ]} />
        <Grid aside={
          <AsideCard eyebrow="Book this creator" title={`Work with ${name.split(" ")[0]}`} foot={<a href="/pitches">See creator ideas</a>}>
            <div className="v2b-by v2b-by--top">{pic ? <Avatar name={name} src={pic} size={56} /> : <Avatar name={name} size={56} />}<div><b>{name}</b><span className="hint">@{d.handle}</span></div></div>
            <div className="v2b-acts">
              <a className="btn-foil" href="/brief">Work with {name.split(" ")[0]} →</a>
              {post && <a className="btn" href={post} target="_blank" rel="noopener noreferrer nofollow">See the post ↗</a>}
            </div>
          </AsideCard>
        }>
          <Section id="checks" title="What Colatch checked" sub="This page exists only because the brand signed off and allowed it to be shown.">
            <Card pad="lg">
              <ul className="v2b-checks">
                <li>The brand approved the draft and signed off the final post on {day(d.brand_signoff_at) || String(d.brand_signoff_at).slice(0, 10)}.</li>
                <li>The post was checked live by the Colatch team.</li>
                <li>{d.pay_status === "paid" ? "The creator was paid through Colatch." : "Payment is handled through Colatch."}</li>
                {d.owner_verified ? <li>The creator proved they own @{d.handle}.</li> : null}
              </ul>
            </Card>
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
