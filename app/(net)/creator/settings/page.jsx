import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import PublicShell from "../../_ui/PublicShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { currentCreator, startCreatorSession, revokeSessions, CREATOR_COOKIE } from "@/lib/net/creatorAuth";
import { audit, createVerifyToken } from "@/lib/net/security";
import { checkLogin, setPassword, overLimit, mailBase, clientIp, TOO_MANY } from "../../reset/_lib";
import { notify } from "@/lib/net/notify";
import { claimStatus, ClaimNote } from "../../join/_claim";
import { addressFromForm } from "@/lib/net/creators";
import { PageHeader, Grid, AsideCard } from "@/components/ui";
import { Facts } from "@/components/creator/Parts";

export const metadata = { title: "Account settings", robots: { index: false } };
const BACK = "/creator/settings";
const SHIP = "/creator/settings?at=shipping"; // the message then shows inside the shipping form, where the page lands

async function changePassword(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/settings");
  const row = await env.DB.prepare("SELECT id, password_hash, salt FROM creator_accounts WHERE id=?").bind(me.accountId).first();
  const res = await checkLogin("creator", me.email, String(fd.get("current") ?? ""), row);
  if (res === "blocked") redirect(flashUrl(BACK, "err", TOO_MANY));
  if (res !== "ok") redirect(flashUrl(BACK, "err", "Your current password is not right."));
  const pw = String(fd.get("password") ?? "");
  if (pw !== String(fd.get("confirm") ?? "")) redirect(flashUrl(BACK, "err", "The two new passwords don't match."));
  const err = await setPassword("creator", me.accountId, pw); // also signs out every other device
  if (err) redirect(flashUrl(BACK, "err", err));
  await audit({ kind: "creator", id: me.accountId }, "creator.password_changed", "creator_account", me.accountId);
  await startCreatorSession(me.accountId); // keep this device signed in
  redirect(flashUrl(BACK, "ok", "Password changed. Other devices are signed out."));
}

async function signOutEverywhere() {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login");
  await revokeSessions("creator", me.accountId);
  await audit({ kind: "creator", id: me.accountId }, "creator.signed_out_everywhere", "creator_account", me.accountId);
  cookies().delete(CREATOR_COOKIE);
  redirect(flashUrl("/creator/login", "ok", "Signed out on every device."));
}

async function resendVerify() {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/settings");
  const row = await env.DB.prepare("SELECT email, email_verified_at FROM creator_accounts WHERE id=?").bind(me.accountId).first();
  if (!row) redirect("/creator/login");
  if (row.email_verified_at) redirect(flashUrl(BACK, "ok", "Your email is already confirmed."));
  if ((await overLimit(`verify|${me.accountId}`)) || (await overLimit(`verify|${clientIp()}`))) redirect(flashUrl(BACK, "err", TOO_MANY));
  const vt = await createVerifyToken("creator", me.accountId, row.email);
  const status = await notify({ template: "verify_email", to: row.email, toKind: "creator", toId: me.creator?.id, payload: {}, dedupeKey: `verify:${me.accountId}:${Date.now()}`, secret: { link: `${mailBase()}/verify/${vt}` } });
  await audit({ kind: "creator", id: me.accountId }, "creator.verify_requested", "creator_account", me.accountId, { email_status: status });
  redirect(flashUrl(BACK, status === "sent" ? "ok" : "err", status === "sent" ? `We sent a confirmation link to ${row.email}.` : "Email isn't set up on Colatch yet, so the link could not be sent. The Colatch team can confirm your email for you."));
}

// ---- Shipping address for product seeding (creator_addresses). Team-only: never shown to brands.
// Only an account that owns its creator profile can save one (a pending claim can't write to that creator).
async function ownCreator(next) {
  const me = await currentCreator();
  if (!me) redirect(`/creator/login?next=${next}`);
  if (me.claimPending || !me.creator?.id || (await claimStatus(me.accountId)) !== "own") redirect(flashUrl(BACK, "err", "You can add a shipping address once your profile is verified."));
  return me;
}

async function saveAddress(fd) {
  "use server";
  const me = await ownCreator("/creator/settings");
  const { value: a, error } = addressFromForm(fd);
  if (!a) redirect(flashUrl(SHIP, "err", error) + "#shipping");
  await env.DB.prepare(
    `INSERT INTO creator_addresses (creator_id, name, line1, line2, city, state, pincode, phone, updated_at) VALUES (?,?,?,?,?,?,?,?, now())
     ON CONFLICT (creator_id) DO UPDATE SET name = excluded.name, line1 = excluded.line1, line2 = excluded.line2, city = excluded.city,
       state = excluded.state, pincode = excluded.pincode, phone = excluded.phone, updated_at = now()`
  ).bind(me.creator.id, a.name, a.line1, a.line2, a.city, a.state, a.pincode, a.phone).run();
  // The audit log records that it changed, never the address itself.
  await audit({ kind: "creator", id: me.accountId }, "creator.address_saved", "creator", me.creator.id);
  redirect(flashUrl(SHIP, "ok", "Shipping address saved. Only the Colatch team can see it.") + "#shipping");
}

async function deleteAddress() {
  "use server";
  const me = await ownCreator("/creator/settings");
  const r = await env.DB.prepare("DELETE FROM creator_addresses WHERE creator_id = ?").bind(me.creator.id).run();
  await audit({ kind: "creator", id: me.accountId }, "creator.address_deleted", "creator", me.creator.id);
  redirect(flashUrl(SHIP, "ok", r.meta?.changes ? "Shipping address deleted." : "There was no shipping address to delete.") + "#shipping");
}

export default async function Page({ searchParams }) {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/settings");
  const status = await claimStatus(me.accountId);
  const verified = !!(await env.DB.prepare("SELECT email_verified_at FROM creator_accounts WHERE id=?").bind(me.accountId).first())?.email_verified_at;
  const own = status === "own" && !me.claimPending && me.creator?.id;
  const addr = own ? await env.DB.prepare("SELECT name, line1, line2, city, state, pincode, phone FROM creator_addresses WHERE creator_id = ?").bind(me.creator.id).first() : null;
  return (
    <PublicShell path="/creator/settings" creatorName={status === "own" ? me.creator?.name : null}>
      <div className="cr-page">
        <PageHeader crumbs={[{ label: "Home", href: "/creator" }, "Settings"]} eyebrow="Account" title="Account <b>settings</b>" sub={`Signed in as ${me.email}. Your login, shipping address and devices.`} />
        {searchParams?.at !== "shipping" && <Flash sp={searchParams} />}
        {status !== "own" && <ClaimNote status={status} />}
        <Grid aside={<>
          <AsideCard eyebrow="At a glance" title="Your account">
            <Facts rows={[
              { label: "Email", value: <span className="row" style={{ gap: 8 }}><span style={{ overflowWrap: "anywhere" }}>{me.email}</span>{verified ? <span className="pill good">Confirmed</span> : <span className="pill ok">Not confirmed</span>}</span> },
              { label: "Profile", value: status === "own" ? <span className="pill good">Verified yours</span> : status === "rejected" ? <span className="pill low">Not linked</span> : <span className="pill">Being verified</span> },
              ...(own ? [{ label: "Shipping", value: addr ? <span className="pill good">Saved</span> : <a className="link" href="#shipping">Not added</a> }] : []),
            ]} />
          </AsideCard>
          <AsideCard eyebrow="Elsewhere" title="Profile and payouts" foot={<a className="link" href="/creator/profile#payout">Payout details →</a>}>
            <p className="small muted" style={{ margin: 0 }}>Your UPI, PAN and GSTIN live on your profile page, next to your media kit.</p>
          </AsideCard>
        </>}>
        <div className="stack cr-forms">
        <form className="panel pad" action={resendVerify}>
          <div className="spread"><h2 style={{ margin: 0 }}>Email</h2>{verified ? <span className="pill good">Confirmed</span> : <span className="pill ok">Not confirmed</span>}</div>
          <p className="muted" style={{ margin: "10px 0 0" }}>{me.email}</p>
          {!verified && <><p className="hint" style={{ margin: "8px 0 14px" }}>Confirm your email so brands and the Colatch team can reach you about deals and payments.</p><button className="btn">Send confirmation link</button></>}
        </form>
        <form className="panel pad" action={changePassword}>
          <h2>Change password</h2>
          <p className="muted" style={{ margin: "-4px 0 18px" }}>Signed in as {me.email}.</p>
          <div className="stack">
            <div className="fld"><label htmlFor="f-creator-settings-current-1">Current password</label><input id="f-creator-settings-current-1" name="current" type="password" required autoComplete="current-password" /></div>
            <div className="fld"><label htmlFor="f-creator-settings-password-2">New password <span className="opt">— at least 10 characters</span></label><input id="f-creator-settings-password-2" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
            <div className="fld"><label htmlFor="f-creator-settings-confirm-3">Type the new password again</label><input id="f-creator-settings-confirm-3" name="confirm" type="password" minLength={10} required autoComplete="new-password" /></div>
          </div>
          <button className="btn-foil" style={{ marginTop: 20 }}>Change password</button>
        </form>
        {own && <form className="panel pad ship-form" action={saveAddress} id="shipping" aria-labelledby="shipping-h">
          <div className="spread"><h2 id="shipping-h" style={{ margin: 0 }}>Shipping address for product seeding</h2>{addr ? <span className="pill good">Saved</span> : <span className="pill ok">Not added</span>}</div>
          {searchParams?.at === "shipping" && <div style={{ marginTop: 12 }}><Flash sp={searchParams} /></div>}
          <p className="note info ship-private" style={{ margin: "12px 0 16px" }}><b>Only the Colatch team sees this. Brands never do.</b> We use it to send you products for gifting and seeding deals you accept.</p>
          <div className="form-grid">
            <div className="fld full"><label htmlFor="f-ship-name">Name on the parcel</label><input id="f-ship-name" name="ship_name" required maxLength={80} autoComplete="shipping name" defaultValue={addr?.name ?? me.creator?.name ?? ""} /></div>
            <div className="fld full"><label htmlFor="f-ship-line1">House or flat, building, street</label><input id="f-ship-line1" name="line1" required maxLength={120} autoComplete="shipping address-line1" defaultValue={addr?.line1 ?? ""} /></div>
            <div className="fld full"><label htmlFor="f-ship-line2">Area or landmark <span className="opt">— optional</span></label><input id="f-ship-line2" name="line2" maxLength={120} autoComplete="shipping address-line2" defaultValue={addr?.line2 ?? ""} /></div>
            <div className="fld"><label htmlFor="f-ship-city">City</label><input id="f-ship-city" name="ship_city" required maxLength={60} autoComplete="shipping address-level2" defaultValue={addr?.city ?? me.creator?.city ?? ""} /></div>
            <div className="fld"><label htmlFor="f-ship-state">State <span className="opt">— optional</span></label><input id="f-ship-state" name="ship_state" maxLength={60} autoComplete="shipping address-level1" defaultValue={addr?.state ?? ""} /></div>
            <div className="fld"><label htmlFor="f-ship-pin">PIN code</label><input id="f-ship-pin" name="pincode" required inputMode="numeric" maxLength={7} pattern="[1-9][0-9]{2} ?[0-9]{3}" autoComplete="shipping postal-code" defaultValue={addr?.pincode ?? ""} placeholder="110001" /><span className="hint">6 digits</span></div>
            <div className="fld"><label htmlFor="f-ship-phone">Phone for the courier <span className="opt">— optional</span></label><input id="f-ship-phone" name="ship_phone" type="tel" inputMode="tel" maxLength={16} autoComplete="shipping tel-national" defaultValue={addr?.phone ?? ""} placeholder="98XXXXXXXX" /></div>
          </div>
          <div className="row" style={{ marginTop: 18, gap: 10 }}>
            <button className="btn plum">{addr ? "Update address" : "Save address"}</button>
            {addr && <button className="btn ghost" formAction={deleteAddress} formNoValidate>Delete address</button>}
          </div>
        </form>}
        <form className="panel pad" action={signOutEverywhere}>
          <h2>Sign out everywhere</h2>
          <p className="muted" style={{ margin: "-4px 0 14px" }}>Lost a phone, or logged in on someone else's laptop? This signs your account out on every device, including this one.</p>
          <button className="btn">Sign out on all devices</button>
        </form>
        <p className="hint" style={{ margin: 0 }}><a className="link" href="/creator">Back to my briefs</a> · <a className="link" href="/creator/logout">Log out</a></p>
        </div>
        </Grid>
      </div>
    </PublicShell>
  );
}
