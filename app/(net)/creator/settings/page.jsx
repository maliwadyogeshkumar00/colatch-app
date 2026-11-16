import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import PublicShell from "../../_ui/PublicShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { currentCreator, startCreatorSession, revokeSessions, CREATOR_COOKIE } from "@/lib/net/creatorAuth";
import { audit } from "@/lib/net/security";
import { checkLogin, setPassword, TOO_MANY } from "../../reset/_lib";
import { claimStatus, ClaimNote } from "../../join/_claim";

export const metadata = { title: "Account settings", robots: { index: false } };
const BACK = "/creator/settings";

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

export default async function Page({ searchParams }) {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/settings");
  const status = await claimStatus(me.accountId);
  return (
    <PublicShell path="/creator/settings" creatorName={status === "own" ? me.creator?.name : null}>
      <div className="wrap narrow" style={{ maxWidth: 520, padding: "20px 0 0" }}>
        <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
        {status !== "own" && <div style={{ marginBottom: 18 }}><ClaimNote status={status} /></div>}
        <form className="panel pad" action={changePassword}>
          <h2>Change password</h2>
          <p className="muted" style={{ margin: "-4px 0 18px" }}>Signed in as {me.email}.</p>
          <div className="stack">
            <div className="fld"><label>Current password</label><input name="current" type="password" required autoComplete="current-password" /></div>
            <div className="fld"><label>New password <span className="opt">— at least 10 characters</span></label><input name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
            <div className="fld"><label>Type the new password again</label><input name="confirm" type="password" minLength={10} required autoComplete="new-password" /></div>
          </div>
          <button className="btn-foil" style={{ marginTop: 20 }}>Change password</button>
        </form>
        <form className="panel pad" action={signOutEverywhere} style={{ marginTop: 18 }}>
          <h2>Sign out everywhere</h2>
          <p className="muted" style={{ margin: "-4px 0 14px" }}>Lost a phone, or logged in on someone else's laptop? This signs your account out on every device, including this one.</p>
          <button className="btn">Sign out on all devices</button>
        </form>
        <p className="hint" style={{ margin: "16px 0 0" }}><a className="link" href="/creator">Back to my briefs</a> · <a className="link" href="/creator/logout">Log out</a></p>
      </div>
    </PublicShell>
  );
}
