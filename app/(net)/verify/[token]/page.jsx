import PublicShell from "../../_ui/PublicShell";
import { SplitAuth } from "@/components/ui";
import { BRAND_PANEL, ACCOUNT_PANEL } from "@/components/brand/AuthPanels";
import { consumeVerifyToken, audit } from "@/lib/net/security";
import { currentBrand } from "@/lib/net/creatorAuth";
import { linkCampaignsByEmail } from "../../brand/_lib";

// The token is in the URL: keep it out of Referer headers and search engines.
export const metadata = { title: "Confirm your email", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const raw = decodeURIComponent(String(params.token || ""));
  const who = await consumeVerifyToken(raw).catch(() => null); // single use
  let linked = 0;
  if (who) {
    await audit({ kind: who.user_kind, id: who.user_id }, `${who.user_kind}.email_verified`, who.user_kind === "brand" ? "brand_account" : "creator_account", who.user_id);
    if (who.user_kind === "brand") linked = await linkCampaignsByEmail(who.user_id);
  }
  const brand = who?.user_kind === "brand";
  const signedInBrand = brand ? await currentBrand() : null;
  const home = brand ? (signedInBrand ? "/brand" : "/brand/login") : "/creator";
  return (
    <PublicShell mode={brand ? "client" : "creator"} path="/verify" flush>
      <SplitAuth panel={brand ? BRAND_PANEL : ACCOUNT_PANEL} intro={who
        ? { eyebrow: "Email", title: "Email confirmed", sub: `${who.email} is confirmed for your Colatch ${brand ? "brand" : "creator"} account.` }
        : { eyebrow: "Email", title: "This link doesn't work any more", sub: "Confirmation links work once and expire after 48 hours. If you already confirmed, you're all set." }}>
        {who ? (
          <div className="v2b-auth-next">
            {brand && <p className="v2b-auth-lead">{linked > 0 ? `${linked} ${linked === 1 ? "brief" : "briefs"} you sent from this email ${linked === 1 ? "is" : "are"} now in your account.` : "Briefs you send from this email will show up in your account."}</p>}
            <a className="btn-foil" style={{ width: "100%", justifyContent: "center" }} href={home}>{brand ? (signedInBrand ? "Go to my campaigns" : "Log in") : "Go to my home"}</a>
          </div>
        ) : (
          <div className="v2b-auth-next">
            <p className="v2b-auth-lead">Need a new link? Log in and use “Send confirmation link” in Settings.</p>
            <div className="v2b-auth-links"><a className="btn" href="/brand/settings">Brand settings</a><a className="btn" href="/creator/settings">Creator settings</a></div>
          </div>
        )}
      </SplitAuth>
    </PublicShell>
  );
}
