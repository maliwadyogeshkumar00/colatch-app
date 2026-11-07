import { redirect } from "next/navigation";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { hashPassword, verifyPassword } from "@/lib/net/auth";
import { currentTeam, startTeamSession } from "@/lib/net/creatorAuth";

export const metadata = { title: "Team log in · Colatch Connect", robots: { index: false, follow: false } };

const teamCount = async () => (await env.DB.prepare("SELECT COUNT(*) n FROM team_users").first())?.n ?? 0;

async function login(fd) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const u = await env.DB.prepare("SELECT id, password_hash, salt FROM team_users WHERE email=?").bind(email).first();
  if (u && (await verifyPassword(String(fd.get("password") ?? ""), u.password_hash, u.salt))) {
    await env.DB.prepare("UPDATE team_users SET last_login_at=datetime('now') WHERE id=?").bind(u.id).run();
    await startTeamSession(u.id);
    redirect("/team");
  }
  redirect(flashUrl("/team/login", "err", "Wrong email or password."));
}

async function setup(fd) {
  "use server";
  // Only allowed while there is no team login at all: the first person sets up the owner account.
  if ((await teamCount()) > 0) redirect(flashUrl("/team/login", "err", "A team login already exists. Log in, or ask a team member to add you."));
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const pw = String(fd.get("password") ?? "");
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(flashUrl("/team/login", "err", "Add your name and a valid email."));
  // The owner account can only be claimed by a Colatch address (or one listed in TEAM_OWNER_EMAILS), so a stranger
  // who finds this page first can't take over the desk.
  const allowed = String(process.env.TEAM_OWNER_EMAILS || "maliwadyogeshkumar00@gmail.com").toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!email.endsWith("@colatch.com") && !allowed.includes(email)) redirect(flashUrl("/team/login", "err", "The first team login must use a @colatch.com email."));
  if (pw.length < 10) redirect(flashUrl("/team/login", "err", "Use a password of at least 10 characters."));
  const { hash, salt } = await hashPassword(pw);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO team_users (id, email, name, password_hash, salt, role) VALUES (?,?,?,?,?,'owner')").bind(id, email, name, hash, salt).run();
  await startTeamSession(id);
  redirect("/team?ok=" + encodeURIComponent("Team login created. Welcome to Colatch Connect."));
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
          <form className="panel pad" action={setup}>
            <h2>Set up the first Colatch team login</h2>
            <p className="muted" style={{ margin: "-4px 0 18px" }}>No one has a team login yet. This creates the owner account. You can add the rest of the team from the overview page.</p>
            <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
            <div className="stack">
              <div className="fld"><label>Your name</label><input name="name" required autoComplete="name" /></div>
              <div className="fld"><label>Work email</label><input name="email" type="email" required autoComplete="email" /></div>
              <div className="fld"><label>Password <span className="opt">— at least 10 characters</span></label><input name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
            </div>
            <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Create team login</button>
          </form>
        ) : (
          <form className="panel pad" action={login}>
            <h2>Team log in</h2>
            <p className="muted" style={{ margin: "-4px 0 18px" }}>Campaigns, creators, deals and payouts for Colatch Connect.</p>
            <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
            <div className="stack">
              <div className="fld"><label>Email</label><input name="email" type="email" required autoComplete="email" /></div>
              <div className="fld"><label>Password</label><input name="password" type="password" required autoComplete="current-password" /></div>
            </div>
            <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Log in</button>
            <p className="hint" style={{ margin: "16px 0 0" }}>Need access? Ask a team member to add you from the Network overview.</p>
          </form>
        )}
      </div>
    </div>
  );
}
