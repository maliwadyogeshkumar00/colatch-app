import { redirect } from "next/navigation";
import PublicShell from "../../_ui/PublicShell";
import { SplitAuth } from "@/components/ui";
import { ACCOUNT_PANEL } from "@/components/brand/AuthPanels";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { createResetToken, isEmail, RESET_HOURS, audit } from "@/lib/net/security";
import { notify } from "@/lib/net/notify";
import { clientIp, overLimit, mailBase, TOO_MANY } from "../_lib";

export const metadata = { title: "Reset your password", robots: { index: false } };

// Shown whether or not the email has an account, so this page can't be used to find out who has one.
const SENT = `If that email has a Colatch creator or brand account, we have sent it a reset link. It works once and expires in ${RESET_HOURS} hours. Nothing after 10 minutes? Check spam, or write to marketing@colatch.com from that email.`;

async function request(fd) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (!isEmail(email)) redirect(flashUrl("/reset/request", "err", "Enter the email you joined with."));
  // Per connection and per mailbox, so nobody can flood an inbox or probe many emails.
  if ((await overLimit(`reset|${clientIp()}`)) || (await overLimit(`reset|${email}`))) redirect(flashUrl("/reset/request", "err", TOO_MANY));
  const acc = await env.DB.prepare("SELECT id, creator_id FROM creator_accounts WHERE email=?").bind(email).first();
  // Brand accounts too. The same message is shown either way.
  const brand = acc ? null : await env.DB.prepare("SELECT id FROM brand_accounts WHERE email=? AND disabled_at IS NULL").bind(email).first();
  if (brand) {
    const token = await createResetToken("brand", brand.id, null);
    const status = await notify({
      template: "password_reset", to: email, toKind: "brand", toId: brand.id, payload: {},
      dedupeKey: `reset:brand:${brand.id}:${Date.now()}`, secret: { link: `${mailBase()}/reset/${token}` },
    });
    await audit({ kind: "brand", id: brand.id }, "brand.reset_requested", "brand_account", brand.id, { email_status: status });
  }
  if (acc) {
    const token = await createResetToken("creator", acc.id, null);
    const status = await notify({
      template: "password_reset", to: email, toKind: "creator", toId: acc.creator_id, payload: {},
      dedupeKey: `reset:${acc.id}:${Date.now()}`, secret: { link: `${mailBase()}/reset/${token}` },
    });
    await audit({ kind: "creator", id: acc.id }, "creator.reset_requested", "creator_account", acc.id, { email_status: status });
  }
  redirect(flashUrl("/reset/request", "ok", SENT));
}

export default function Page({ searchParams }) {
  return (
    <PublicShell path="/reset/request" flush>
      <SplitAuth panel={ACCOUNT_PANEL} intro={{ eyebrow: "Account help", title: "Reset your <b>password</b>.", sub: "For creator and brand accounts. Colatch team members: ask an owner or admin for a reset link." }}>
        <form className="panel pad" action={request}>
          <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
          <div className="fld"><label htmlFor="f-reset-request-email-1">Email</label><input id="f-reset-request-email-1" name="email" type="email" required autoComplete="email" /></div>
          <button className="btn-foil" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>Send reset link</button>
          <p className="hint" style={{ margin: "16px 0 0" }}>Back to <a className="link" href="/creator/login">creator log in</a> · <a className="link" href="/brand/login">brand log in</a></p>
        </form>
      </SplitAuth>
    </PublicShell>
  );
}
