import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { revokeSessions } from "@/lib/net/creatorAuth";
import { audit, can } from "@/lib/net/security";
import { requireTeam } from "../_guard";
import { linkCampaignsByEmail } from "../../brand/_lib";

export const metadata = { title: "Brand accounts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const BACK = "/team/brands";
const go = (key, msg) => redirect(flashUrl(BACK, key, msg));

async function target(fd) {
  const id = String(fd.get("id") ?? "");
  const b = id ? await env.DB.prepare("SELECT id, email, company, email_verified_at, verified_by, disabled_at FROM brand_accounts WHERE id=?").bind(id).first() : null;
  if (!b) go("err", "That brand account no longer exists.");
  return b;
}

/** Colatch has checked this is a real brand: shows the verified mark on its campaigns. */
async function markVerified(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const b = await target(fd);
  if (!b.email_verified_at) go("err", `Confirm ${b.email} first (their email isn't confirmed yet).`);
  await env.DB.tx(async (t) => {
    await t.prepare("UPDATE brand_accounts SET verified_by=? WHERE id=?").bind(me.id, b.id).run();
    await t.prepare("UPDATE campaigns SET brand_verified=1 WHERE brand_account_id=?").bind(b.id).run();
  });
  await audit({ kind: "team", id: me.id }, "brand.verified", "brand_account", b.id, { email: b.email });
  go("ok", `${b.company || b.email} is marked verified.`);
}

/** For when email isn't working: a team member who has checked the address confirms it by hand. */
async function confirmEmail(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const b = await target(fd);
  if (b.email_verified_at) go("ok", "That email was already confirmed.");
  await env.DB.prepare("UPDATE brand_accounts SET email_verified_at=now() WHERE id=? AND email_verified_at IS NULL").bind(b.id).run();
  const n = await linkCampaignsByEmail(b.id);
  await audit({ kind: "team", id: me.id }, "brand.email_confirmed_by_team", "brand_account", b.id, { email: b.email, linked: n });
  go("ok", `${b.email} confirmed. ${n} earlier ${n === 1 ? "brief" : "briefs"} linked to the account.`);
}

async function setDisabled(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const b = await target(fd);
  const disable = fd.get("disable") === "1";
  await env.DB.prepare(`UPDATE brand_accounts SET disabled_at=${disable ? "now()" : "NULL"} WHERE id=?`).bind(b.id).run();
  if (disable) await revokeSessions("brand", b.id);
  await audit({ kind: "team", id: me.id }, disable ? "brand.disabled" : "brand.enabled", "brand_account", b.id, { email: b.email });
  go("ok", `${b.email} ${disable ? "can no longer log in and was signed out" : "can log in again"}.`);
}

export default async function Page({ searchParams }) {
  const me = await requireTeam("view");
  const canAct = can(me.role, "team");
  const rows = (await env.DB.prepare(
    `SELECT b.id, b.email, b.name, b.company, b.phone, b.website, b.gstin, b.email_verified_at, b.verified_by, b.disabled_at, b.last_login_at, b.created_at,
            u.email AS verifier, (SELECT COUNT(*) FROM campaigns k WHERE k.brand_account_id=b.id) AS campaigns
     FROM brand_accounts b LEFT JOIN team_users u ON u.id=b.verified_by ORDER BY b.created_at DESC LIMIT 500`
  ).all()).results ?? [];
  const day = (t) => t ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  return (
    <TeamShell active="brands" title="Brand <b>accounts</b>" email={me.email} role={me.role}>
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
      <p className="muted" style={{ margin: "0 0 14px", maxWidth: 720 }}>Brands who created an account. Earlier briefs are linked only after the brand confirms its email. Mark a brand verified once you've checked it's a real business (website, GSTIN, a call): its campaigns then show the verified mark to creators.</p>
      {!canAct && <div className="note info" style={{ marginBottom: 14 }}>You can view brand accounts. Verifying or disabling needs the team permission.</div>}
      <div className="panel scroll-x">
        {rows.length === 0 ? <p className="pad hint">No brand accounts yet.</p> : (
          <table className="tbl">
            <thead><tr><th scope="col">Brand</th><th scope="col">Email</th><th scope="col">Campaigns</th><th scope="col">Status</th>{canAct && <th scope="col"><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Actions</span></th>}</tr></thead>
            <tbody>{rows.map((b) => (
              <tr key={b.id}>
                <td><b>{b.company || "—"}</b><div className="hint">{b.name || ""}{b.phone ? ` · ${b.phone}` : ""}{b.gstin ? ` · GSTIN ${b.gstin}` : ""}</div>{b.website && <div className="hint"><a className="link" href={b.website} target="_blank" rel="noopener noreferrer nofollow">{b.website}</a></div>}</td>
                <td>{b.email}<div className="hint">{b.email_verified_at ? `Confirmed ${day(b.email_verified_at)}` : "Email not confirmed"}</div></td>
                <td className="num">{Number(b.campaigns || 0)}</td>
                <td>
                  {b.disabled_at ? <span className="pill low">Disabled</span> : b.verified_by ? <span className="pill good">Verified</span> : <span className="pill ok">Not verified</span>}
                  <div className="hint">{b.verified_by ? `by ${b.verifier || b.verified_by}` : `Joined ${day(b.created_at)}`}{b.last_login_at ? ` · last login ${day(b.last_login_at)}` : ""}</div>
                </td>
                {canAct && <td className="num"><div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  {!b.email_verified_at && <form action={confirmEmail}><input type="hidden" name="id" value={b.id} /><button className="btn sm" aria-label={`Confirm email for ${b.email}`}>Confirm email</button></form>}
                  {!b.verified_by && b.email_verified_at && !b.disabled_at && <form action={markVerified}><input type="hidden" name="id" value={b.id} /><button className="btn sm" aria-label={`Mark ${b.company || b.email} verified`}>Mark brand verified</button></form>}
                  <form action={setDisabled}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="disable" value={b.disabled_at ? "0" : "1"} /><button className="btn sm" aria-label={`${b.disabled_at ? "Enable" : "Disable"} ${b.email}`}>{b.disabled_at ? "Enable" : "Disable"}</button></form>
                </div></td>}
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </TeamShell>
  );
}
