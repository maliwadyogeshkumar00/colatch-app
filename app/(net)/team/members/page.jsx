import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import TeamShell from "../../_ui/TeamShell";
import { PageHeader, KpiStrip, DataTable, Grid, Section, Card, AsideCard, InlineState, Pill, Cell, Avatar } from "@/components/ui";
import { ShareBar, stamp } from "@/components/admin/Charts";

const dayTime = (t) => stamp(t);
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { revokeSessions } from "@/lib/net/creatorAuth";
import { audit, can, createResetToken, isEmail, ROLES, ROLE_LABEL, RESET_HOURS } from "@/lib/net/security";
import { notify, emailConfig } from "@/lib/net/notify";
import { requireTeam } from "../_guard";
import { requestBase } from "../../reset/_lib";

export const metadata = { title: "Team members", robots: { index: false, follow: false } };

const BACK = "/team/members";
const LINK_COOKIE = "tm_link";
const go = (key, msg) => redirect(flashUrl(BACK, key, msg));

/** Owners left who can still log in, not counting `exceptId`. */
async function activeOwners(exceptId) {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM team_users WHERE role='owner' AND disabled_at IS NULL AND id <> ?").bind(exceptId).first();
  return Number(r?.n || 0);
}

/**
 * Sends a set-password link by email. When email isn't working, the link is kept for 15 minutes in a
 * cookie only this browser can read, and shown once on this page so the person adding can pass it on.
 */
async function sendLink(me, target, template) {
  const token = await createResetToken("team", target.id, me.id);
  const link = `${requestBase()}/reset/${token}`;
  const status = await notify({
    template, to: target.email, toKind: "team", toId: target.id,
    payload: { name: target.name, by: me.name || me.email, role: ROLE_LABEL[target.role] || target.role },
    dedupeKey: `${template}:${target.id}:${Date.now()}`, secret: { link },
  });
  if (status !== "sent") {
    cookies().set(LINK_COOKIE, JSON.stringify({ email: target.email, link, status }), { httpOnly: true, secure: true, sameSite: "strict", path: BACK, maxAge: 900 });
  }
  return status;
}

async function addMember(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim().slice(0, 120) || null;
  const role = String(fd.get("role") ?? "viewer");
  if (!isEmail(email)) go("err", "Add a valid email.");
  if (!ROLES.includes(role)) go("err", "Pick a role.");
  if (role === "owner" && !can(me.role, "owner")) go("err", "Only an owner can add another owner.");
  const id = crypto.randomUUID();
  // No password yet: the new member sets one with the link. 'login-disabled' can never match a password.
  const r = await env.DB.prepare("INSERT INTO team_users (id, email, name, password_hash, salt, role) VALUES (?,?,?,'login-disabled','none',?) ON CONFLICT (email) DO NOTHING")
    .bind(id, email, name, role).run();
  if (!r.meta?.changes) go("err", "That email already has a team login.");
  await audit({ kind: "team", id: me.id }, "team.member_added", "team_user", id, { email, role });
  const status = await sendLink(me, { id, email, name, role }, "team_invite");
  go("ok", status === "sent" ? `${email} added as ${role}. We emailed them a link to set their password.` : `${email} added as ${role}. Their set-password link is below.`);
}

async function changeRole(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const id = String(fd.get("id") ?? "");
  const role = String(fd.get("role") ?? "");
  if (!ROLES.includes(role)) go("err", "Pick a role.");
  if (id === me.id) go("err", "You can't change your own role. Ask another owner.");
  const t = await env.DB.prepare("SELECT id, email, role FROM team_users WHERE id=?").bind(id).first();
  if (!t) go("err", "That member no longer exists.");
  if ((role === "owner" || t.role === "owner") && !can(me.role, "owner")) go("err", "Only an owner can make or change an owner.");
  if (t.role === "owner" && role !== "owner" && (await activeOwners(id)) === 0) go("err", "There has to be at least one owner.");
  const r = await env.DB.prepare("UPDATE team_users SET role=? WHERE id=? AND role<>?").bind(role, id, role).run();
  if (!r.meta?.changes) go("ok", `${t.email} already has that role.`);
  await audit({ kind: "team", id: me.id }, "team.role_changed", "team_user", id, { from: t.role, to: role });
  go("ok", `${t.email} is now ${role}.`);
}

async function setDisabled(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const id = String(fd.get("id") ?? "");
  const disable = String(fd.get("disable")) === "1";
  if (id === me.id) go("err", "You can't disable your own login.");
  const t = await env.DB.prepare("SELECT id, email, role FROM team_users WHERE id=?").bind(id).first();
  if (!t) go("err", "That member no longer exists.");
  if (t.role === "owner" && !can(me.role, "owner")) go("err", "Only an owner can disable an owner.");
  if (disable && t.role === "owner" && (await activeOwners(id)) === 0) go("err", "You can't disable the last owner.");
  const r = disable
    ? await env.DB.prepare("UPDATE team_users SET disabled_at=datetime('now') WHERE id=? AND disabled_at IS NULL").bind(id).run()
    : await env.DB.prepare("UPDATE team_users SET disabled_at=NULL WHERE id=? AND disabled_at IS NOT NULL").bind(id).run();
  if (!r.meta?.changes) go("ok", `No change: ${t.email} was already ${disable ? "disabled" : "active"}.`);
  if (disable) await revokeSessions("team", id); // signed out everywhere, now
  await audit({ kind: "team", id: me.id }, disable ? "team.member_disabled" : "team.member_enabled", "team_user", id);
  go("ok", disable ? `${t.email} can no longer log in and was signed out everywhere.` : `${t.email} can log in again.`);
}

async function issueReset(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const t = await env.DB.prepare("SELECT id, email, name, role, disabled_at FROM team_users WHERE id=?").bind(String(fd.get("id") ?? "")).first();
  if (!t) go("err", "That member no longer exists.");
  if (t.disabled_at) go("err", "Enable this login before sending a reset link.");
  if (t.role === "owner" && t.id !== me.id && !can(me.role, "owner")) go("err", "Only an owner can reset an owner's password.");
  await audit({ kind: "team", id: me.id }, "team.reset_link_issued", "team_user", t.id);
  const status = await sendLink(me, t, "password_reset");
  go("ok", status === "sent" ? `Reset link emailed to ${t.email}.` : `Reset link for ${t.email} is below.`);
}

async function dismissLink() {
  "use server";
  await requireTeam("team", BACK);
  cookies().delete({ name: LINK_COOKIE, path: BACK });
  redirect(BACK);
}

async function decideClaim(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const id = String(fd.get("id") ?? "");
  const ok = String(fd.get("decision")) === "verify";
  const r = await env.DB.prepare("UPDATE creator_accounts SET claim_status=?, claim_verified_by=? WHERE id=? AND claim_status='pending'").bind(ok ? "own" : "rejected", me.email, id).run();
  if (!r.meta?.changes) go("err", "That claim was already decided.");
  if (!ok) await revokeSessions("creator", id);
  await audit({ kind: "team", id: me.id }, ok ? "creator.claim_verified" : "creator.claim_rejected", "creator_account", id);
  go("ok", ok ? "Claim verified: the creator now sees their deals and earnings." : "Claim rejected and that account was signed out.");
}

export default async function Page({ searchParams }) {
  const me = await requireTeam("team");
  const team = (await env.DB.prepare("SELECT id, email, name, role, disabled_at, last_login_at, password_hash = 'login-disabled' AS invited FROM team_users ORDER BY created_at").all()).results || [];
  const claims = (await env.DB.prepare("SELECT a.id, a.email, a.created_at, c.handle, c.name, c.email AS file_email FROM creator_accounts a JOIN creators c ON c.id=a.creator_id WHERE a.claim_status='pending' ORDER BY a.created_at").all()).results || [];
  let shown = null;
  try { shown = JSON.parse(cookies().get(LINK_COOKIE)?.value || "null"); } catch { shown = null; }
  const mail = emailConfig();
  const roles = can(me.role, "owner") ? ROLES : ROLES.filter((r) => r !== "owner");
  const short = (r) => String(ROLE_LABEL[r] || r).split(" (")[0];
  const isInvited = (t) => Number(t.invited) === 1 || t.invited === true;
  const active = team.filter((t) => !t.disabled_at && !isInvited(t)).length;
  const invited = team.filter((t) => !t.disabled_at && isInvited(t)).length;
  const disabled = team.filter((t) => t.disabled_at).length;
  const byRole = ROLES.map((r) => ({ label: String(ROLE_LABEL[r] || r).split(" (")[0], n: team.filter((t) => t.role === r && !t.disabled_at).length }));
  return (
    <TeamShell active="members" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Team" }, { label: "Team members" }]}
        eyebrow="Team · Access"
        title="Team <b>members</b>"
        sub="Who can log in to the team desk, with which role. New members set their own password from a one-time link."
      />
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
      {!mail.ready && <div style={{ marginBottom: 14 }}><InlineState kind="info" label="Email is not set up">(missing {mail.missing.join(", ")}), so invite and reset links are shown here for you to send yourself.</InlineState></div>}
      {shown?.link && (
        <Card tone="gold" className="pf-secret" label={`Link for ${shown.email}`}>
          <h2 style={{ marginTop: 0 }}>Link for {shown.email}</h2>
          <p className="muted" style={{ margin: "-4px 0 10px" }}>{shown.status === "not_configured" ? "Email is not set up, copy this link and send it yourself" : "The email did not go out, copy this link and send it yourself"} (WhatsApp or a direct message). It works once and expires in {RESET_HOURS} hours. Don't post it in a group.</p>
          <input readOnly value={shown.link} aria-label={`Set-password link for ${shown.email}`} style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }} data-testid="invite-link" />
          <form action={dismissLink} style={{ marginTop: 10 }}><button className="btn sm">I've sent it, hide the link</button></form>
        </Card>
      )}
      {shown?.link && <div style={{ height: 18 }} />}

      <KpiStrip label="Team at a glance" items={[
        { featured: true, label: "Active logins", value: active, foot: `${team.length} ${team.length === 1 ? "member" : "members"} in all` },
        { label: "Invited, no password yet", value: invited, foot: invited ? "send a new invite link if it expired" : "everyone has set a password" },
        { label: "Disabled", value: disabled, foot: "can't log in, signed out everywhere" },
        { label: "Creator claims", value: claims.length, foot: claims.length ? "waiting for a check" : "none waiting", href: "#claims" },
      ]} />

      <Grid aside={<>
        <AsideCard id="add" eyebrow="Invite" title="Add a team member">
          <form action={addMember}>
            <p className="small" style={{ marginTop: 0 }}>They get a one-time link to set their own password. Nobody else ever knows it.</p>
            <div className="stack">
              <div className="fld"><label htmlFor="f-team-members-name-1">Name</label><input id="f-team-members-name-1" name="name" /></div>
              <div className="fld"><label htmlFor="f-team-members-email-2">Email</label><input id="f-team-members-email-2" name="email" type="email" required /></div>
              <div className="fld"><label htmlFor="f-team-members-role-3">Role</label><select id="f-team-members-role-3" name="role" defaultValue="viewer">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
            </div>
            <button className="btn-foil" style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>Add member</button>
          </form>
        </AsideCard>
        <AsideCard eyebrow="Roles" title="Who can do what">
          <ShareBar label="Active members by role" parts={byRole} />
          <p className="small" style={{ marginBottom: 0 }}>Shortlisters run campaigns and deals but never money; finance records payments but never shortlists. Only an owner can make or change an owner.</p>
        </AsideCard>
      </>}>
        <Section title="Members" sub={`${team.length} ${team.length === 1 ? "login" : "logins"}, oldest first. You can't change your own role or disable yourself.`}>
          <DataTable caption="Team members" rows={team} columns={[
            { key: "who", label: "Member", render: (t) => <span className="adm-who"><Avatar name={t.name || t.email} size={36} /><Cell title={t.name || t.email} sub={<span className="adm-dim">{t.email}{t.id === me.id ? " · you" : ""}</span>} /></span> },
            { key: "role", label: "Role", render: (t) => (t.id === me.id ? <span title={ROLE_LABEL[t.role]}>{short(t.role)} <span className="adm-dim">(you)</span></span> : (
              <form action={changeRole} className="adm-acts" style={{ justifyContent: "flex-start" }}>
                <input type="hidden" name="id" value={t.id} />
                <select className="in" name="role" defaultValue={t.role} aria-label={`Role for ${t.email}`} style={{ maxWidth: "100%" }}>{ROLES.filter((r) => roles.includes(r) || r === t.role).map((r) => <option key={r} value={r}>{short(r)}</option>)}</select>
                <button className="btn sm">Save</button>
              </form>
            )) },
            { key: "status", label: "Status and access", primary: true, labelHidden: true, render: (t) => (
              <div className="adm-status">
                <span>{t.disabled_at ? <Pill tone="off">Disabled</Pill> : isInvited(t) ? <Pill tone="wait">Invited, no password yet</Pill> : <Pill tone="done">Active</Pill>}<span className="adm-dim" style={{ display: "block", marginTop: 4 }}>{t.last_login_at ? `Last login ${dayTime(t.last_login_at)}` : "Never logged in"}</span></span>
                <div className="adm-acts" style={{ justifyContent: "flex-start" }}>
                  {!t.disabled_at && <form action={issueReset}><input type="hidden" name="id" value={t.id} /><button className="btn sm">{isInvited(t) ? "New invite link" : "Reset link"}</button></form>}
                  {t.id !== me.id && <form action={setDisabled}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="disable" value={t.disabled_at ? "0" : "1"} /><button className="btn sm">{t.disabled_at ? "Enable" : "Disable"}</button></form>}
                </div>
              </div>
            ) },
          ]} empty={{ title: "No team logins yet.", body: "Add the first member from the form." }} />
        </Section>

        <Section id="claims" title="Creator profile claims" sub="Someone joined with the handle of a creator we already had on file, from a different email. Check it's really them (for example a DM from that Instagram account) before verifying: verifying shows them that creator's deals, earnings and payout details.">
          <DataTable caption="Creator profile claims" rows={claims} columns={[
            { key: "who", label: "Creator", render: (c) => <Cell eyebrow={dayTime(c.created_at)} title={`@${c.handle}${c.name ? ` · ${c.name}` : ""}`} sub={<span className="adm-dim">Joined as {c.email} · email on file: {c.file_email || "none"}</span>} /> },
            { key: "act", label: "Decision", labelHidden: true, num: true, primary: true, render: (c) => (
              <div className="adm-acts">
                <form action={decideClaim}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="verify" /><button className="btn sm">Verify</button></form>
                <form action={decideClaim}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="reject" /><button className="btn sm">Reject</button></form>
              </div>
            ) },
          ]} empty={{ title: "No claims waiting.", body: "When a creator claims a profile we already had, it shows up here to check." }} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
