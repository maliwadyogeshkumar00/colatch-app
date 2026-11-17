import { redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { PageHeader, Grid, Section, Card, AsideCard } from "@/components/ui";
import { Facts } from "@/components/brand/Facts";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { currentBrand, revokeSessions, startBrandSession } from "@/lib/net/creatorAuth";
import { verifyPassword } from "@/lib/net/auth";
import { audit } from "@/lib/net/security";
import { setPassword, overLimit, clientIp, TOO_MANY } from "../../reset/_lib";
import { clean, cleanPhone, cleanGstin, cleanWebsite, sendBrandVerify } from "../_lib";

export const metadata = { title: "Brand settings", robots: { index: false } };
export const dynamic = "force-dynamic";
const BACK = "/brand/settings";

async function me() {
  const b = await currentBrand();
  if (!b) redirect("/brand/login?next=/brand/settings");
  return b;
}

async function saveProfile(fd) {
  "use server";
  const b = await me();
  const name = clean(fd.get("name")), company = clean(fd.get("company"), 160);
  const phone = cleanPhone(fd.get("phone")), website = cleanWebsite(fd.get("site")), gstin = cleanGstin(fd.get("gstin"));
  if (!name) redirect(flashUrl(BACK, "err", "Enter your name."));
  if (!company) redirect(flashUrl(BACK, "err", "Enter your company or brand name."));
  if (phone === false) redirect(flashUrl(BACK, "err", "Enter a 10-digit Indian mobile number, or leave phone empty."));
  if (website === false) redirect(flashUrl(BACK, "err", "Enter a website like yourbrand.com, or leave it empty."));
  if (gstin === false) redirect(flashUrl(BACK, "err", "That GSTIN doesn't look right. It has 15 characters, like 27ABCDE1234F1Z5."));
  await env.DB.prepare("UPDATE brand_accounts SET name=?, company=?, phone=?, website=?, gstin=? WHERE id=?").bind(name, company, phone, website, gstin, b.id).run();
  await audit({ kind: "brand", id: b.id }, "brand.profile_updated", "brand_account", b.id);
  redirect(flashUrl(BACK, "ok", "Saved."));
}

async function changePassword(fd) {
  "use server";
  const b = await me();
  if (await overLimit(`brandpw|${b.id}|${clientIp()}`)) redirect(flashUrl(BACK, "err", TOO_MANY));
  const row = await env.DB.prepare("SELECT password_hash, salt FROM brand_accounts WHERE id=?").bind(b.id).first();
  if (!row || !(await verifyPassword(String(fd.get("current") ?? ""), row.password_hash, row.salt))) redirect(flashUrl(BACK, "err", "Your current password is wrong."));
  const pw = String(fd.get("password") ?? "");
  if (pw !== String(fd.get("confirm") ?? "")) redirect(flashUrl(BACK, "err", "The two new passwords don't match."));
  const err = await setPassword("brand", b.id, pw); // also signs out every other device
  if (err) redirect(flashUrl(BACK, "err", err));
  await audit({ kind: "brand", id: b.id }, "brand.password_changed", "brand_account", b.id);
  await startBrandSession(b.id); // keep this device signed in
  redirect(flashUrl(BACK, "ok", "Password changed. Other devices are signed out."));
}

async function signOutEverywhere() {
  "use server";
  const b = await me();
  await revokeSessions("brand", b.id);
  await audit({ kind: "brand", id: b.id }, "brand.sessions_revoked", "brand_account", b.id);
  redirect(flashUrl("/brand/login", "ok", "Signed out on every device."));
}

async function resend() {
  "use server";
  const b = await me();
  if (b.verified) redirect(flashUrl(BACK, "ok", "Your email is already confirmed."));
  if ((await overLimit(`verify|brand:${b.id}`)) || (await overLimit(`verify|${clientIp()}`))) redirect(flashUrl(BACK, "err", "Too many requests. Try again in 15 minutes."));
  const status = await sendBrandVerify(b);
  await audit({ kind: "brand", id: b.id }, "brand.verify_requested", "brand_account", b.id, { email_status: status });
  redirect(flashUrl(BACK, status === "sent" ? "ok" : "err", status === "sent"
    ? `We sent a confirmation link to ${b.email}.`
    : "We couldn't send the email right now. Write to marketing@colatch.com from this address and the team will confirm it."));
}

export default async function Page({ searchParams }) {
  const b = await me();
  const a = await env.DB.prepare("SELECT name, company, phone, website, gstin, verified_by FROM brand_accounts WHERE id=?").bind(b.id).first();
  const hero = (
    <PageHeader variant="hero" crumbs={[{ label: "My campaigns", href: "/brand" }, { label: "Settings" }]}
      eyebrow={a?.company || b.company || "Your brand"} title="Settings" sub="Your details for invoices, your sign-in and the devices you're signed in on." />
  );
  return (
    <PublicShell mode="client" brandName={b.name || b.email} path="/brand/settings" hero={hero}>
      <div className="v2b v2b-own-cta">
        <div className="v2b-flash"><Flash sp={searchParams} /></div>
        <Grid aside={<>
          <AsideCard eyebrow="Account" title={a?.company || b.company || "Your brand"} foot={<><a href="/brand">My campaigns</a><a href="/faq">FAQ</a></>}>
            <Facts label="Account status" items={[
              { label: "Email", value: b.email },
              { label: "Email status", value: b.verified ? "Confirmed" : "Not confirmed" },
              { label: "Brand check", value: a?.verified_by ? "Verified by Colatch" : "Not yet verified" },
              { label: "GSTIN", value: a?.gstin || "Not added" },
            ]} />
          </AsideCard>
          <AsideCard tone="night" eyebrow="Why it matters" title="Verified brands get more applicants">
            <p className="small">A confirmed email links the briefs you sent from it. Add your website and GSTIN so the Colatch team can verify your brand and invoice you correctly.</p>
          </AsideCard>
        </>}>
          <Section id="email" title="Email" sub="Briefs sent from this address show up in your campaigns once it's confirmed.">
            <Card>
              <p className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap", margin: 0 }}>
                <span>{b.email}</span>
                {b.verified ? <span className="pill good">Confirmed</span> : <span className="pill ok">Not confirmed</span>}
                {a?.verified_by && <span className="pill mine">Brand verified by Colatch</span>}
              </p>
              {!b.verified && <form action={resend} style={{ marginTop: 12 }}>
                <p className="hint">Confirm your email to see campaigns you've sent from it.</p>
                <button className="btn plum" style={{ minHeight: 44 }}>Send confirmation link</button>
              </form>}
            </Card>
          </Section>

          <Section id="profile" title="Your details" sub="Used on your shortlists and invoices.">
            <Card>
              <form action={saveProfile} aria-label="Your details">
                <div className="form-grid">
                  <div className="fld"><label htmlFor="f-bs-name">Your name</label><input id="f-bs-name" name="name" required maxLength={120} defaultValue={a?.name ?? ""} autoComplete="name" /></div>
                  <div className="fld"><label htmlFor="f-bs-company">Company or brand</label><input id="f-bs-company" name="company" required maxLength={160} defaultValue={a?.company ?? ""} autoComplete="organization" /></div>
                  <div className="fld"><label htmlFor="f-bs-phone">Phone <span className="opt">— optional</span></label><input id="f-bs-phone" name="phone" type="tel" defaultValue={a?.phone ?? ""} autoComplete="tel" /></div>
                  <div className="fld"><label htmlFor="f-bs-site">Website <span className="opt">— optional</span></label><input id="f-bs-site" name="site" defaultValue={a?.website ?? ""} placeholder="yourbrand.com" autoComplete="url" /></div>
                  <div className="fld"><label htmlFor="f-bs-gstin">GSTIN <span className="opt">— optional, for invoices</span></label><input id="f-bs-gstin" name="gstin" maxLength={15} defaultValue={a?.gstin ?? ""} style={{ textTransform: "uppercase" }} /></div>
                </div>
                <button className="btn-foil" style={{ marginTop: 18 }}>Save details</button>
              </form>
            </Card>
          </Section>

          <Section id="password" title="Change password" sub="Changing it signs you out on every other device.">
            <Card>
              <form action={changePassword} aria-label="Change password">
                <div className="stack">
                  <div className="fld"><label htmlFor="f-bs-current">Current password</label><input id="f-bs-current" name="current" type="password" required autoComplete="current-password" /></div>
                  <div className="fld"><label htmlFor="f-bs-new">New password <span className="opt">— at least 10 characters</span></label><input id="f-bs-new" name="password" type="password" required minLength={10} autoComplete="new-password" /></div>
                  <div className="fld"><label htmlFor="f-bs-confirm">Type it again</label><input id="f-bs-confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" /></div>
                </div>
                <button className="btn plum" style={{ marginTop: 18, minHeight: 44 }}>Change password</button>
              </form>
            </Card>
          </Section>

          <Section id="out" title="Signed in somewhere else?" sub="Signs you out on every phone and computer, including this one.">
            <Card>
              <form action={signOutEverywhere}>
                <button className="btn" style={{ minHeight: 44 }}>Sign out everywhere</button>
              </form>
            </Card>
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
