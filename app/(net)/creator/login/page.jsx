import { redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { verifyPassword } from "@/lib/net/auth";
import { startCreatorSession, currentCreator } from "@/lib/net/creatorAuth";

export const metadata = { title: "Creator log in · Colatch", robots: { index: false } };

const safe = (next) => (String(next || "").startsWith("/creator") ? String(next) : "/creator");

async function login(fd) {
  "use server";
  const next = safe(fd.get("next"));
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const acc = await env.DB.prepare("SELECT id, password_hash, salt FROM creator_accounts WHERE email=?").bind(email).first();
  if (acc && (await verifyPassword(String(fd.get("password") ?? ""), acc.password_hash, acc.salt))) {
    await env.DB.prepare("UPDATE creator_accounts SET last_login_at=datetime('now') WHERE id=?").bind(acc.id).run();
    await startCreatorSession(acc.id);
    redirect(next);
  }
  redirect(flashUrl(`/creator/login?next=${encodeURIComponent(next)}`, "err", "Wrong email or password."));
}

export default async function Page({ searchParams }) {
  const next = searchParams?.next ?? "";
  if (await currentCreator()) redirect(safe(next));
  return (
    <PublicShell path="/creator/login">
      <div className="wrap narrow" style={{ maxWidth: 440, padding: "20px 0 0" }}>
        <form className="panel pad" action={login}>
          <input type="hidden" name="next" value={next} />
          <h2>Log in</h2>
          <p className="muted" style={{ margin: "-4px 0 18px" }}>See the brand briefs that match you.</p>
          <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
          <div className="stack">
            <div className="fld"><label>Email</label><input name="email" type="email" required autoComplete="email" /></div>
            <div className="fld"><label>Password</label><input name="password" type="password" required autoComplete="current-password" /></div>
          </div>
          <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Log in</button>
          <p className="hint" style={{ margin: "16px 0 0" }}>New here? <a className="link" href={`/join${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Join free</a> · Forgot your password? Email <a className="link" href="mailto:marketing@colatch.com">marketing@colatch.com</a>.</p>
        </form>
      </div>
    </PublicShell>
  );
}
