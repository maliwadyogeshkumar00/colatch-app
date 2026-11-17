// Not found, inside Colatch Connect: shown for a wrong or expired shortlist, receipt, media kit or deal link.
import PublicShell from "./_ui/PublicShell";
import { PageHeader, Grid, Card, KpiStrip } from "@/components/ui";
import { env } from "@/lib/net/env";

export const metadata = { title: "Link not found", robots: { index: false } };

const PATHS = [
  { href: "/creator", eyebrow: "Creators", title: "I'm a creator", body: "Your home, deals and earnings. Log in if you're asked to.", cta: "Go to my home" },
  { href: "/brief", eyebrow: "Brands", title: "I'm a brand", body: "Post a brief, or log in to see every campaign you've sent.", cta: "Post a brief" },
  { href: "/team", eyebrow: "Colatch team", title: "I work at Colatch", body: "The team desk: campaigns, deals, money and creators.", cta: "Open the team desk" },
];

export default async function NotFound() {
  // Read-only: what is open on Colatch right now, so a dead link still leads somewhere real. A failure hides the strip.
  const one = (sql) => env.DB.prepare(sql).first().then((r) => Number(r?.n ?? 0)).catch(() => null);
  const [briefs, ideas, creators] = await Promise.all([
    one("SELECT COUNT(*) n FROM campaigns WHERE status='open'"),
    one("SELECT COUNT(*) n FROM creator_pitches WHERE status='live'"),
    one("SELECT COUNT(*) n FROM creators WHERE status <> 'blacklisted'"),
  ]);
  const live = [
    briefs != null && { label: "Open briefs", value: briefs, foot: "creators can apply now", href: "/creator" },
    ideas != null && { label: "Creator ideas", value: ideas, foot: "ready to book on the idea board", href: "/pitches" },
    creators != null && { label: "Creators", value: creators, foot: "in the Colatch network", href: "/brief" },
  ].filter(Boolean);
  return (
    <PublicShell mode="client" hero={<PageHeader variant="hero" eyebrow="Link not found" title="This link doesn't open <b>anything here.</b>"
      sub="It may be old, mistyped, or for a campaign that was closed. If someone sent it to you, ask them for a fresh link." />}>
      <div className="v2b">
        {live.length > 0 && <div className="v2b-nf-live"><p className="v2b-path__eb">Live on Colatch right now</p><KpiStrip label="Live on Colatch right now" items={live} /></div>}
        <Grid cols={3}>
          {PATHS.map((x) => (
            <Card key={x.href} className="v2b-path">
              <p className="v2b-path__eb">{x.eyebrow}</p>
              <h2 className="v2b-path__t">{x.title}</h2>
              <p className="v2b-path__b">{x.body}</p>
              <a className={x.href === "/creator" ? "btn plum" : "btn"} href={x.href}>{x.cta} →</a>
            </Card>
          ))}
        </Grid>
        <p className="hint v2b-help">Private links (shortlists, receipts, resets) work only for the people they were sent to, and reset links expire. Still stuck? Write to marketing@colatch.com or read the <a className="link" href="/faq">FAQ</a>.</p>
      </div>
    </PublicShell>
  );
}
