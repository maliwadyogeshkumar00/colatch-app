import "../net.css";
import Brand from "./_ui/Brand";
import FormGuard from "@/components/FormGuard";

export const dynamic = "force-dynamic";

const SITE = (process.env.SITE_URL || "https://colatch-app.vercel.app").replace(/\/$/, "");
const DESC = "Colatch Connect matches brands with Indian creators on talent, city, size and language. Brands post a brief and approve a shortlist; creators are paid after the post is checked live.";

// Pages set their own title; this adds " · Colatch" and the Connect defaults (the celebrity matchmaker at / keeps its own).
export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Colatch Connect: brand deals with Indian creators", template: "%s · Colatch" },
  description: DESC,
  applicationName: "Colatch Connect",
  openGraph: { type: "website", siteName: "Colatch Connect", title: "Colatch Connect: brand deals with Indian creators", description: DESC, locale: "en_IN", url: SITE },
  twitter: { card: "summary", title: "Colatch Connect", description: DESC },
};

// Organization structured data, the same on every Connect page.
const ORG_LD = JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "Colatch", url: "https://colatch.com", email: "marketing@colatch.com", description: DESC }).replace(/</g, "\\u003c");

export default function NetLayout({ children }) {
  return (
    <div className="net">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ORG_LD }} />
      <Brand />
      <FormGuard />
      {children}
    </div>
  );
}
