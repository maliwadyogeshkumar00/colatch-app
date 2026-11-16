import { redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { startBrandSession, currentBrand } from "@/lib/net/creatorAuth";
import { audit, safeNext } from "@/lib/net/security";
import { checkLogin, TOO_MANY } from "../../reset/_lib";

export const metadata = { title: "Brand log in", robots: { index: false } };

// After logging in, go back to the brand area, the brief form or a shortlist page; nowhere else.
const safe = (next) => {
  const n = String(next || "");
  return n === "/brief" || n.startsWith("/brief?") || n.startsWith("/shortlist/") ? safeNext(n, "/", "/brand") : safeNext(n, "/brand", "/brand");
};

async function login(fd) {
  "use server";
  const next = safe(fd.get("next"));
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const acc = email ? await env.DB.prepare("SELECT id, password_hash, salt, disabled_at FROM brand_accounts WHERE email=?").bind(email).first() : null;
  // Throttled per email + connection; unknown emails still cost a full hash, so timing reveals nothing.
  const res = await checkLogin("brand", email, String(fd.get("password") ?? ""), acc);
  const back = `/brand/login?next=${encodeURIComponent(next)}`;
  if (res === "blocked") redirect(flashUrl(back, "err", TOO_MANY));
  if (res !== "ok") redirect(flashUrl(back, "err", "Wrong email or password."));
  await env.DB.prepare("UPDATE brand_accounts SET last_login_at=datetime('now') WHERE id=?").bind(acc.id).run();
  await audit({ kind: "brand", id: acc.id }, "brand.login", "brand_account", acc.id);
  await startBrandSession(acc.id);
  redirect(next);
}

export default async function Page({ searchParams }) {
  const next = searchParams?.next ?? "";
  if (await currentBrand()) redirect(safe(next));
  return (
    <PublicShell mode="client" path="/brand/login">
      <div className="wrap narrow" style={{ maxWidth: 440, padding: "20px 0 0" }}>
        <form className="panel pad" action={login}>
          <input type="hidden" name="next" value={next} />
          <h2>Log in</h2>
          <p className="muted" style={{ margin: "-4px 0 18px" }}>Your campaigns, creators and payments in one place.</p>
          <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
          <div className="stack">
            <div className="fld"><label htmlFor="f-brand-login-email-1">Email</label><input id="f-brand-login-email-1" name="email" type="email" required autoComplete="email" /></div>
            <div className="fld"><label htmlFor="f-brand-login-password-2">Password</label><input id="f-brand-login-password-2" name="password" type="password" required autoComplete="current-password" /></div>
          </div>
          <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Log in</button>
          <p className="hint" style={{ margin: "16px 0 0" }}>New to Colatch? <a className="link" href="/brand/join">Create a brand account</a> · <a className="link" href="/reset/request">Forgot your password?</a></p>
          <p className="hint" style={{ margin: "8px 0 0" }}>Creator? <a className="link" href="/creator/login">Creator log in</a></p>
        </form>
      </div>
    </PublicShell>
  );
}
