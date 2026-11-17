import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { startTeamSession, revokeSessions, TEAM_COOKIE } from "@/lib/net/creatorAuth";
import { audit, can, ROLE_LABEL } from "@/lib/net/security";
import { requireTeam } from "../_guard";
import { PageHeader, KpiStrip, Grid, Section, Card, AsideCard, Avatar } from "@/components/ui";
import { DefList, stamp } from "@/components/admin/Charts";
import { actionTitle, changeLines } from "@/components/admin/audit";
import { parseWhen } from "@/lib/net/dashboard";
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

/** "3 days", "5 hours", "just now" from a stored time; short = "51 min", "5 h", "3 d" for the KPI tiles. */
function ago(t, now = Date.now(), short = false) {
  const w = parseWhen(t);
  if (!w) return null;
  const m = Math.max(0, Math.round((now - w.t) / 6e4));
  if (m < 2) return "just now";
  if (m < 60) return short ? `${m} min` : `${m} minutes`;
  const h = Math.round(m / 60);
  if (h < 48) return short ? `${h} h` : `${h} ${h === 1 ? "hour" : "hours"}`;
  const d = Math.round(h / 24);
  if (d < 60) return short ? `${d} d` : `${d} days`;
  const mo = Math.round(d / 30);
  return mo < 24 ? `${mo} months` : `${Math.round(mo / 12)} years`;
}

export default async function Page({ searchParams }) {
  const me = await requireTeam("view");
  // Read-only account facts for the status strip. Sessions are signed cookies, so the session version
  // (bumped by every "sign out everywhere" and password change) is what we can show, not a device count.
  const many = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results ?? [];
  const acct = (await env.DB.prepare("SELECT created_at, last_login_at, session_version FROM team_users WHERE id=?").bind(me.id).first().catch(() => null)) || {};
  const pw = (await env.DB.prepare("SELECT MAX(at) AS at FROM audit_log WHERE entity_id=? AND action IN ('team.password_changed','team.password_reset','team.owner_setup')").bind(me.id).first().catch(() => null))?.at || null;
  const logins = await many("SELECT id, at FROM audit_log WHERE action='team.login' AND entity_id=? ORDER BY at DESC LIMIT 5", me.id);
  const logins30 = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='team.login' AND entity_id=? AND at > now() - interval '30 days'").bind(me.id).first().catch(() => null))?.n || 0);
  const mine = await many("SELECT id, at, action, entity, entity_id, detail FROM audit_log WHERE actor_id IN (?, ?) AND action <> 'team.login' ORDER BY at DESC LIMIT 5", me.id, me.email);
  const now = Date.now();
  const pwAt = pw || acct.created_at;
  const pwAge = ago(pwAt, now);
  const pwDays = (() => { const w = parseWhen(pwAt); return w ? Math.floor((now - w.t) / 864e5) : null; })();
  const ver = Number(acct.session_version || 1);
  const roleShort = String(ROLE_LABEL[me.role] || me.role).split(" (")[0];
  const seeAudit = can(me.role, "team");
  return (
    <TeamShell active="settings" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Team" }, { label: "My settings" }]}
        eyebrow="Your login"
        title="My <b>settings</b>"
        sub="Your password and the devices you're signed in on. Roles are changed by an owner or admin in Team members."
        meta={[{ label: "Member since", value: acct.created_at ? stamp(acct.created_at).split(",")[0] : "—" }]}
      />
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>

      <KpiStrip label="Your account at a glance" items={[
        { label: "Role", value: roleShort, foot: String(ROLE_LABEL[me.role] || "").split(" (")[1]?.replace(/\)$/, "") || "set by an owner or admin" },
        { label: "Last sign-in", value: acct.last_login_at ? ago(acct.last_login_at, now, true) : "—", title: acct.last_login_at ? stamp(acct.last_login_at) : undefined, foot: `${acct.last_login_at && ago(acct.last_login_at, now) !== "just now" ? "ago · " : ""}${logins30} ${logins30 === 1 ? "sign-in" : "sign-ins"} in 30 days` },
        { featured: true, label: "Password age", value: pwAge || "—", title: pwAt ? stamp(pwAt) : undefined, foot: pwDays == null ? "not known" : pwDays > 180 ? "older than 6 months: change it" : pw ? `changed ${stamp(pwAt).split(",")[0]}` : "set when the login was made", href: "#password" },
        { label: "Session version", value: `v${ver}`, foot: ver > 1 ? `older sessions ended ${ver - 1} ${ver === 2 ? "time" : "times"}` : "never signed out everywhere", href: "#devices" },
      ]} />

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
        <Grid cols={2}>
          <Section id="password" title="Change password" sub="Signs out your other devices, not this one.">
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
          <Section id="devices" title="Sign-ins and devices" sub="Your latest sign-ins, newest first.">
            <Card>
              {logins.length ? (
                <ol className="adm-au__q" aria-label="Your latest sign-ins">
                  {logins.map((l, i) => <li key={l.id}><b>{stamp(l.at)}</b><span>{i === 0 ? "Latest sign-in" : `${ago(l.at, now)} ago`}</span></li>)}
                </ol>
              ) : <p className="small" style={{ margin: 0 }}>No sign-ins recorded yet.</p>}
              <form action={signOutEverywhere} className="adm-signout">
                <p className="small" style={{ margin: 0 }}><b>Sign out everywhere.</b> Signs your team login out on every device, including this one. You'll need your password to log back in on each device.</p>
                <button className="btn">Sign out on all devices</button>
              </form>
            </Card>
          </Section>
        </Grid>
        <Section id="activity" title="Your recent actions" sub="The last things you did on the team desk." actions={seeAudit ? <a className="btn sm" href={`/team/audit?actor=${encodeURIComponent(me.email)}`}>Open the audit log</a> : null}>
          {mine.length ? (
            <Card>
              <ol className="adm-au__q" aria-label="Your recent actions">
                {mine.map((r) => { const l = changeLines(r.action, r.detail, 2).join(" · "); return <li key={r.id}><b>{actionTitle(r.action)}</b><span>{stamp(r.at)}{r.entity ? ` · ${String(r.entity).replace(/_/g, " ")}${r.entity_id ? " " + String(r.entity_id).slice(0, 12) : ""}` : ""}</span>{l && <span className="adm-au__q1">{l}</span>}</li>; })}
              </ol>
            </Card>
          ) : <Card><p className="small" style={{ margin: 0 }}>Nothing yet. Decisions you make, such as approving drafts or recording payments, show up here.</p></Card>}
        </Section>
      </Grid>
    </TeamShell>
  );
}
