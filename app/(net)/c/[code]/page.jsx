import { notFound } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { flexData, cleanCode } from "@/lib/net/flex";
import { PageHeader, Grid, Section, Card, Avatar } from "@/components/ui";
import { TierMark } from "@/components/creator/Parts";
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
    <PageHeader variant="hero" eyebrow={`${f.ownerType === "creator" ? "Personal invite" : "Invite"} · code ${f.code}`}
      title={f.ownerType === "creator" ? `${first} thinks you belong <b>on Colatch.</b>` : `${f.name} invited you <b>to Colatch.</b>`}
      sub="Paid brand deals made for what you do. Free to join, and you choose what to apply for."
      actions={<><a className="btn-foil" href={`/r/${f.code}?to=join`}>Join with code {f.code} →</a><a className="cr-herolink" href={`/r/${f.code}?to=brief`}>I'm a brand →</a></>}
      meta={f.ownerType === "creator" ? [{ label: "Deals delivered", value: f.delivered }, { label: "Brand rating", value: f.rating != null ? `★ ${f.rating}` : "New" }, { label: "Colatch Score", value: f.score }] : undefined} />
  );
  return (
    <PublicShell hero={hero}>
      <div className="cr-page cr-own-cta">
        <Grid aside={<a className="cr-invitecard" href={`/c/${f.code}/card`} target="_blank" rel="noopener"><img src={`/c/${f.code}/card`} alt={`${f.name}'s Colatch card with code ${f.code}`} width={1080} height={1920} /></a>}>
          {f.ownerType === "creator" && (
            <Card>
              <div className="cr-scorecard__row">
                <Avatar name={f.name} size={52} />
                <div style={{ minWidth: 0 }}>
                  <h2 className="cr-h3" style={{ margin: 0 }}>{f.name}{f.handle ? <span className="muted" style={{ fontWeight: 400 }}> · @{f.handle}</span> : null}</h2>
                  <div style={{ marginTop: 6 }}>{f.tier && <TierMark tier={f.tier} />}</div>
                </div>
              </div>
              {f.handle && <p className="small muted" style={{ margin: "14px 0 0" }}>See {first}'s verified work on their <a className="link" href={`/m/${f.handle}`}>media kit</a>.</p>}
            </Card>
          )}
          <Section id="gets" title="What you get on Colatch">
            <div className="cr-gets">{GETS.map(([b, s], i) => <div key={b} className="cr-get"><span className="cr-get__n">{String(i + 1).padStart(2, "0")}</span><b>{b}</b><span>{s}</span></div>)}</div>
          </Section>
          <div className="note info">
            Joining with {f.code} costs you nothing. {f.ownerType === "creator" ? `${first} gets ₹${REF.creatorBonus} from Colatch after your first paid deal, so they have every reason to help you land it.` : "Colatch never charges creators to join or apply."}
          </div>
        </Grid>
      </div>
    </PublicShell>
  );
}
