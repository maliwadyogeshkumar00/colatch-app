import { redirect } from "next/navigation";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { currentTeam, startTeamSession } from "@/lib/net/creatorAuth";
import { audit, safeNext, ROLES } from "@/lib/net/security";
import { checkLogin, TOO_MANY } from "../../reset/_lib";
import { SplitAuth } from "@/components/ui";

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
    <main id="main" tabIndex={-1} className="ui-flush">
      <SplitAuth className="adm-auth"
        top={<a className="adm-lock" href="/team/login" aria-label="Colatch Connect team desk"><svg className="em" aria-hidden="true"><use href="#emblem-foil" /></svg><svg className="wm" aria-hidden="true"><use href="#wordmark" /></svg><small>Connect · Team</small></a>}
        panel={{
            eyebrow: "Colatch Connect · Team desk",
            title: "Every brief, deal and <em>rupee</em> on one desk.",
            lede: "Campaigns, creators, deals and payouts for Colatch Connect. Each team member logs in with their own role, and every decision is written to the audit log.",
            quote: { text: "Every rupee is recorded by a person, with its bank reference.", source: "The money ledger" },
            stats: [{ value: ROLES.length, label: "Team roles", gold: true }, { value: "1", label: "Append-only ledger" }],
          }}
        intro={first ? { eyebrow: "First time here", title: "No team login <b>yet</b>.", sub: "The first owner account is created once, with the setup code." } : { eyebrow: "Welcome back", title: "Team <b>log in</b>.", sub: "Campaigns, creators, deals and payouts for Colatch Connect." }}
      >
        {first ? (
          <div>
            <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
            <a className="btn-foil" href="/team/setup" style={{ marginTop: 6, width: "100%", justifyContent: "center" }}>Set up the owner login</a>
          </div>
        ) : (
          <form className="panel pad" action={login}>
            <input type="hidden" name="next" value={String(searchParams?.next ?? "")} />
            <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
            <div className="stack">
              <div className="fld"><label htmlFor="f-team-login-email-1">Email</label><input id="f-team-login-email-1" name="email" type="email" required autoComplete="email" /></div>
              <div className="fld"><label htmlFor="f-team-login-password-2">Password</label><input id="f-team-login-password-2" name="password" type="password" required autoComplete="current-password" /></div>
            </div>
            <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Log in</button>
            <p className="hint" style={{ margin: "16px 0 0" }}>Forgot your password or need access? Ask an owner or admin to send you a link from Team members.</p>
          </form>
        )}
      </SplitAuth>
    </main>
  );
}
