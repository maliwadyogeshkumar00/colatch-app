import { redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { SplitAuth } from "@/components/ui";
import { ACCOUNT_PANEL } from "@/components/brand/AuthPanels";
import Flash, { flashUrl } from "../../_ui/flash";
import { passwordProblem } from "@/lib/net/auth";
import { peekResetToken, consumeResetToken, audit } from "@/lib/net/security";
import { setPassword } from "../_lib";

// The token is in the URL: keep it out of Referer headers and search engines.
export const metadata = { title: "Set a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function save(fd) {
  "use server";
  const token = String(fd.get("token") ?? "");
  const pw = String(fd.get("password") ?? "");
  const back = `/reset/${encodeURIComponent(token)}`;
  if (pw !== String(fd.get("confirm") ?? "")) redirect(flashUrl(back, "err", "The two passwords don't match."));
  const problem = passwordProblem(pw);
  if (problem) redirect(flashUrl(back, "err", problem));
  const who = await consumeResetToken(token); // single use, even if submitted twice at once
  if (!who) redirect(flashUrl("/reset/request", "err", "That link has expired or was already used. Ask for a new one."));
  const err = await setPassword(who.user_kind, who.user_id, pw);
  if (err) redirect(flashUrl("/reset/request", "err", err));
  await audit({ kind: who.user_kind, id: who.user_id }, `${who.user_kind}.password_reset`, { team: "team_user", brand: "brand_account" }[who.user_kind] || "creator_account", who.user_id);
  const login = { team: "/team/login", brand: "/brand/login" }[who.user_kind] || "/creator/login";
  redirect(flashUrl(login, "ok", "Password set. Log in with your new password."));
}

export default async function Page({ params, searchParams }) {
  const token = decodeURIComponent(String(params.token || ""));
  const who = await peekResetToken(token);
  const forWho = { team: "For your Colatch team login.", brand: "For your Colatch brand account." }[who?.user_kind] || "For your Colatch creator account.";
  return (
    <PublicShell path="/reset" flush>
      <SplitAuth panel={ACCOUNT_PANEL} intro={!who
        ? { eyebrow: "Reset link", title: "This link doesn't work any more", sub: "Reset links work once and expire after a couple of hours." }
        : { eyebrow: "Reset link", title: "Set a new <b>password</b>", sub: `${forWho} You'll be signed out on other devices.` }}>
        {!who ? (
          <div className="v2b-auth-next">
            <a className="btn-foil" style={{ width: "100%", justifyContent: "center" }} href="/reset/request">Ask for a new reset link</a>
            <p className="hint">For creators and brands. Team members: ask an owner or admin for a new link.</p>
            <p className="hint"><a className="link" href="/creator/login">Creator log in</a> · <a className="link" href="/brand/login">Brand log in</a></p>
          </div>
        ) : (
          <form className="panel pad" action={save}>
            <input type="hidden" name="token" value={token} />
            <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
            <div className="stack">
              <div className="fld"><label htmlFor="f-reset-token-password-1">New password <span className="opt">— at least 10 characters</span></label><input id="f-reset-token-password-1" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
              <div className="fld"><label htmlFor="f-reset-token-confirm-2">Type it again</label><input id="f-reset-token-confirm-2" name="confirm" type="password" minLength={10} required autoComplete="new-password" /></div>
            </div>
            <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Save password</button>
          </form>
        )}
      </SplitAuth>
    </PublicShell>
  );
}
