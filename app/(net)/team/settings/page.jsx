import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { startTeamSession, revokeSessions, TEAM_COOKIE } from "@/lib/net/creatorAuth";
import { audit, ROLE_LABEL } from "@/lib/net/security";
import { requireTeam } from "../_guard";
import { PageHeader, Grid, Section, Card, AsideCard, Avatar } from "@/components/ui";
import { DefList } from "@/components/admin/Charts";
import { checkLogin, setPassword, TOO_MANY } from "../../reset/_lib";

export const metadata = { title: "My settings", robots: { index: false, follow: false } };
const BACK = "/team/settings";

async function changePassword(fd) {
  "use server";
  const me = await requireTeam("view", BACK);
  const row = await env.DB.prepare("SELECT id, password_hash, salt, disabled_at FROM team_users WHERE id=?").bind(me.id).first();
  const res = await checkLogin("team", me.email, String(fd.get("current") ?? ""), row);
  if (res === "blocked") redirect(flashUrl(BACK, "err", TOO_MANY));
  if (res !== "ok") redirect(flashUrl(BACK, "err", "Your current password is not right."));
  const pw = String(fd.get("password") ?? "");
  if (pw !== String(fd.get("confirm") ?? "")) redirect(flashUrl(BACK, "err", "The two new passwords don't match."));
  const err = await setPassword("team", me.id, pw);
  if (err) redirect(flashUrl(BACK, "err", err));
  await audit({ kind: "team", id: me.id }, "team.password_changed", "team_user", me.id);
  await startTeamSession(me.id);
  redirect(flashUrl(BACK, "ok", "Password changed. Other devices are signed out."));
}

async function signOutEverywhere() {
  "use server";
  const me = await requireTeam("view", BACK);
  await revokeSessions("team", me.id);
  await audit({ kind: "team", id: me.id }, "team.signed_out_everywhere", "team_user", me.id);
  cookies().delete(TEAM_COOKIE);
  redirect(flashUrl("/team/login", "ok", "Signed out on every device."));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam("view");
  return (
    <TeamShell active="settings" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Team" }, { label: "My settings" }]}
        eyebrow="Your login"
        title="My <b>settings</b>"
        sub="Your password and the devices you're signed in on. Roles are changed by an owner or admin in Team members."
      />
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
      <Grid aside={<>
        <AsideCard eyebrow="Signed in as" title={me.name || me.email}>
          <div style={{ marginBottom: 14 }}><Avatar name={me.name || me.email} size={44} /></div>
          <DefList items={[
            { label: "Email", value: me.email },
            { label: "Role", value: ROLE_LABEL[me.role] || me.role },
          ]} />
        </AsideCard>
        <AsideCard eyebrow="Good practice" title="Keep the desk safe">
          <p className="small" style={{ margin: 0 }}>Use a password you don't use anywhere else, at least 10 characters. If a phone or laptop goes missing, sign out everywhere and change your password.</p>
        </AsideCard>
      </>}>
        <Section id="password" title="Change password" sub="Changing it signs out your other devices; this one stays signed in.">
          <Card>
            <form action={changePassword}>
              <div className="stack">
                <div className="fld"><label htmlFor="f-team-settings-current-1">Current password</label><input id="f-team-settings-current-1" name="current" type="password" required autoComplete="current-password" /></div>
                <div className="fld"><label htmlFor="f-team-settings-password-2">New password <span className="opt">— at least 10 characters</span></label><input id="f-team-settings-password-2" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
                <div className="fld"><label htmlFor="f-team-settings-confirm-3">Type the new password again</label><input id="f-team-settings-confirm-3" name="confirm" type="password" minLength={10} required autoComplete="new-password" /></div>
              </div>
              <button className="btn-foil" style={{ marginTop: 20 }}>Change password</button>
            </form>
          </Card>
        </Section>
        <Section id="devices" title="Sign out everywhere" sub="Signs your team login out on every device, including this one.">
          <Card>
            <form action={signOutEverywhere} className="spread" style={{ gap: 12, flexWrap: "wrap" }}>
              <p className="small" style={{ margin: 0, flex: "1 1 240px" }}>You'll need your password to log back in on each device.</p>
              <button className="btn">Sign out on all devices</button>
            </form>
          </Card>
        </Section>
      </Grid>
    </TeamShell>
  );
}
