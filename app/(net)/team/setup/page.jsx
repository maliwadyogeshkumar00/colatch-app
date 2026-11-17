import { redirect } from "next/navigation";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { hashPassword, passwordProblem } from "@/lib/net/auth";
import { currentTeam, startTeamSession } from "@/lib/net/creatorAuth";
import { audit, isEmail, ROLES } from "@/lib/net/security";
import { SplitAuth } from "@/components/ui";
import { clientIp, overLimit, sameSecret, TOO_MANY } from "../../reset/_lib";

export const metadata = { title: "Set up the team login", robots: { index: false, follow: false } };

const setupCode = () => String(process.env.TEAM_SETUP_CODE || "").trim();

/** Emails allowed to become the first owner. TEAM_OWNER_EMAILS when set; otherwise @colatch.com addresses. */
function ownerAllowed(email) {
  const list = String(process.env.TEAM_OWNER_EMAILS || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  return list.length ? list.includes(email) : email.endsWith("@colatch.com");
}

async function setup(fd) {
  "use server";
  const back = "/team/setup";
  if (!setupCode()) redirect(flashUrl(back, "err", "Setup is locked until TEAM_SETUP_CODE is set in Vercel."));
  if (await overLimit(`setup|${clientIp()}`)) redirect(flashUrl(back, "err", TOO_MANY));
  if (!(await sameSecret(String(fd.get("code") ?? "").trim(), setupCode()))) redirect(flashUrl(back, "err", "That setup code is not right."));
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const pw = String(fd.get("password") ?? "");
  if (!name || !isEmail(email)) redirect(flashUrl(back, "err", "Add your name and a valid email."));
  if (!ownerAllowed(email)) redirect(flashUrl(back, "err", "This email is not on the owner list (TEAM_OWNER_EMAILS)."));
  const problem = passwordProblem(pw);
  if (problem) redirect(flashUrl(back, "err", problem));
  const { hash, salt } = await hashPassword(pw);
  const id = crypto.randomUUID();
  // One owner, ever, through this page: the lock makes two simultaneous setups queue, and the insert
  // only happens while the team table is still empty.
  const created = await env.DB.tx(async (t) => {
    await t.prepare("SELECT pg_advisory_xact_lock(727002)").run();
    const r = await t.prepare("INSERT INTO team_users (id, email, name, password_hash, salt, role) SELECT ?,?,?,?,?,'owner' WHERE NOT EXISTS (SELECT 1 FROM team_users)")
      .bind(id, email, name, hash, salt).run();
    if (r.meta?.changes) await audit({ kind: "team", id }, "team.owner_setup", "team_user", id, { email }, t);
    return Boolean(r.meta?.changes);
  });
  if (!created) redirect(flashUrl("/team/login", "err", "A team login already exists. Log in, or ask an owner to add you."));
  await startTeamSession(id);
  redirect(flashUrl("/team", "ok", "Owner login created. Add the rest of the team from Team members."));
}

export default async function Page({ searchParams }) {
  if (await currentTeam().catch(() => null)) redirect("/team");
  const exists = Number((await env.DB.prepare("SELECT COUNT(*) n FROM team_users").first())?.n ?? 0) > 0;
  if (exists) redirect("/team/login");
  const locked = !setupCode();
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
        intro={{ eyebrow: "One-time setup", title: "Set up the first Colatch <b>team login</b>.", sub: locked ? undefined : "This creates the owner account. It works once, with the setup code, for an email on the owner list." }}
      >
        <form className="panel pad" action={setup}>
          <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
          {locked ? (
            <div className="note bad" role="alert">Setup is locked until <b>TEAM_SETUP_CODE</b> is set in Vercel (Project → Settings → Environment Variables). Set it, redeploy, then come back here with the code.</div>
          ) : (
            <>
              <div className="stack">
                <div className="fld"><label htmlFor="f-team-setup-code-1">Setup code</label><input id="f-team-setup-code-1" name="code" type="password" required autoComplete="off" /></div>
                <div className="fld"><label htmlFor="f-team-setup-name-2">Your name</label><input id="f-team-setup-name-2" name="name" required autoComplete="name" /></div>
                <div className="fld"><label htmlFor="f-team-setup-email-3">Work email</label><input id="f-team-setup-email-3" name="email" type="email" required autoComplete="email" /></div>
                <div className="fld"><label htmlFor="f-team-setup-password-4">Password <span className="opt">— at least 10 characters</span></label><input id="f-team-setup-password-4" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
              </div>
              <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Create owner login</button>
            </>
          )}
        </form>
      </SplitAuth>
    </main>
  );
}
