import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import TeamShell from "../../_ui/TeamShell";
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
  return (
    <TeamShell active="members" title="Team <b>members</b>" email={me.email} role={me.role}>
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
      {!mail.ready && <div className="note" style={{ marginBottom: 14 }}>Email is not set up (missing {mail.missing.join(", ")}), so invite and reset links are shown here for you to send yourself.</div>}
      {shown?.link && (
        <div className="panel pad" style={{ marginBottom: 18, borderColor: "var(--gold-2)" }}>
          <h2>Link for {shown.email}</h2>
          <p className="muted" style={{ margin: "-4px 0 10px" }}>{shown.status === "not_configured" ? "Email is not set up, copy this link and send it yourself" : "The email did not go out, copy this link and send it yourself"} (WhatsApp or a direct message). It works once and expires in {RESET_HOURS} hours. Don't post it in a group.</p>
          <input readOnly value={shown.link} style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }} data-testid="invite-link" />
          <form action={dismissLink} style={{ marginTop: 10 }}><button className="btn sm">I've sent it, hide the link</button></form>
        </div>
      )}
      <div className="panel scroll-x" style={{ marginBottom: 18 }}>
        <table className="tbl">
          <thead><tr><th>Member</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {team.map((t) => (
              <tr key={t.id}>
                <td><b>{t.name || t.email}</b><div className="hint">{t.email}{t.id === me.id ? " · you" : ""}</div></td>
                <td>
                  {t.id === me.id ? (ROLE_LABEL[t.role] || t.role) : (
                    <form action={changeRole} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <select name="role" defaultValue={t.role} aria-label={`Role for ${t.email}`}>{ROLES.filter((r) => roles.includes(r) || r === t.role).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                      <button className="btn sm">Save</button>
                    </form>
                  )}
                </td>
                <td>{t.disabled_at ? <span className="pill bad">Disabled</span> : Number(t.invited) || t.invited === true ? <span className="pill">Invited, no password yet</span> : <span className="pill ok">Active</span>}<div className="hint">{t.last_login_at ? `Last login ${t.last_login_at} UTC` : "Never logged in"}</div></td>
                <td className="num">
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    {!t.disabled_at && <form action={issueReset}><input type="hidden" name="id" value={t.id} /><button className="btn sm">{Number(t.invited) || t.invited === true ? "New invite link" : "Reset link"}</button></form>}
                    {t.id !== me.id && <form action={setDisabled}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="disable" value={t.disabled_at ? "0" : "1"} /><button className="btn sm">{t.disabled_at ? "Enable" : "Disable"}</button></form>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="panel pad" action={addMember} style={{ marginBottom: 18, maxWidth: 640 }}>
        <h2>Add a team member</h2>
        <p className="muted" style={{ margin: "-4px 0 14px" }}>They get a one-time link to set their own password. Nobody else ever knows it.</p>
        <div className="form-grid">
          <div className="fld"><label htmlFor="f-team-members-name-1">Name</label><input id="f-team-members-name-1" name="name" /></div>
          <div className="fld"><label htmlFor="f-team-members-email-2">Email</label><input id="f-team-members-email-2" name="email" type="email" required /></div>
          <div className="fld"><label htmlFor="f-team-members-role-3">Role</label><select id="f-team-members-role-3" name="role" defaultValue="viewer">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
        </div>
        <button className="btn-foil" style={{ marginTop: 16 }}>Add member</button>
      </form>
      <div className="panel pad">
        <h2>Creator profile claims</h2>
        <p className="muted" style={{ margin: "-4px 0 14px" }}>Someone joined with the handle of a creator we already had on file, from a different email. Check it's really them (for example a DM from that Instagram account) before verifying: verifying shows them that creator's deals, earnings and payout details.</p>
        {claims.length === 0 ? <p className="hint">No claims waiting.</p> : (
          <table className="tbl"><tbody>{claims.map((c) => (
            <tr key={c.id}>
              <td><b>@{c.handle}</b> {c.name ? `· ${c.name}` : ""}<div className="hint">Joined as {c.email} · email on file: {c.file_email || "none"} · {c.created_at} UTC</div></td>
              <td className="num"><div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                <form action={decideClaim}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="verify" /><button className="btn sm">Verify</button></form>
                <form action={decideClaim}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="reject" /><button className="btn sm">Reject</button></form>
              </div></td>
            </tr>))}</tbody></table>
        )}
      </div>
    </TeamShell>
  );
}
