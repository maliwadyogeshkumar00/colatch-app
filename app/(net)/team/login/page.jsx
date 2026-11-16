import { redirect } from "next/navigation";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { currentTeam, startTeamSession } from "@/lib/net/creatorAuth";
import { audit, safeNext } from "@/lib/net/security";
import { checkLogin, TOO_MANY } from "../../reset/_lib";

export const metadata = { title: "Team log in", robots: { index: false, follow: false } };

const teamCount = async () => Number((await env.DB.prepare("SELECT COUNT(*) n FROM team_users").first())?.n ?? 0);

async function login(fd) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const next = safeNext(fd.get("next"), "/team", "/team");
  const u = email ? await env.DB.prepare("SELECT id, password_hash, salt, disabled_at FROM team_users WHERE email=?").bind(email).first() : null;
  const res = await checkLogin("team", email, String(fd.get("password") ?? ""), u);
  if (res === "blocked") redirect(flashUrl("/team/login", "err", TOO_MANY));
  if (res !== "ok") {
    // Same message for unknown email, wrong password and disabled member.
    redirect(flashUrl("/team/login", "err", "Wrong email or password."));
  }
  await env.DB.prepare("UPDATE team_users SET last_login_at=datetime('now') WHERE id=?").bind(u.id).run();
  await audit({ kind: "team", id: u.id }, "team.login", "team_user", u.id);
  await startTeamSession(u.id);
  redirect(next);
}

export default async function Page({ searchParams }) {
  if (await currentTeam().catch(() => null)) redirect("/team");
  const first = (await teamCount()) === 0;
  return (
    <div className="pg-teamlogin">
      <style dangerouslySetInnerHTML={{ __html: `.pg-teamlogin{min-height:100vh;display:grid;place-items:center;padding:40px 16px;background:radial-gradient(60% 50% at 85% 0,rgba(232,184,75,.16),transparent 60%),radial-gradient(60% 60% at 0 100%,rgba(106,74,120,.45),transparent 60%),linear-gradient(180deg,var(--p900),var(--rail))}
.pg-teamlogin .box{width:min(440px,100%)}
.pg-teamlogin .lock{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:22px;color:#fff}
.pg-teamlogin .lock .em{width:34px;height:34px}.pg-teamlogin .lock .wm{height:16px;width:82px;color:#fff}
.pg-teamlogin .lock small{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-2);border-left:1px solid rgba(255,255,255,.2);padding-left:10px}` }} />
      <div className="box">
        <div className="lock"><svg className="em"><use href="#emblem-foil" /></svg><svg className="wm"><use href="#wordmark" /></svg><small>Connect · Team</small></div>
        {first ? (
          <div className="panel pad">
            <h2>No team login yet</h2>
            <p className="muted">The first owner account is created once, with the setup code.</p>
            <a className="btn-foil" href="/team/setup" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>Set up the owner login</a>
          </div>
        ) : (
          <form className="panel pad" action={login}>
            <input type="hidden" name="next" value={String(searchParams?.next ?? "")} />
            <h2>Team log in</h2>
            <p className="muted" style={{ margin: "-4px 0 18px" }}>Campaigns, creators, deals and payouts for Colatch Connect.</p>
            <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
            <div className="stack">
              <div className="fld"><label htmlFor="f-team-login-email-1">Email</label><input id="f-team-login-email-1" name="email" type="email" required autoComplete="email" /></div>
              <div className="fld"><label htmlFor="f-team-login-password-2">Password</label><input id="f-team-login-password-2" name="password" type="password" required autoComplete="current-password" /></div>
            </div>
            <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Log in</button>
            <p className="hint" style={{ margin: "16px 0 0" }}>Forgot your password or need access? Ask an owner or admin to send you a link from Team members.</p>
          </form>
        )}
      </div>
    </div>
  );
}
