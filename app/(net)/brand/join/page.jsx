import { redirect } from "next/navigation";
import PublicShell, { Hero } from "../../_ui/PublicShell";
import { flashUrl } from "../../_ui/flash";
import { packForm, unpackForm } from "../../_ui/keep";
import { env } from "@/lib/net/env";
import { hashPassword, passwordProblem } from "@/lib/net/auth";
import { audit, isEmail, loginBlocked, recordLogin, logError } from "@/lib/net/security";
import { notify, teamInbox } from "@/lib/net/notify";
import { currentBrand, startBrandSession } from "@/lib/net/creatorAuth";
import { clientIp } from "../../reset/_lib";
import { clean, cleanPhone, sendBrandVerify } from "../_lib";

export const metadata = { title: "Create a brand account", description: "Post briefs, approve creators and follow every deal and payment with Colatch." };

class Shown extends Error {}

async function join(fd) {
  "use server";
  let dest;
  try {
    if (String(fd.get("website") ?? "").trim()) throw new Shown("Something went wrong."); // honeypot
    const joinKey = `brandjoin|${clientIp()}`;
    if (await loginBlocked(joinKey)) throw new Shown("Too many sign-ups from this connection. Try again in 15 minutes.");
    const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 254);
    const password = String(fd.get("password") ?? "");
    const name = clean(fd.get("name"));
    const company = clean(fd.get("company"), 160);
    const phone = cleanPhone(fd.get("phone"));
    if (!name) throw new Shown("Enter your name.");
    if (!isEmail(email)) throw new Shown("Enter a valid work email.");
    if (!company) throw new Shown("Enter your company or brand name.");
    if (phone === false) throw new Shown("Enter a 10-digit Indian mobile number, or leave it empty.");
    const problem = passwordProblem(password);
    if (problem) throw new Shown(problem);
    if (!fd.get("terms")) throw new Shown("Please agree to be contacted about your campaigns.");

    const { hash, salt } = await hashPassword(password);
    const id = crypto.randomUUID();
    // Atomic: the UNIQUE email decides, so two sign-ups at once can't both win.
    const r = await env.DB.prepare(
      "INSERT INTO brand_accounts (id, email, password_hash, salt, name, company, phone) VALUES (?,?,?,?,?,?,?) ON CONFLICT (email) DO NOTHING"
    ).bind(id, email, hash, salt, name, company, phone).run();
    if (!r.meta?.changes) throw new Shown("This email already has a brand account. Log in instead.");
    await recordLogin(joinKey, false); // counts toward the per-connection sign-up limit
    await audit({ kind: "brand", id }, "brand.join", "brand_account", id, { company });

    // Earlier briefs from this email are linked only after the email is confirmed (see /verify).
    let verifyStatus = "failed";
    try { verifyStatus = await sendBrandVerify({ id, email }); } catch (e) { await logError("brand.join.verify", e); }
    await notify({ template: "brand_welcome", to: email, toKind: "brand", toId: id, payload: { name }, dedupeKey: `brand_welcome:${id}` }).catch((e) => logError("brand.join.welcome", e));
    const inbox = teamInbox();
    if (inbox) await notify({ template: "new_brand", to: inbox, toKind: "team", toId: null, payload: { name, email, company }, dedupeKey: `new_brand:${id}` }).catch((e) => logError("brand.join.team", e));

    await startBrandSession(id);
    dest = `/brand?welcome=1${verifyStatus === "sent" ? "" : "&mail=off"}`;
  } catch (e) {
    if (!(e instanceof Shown)) await logError("brand.join", e);
    const msg = e instanceof Shown ? e.message : "Something went wrong on our side. Please try again.";
    const keep = new FormData();
    for (const k of ["name", "email", "company", "phone"]) keep.set(k, String(fd.get(k) ?? ""));
    dest = flashUrl(`/brand/join?v=${packForm(keep)}`, "err", msg);
  }
  redirect(dest);
}

export default async function Page({ searchParams }) {
  if (await currentBrand()) redirect("/brand");
  const v = unpackForm(searchParams?.v);
  const err = searchParams?.err;
  const hero = (
    <Hero eyebrow="Colatch for brands" title="Every campaign, creator and payment <b>in one place.</b>">
      <p>Post briefs, approve the creators we shortlist, review drafts and see exactly what you've paid. Free to create an account.</p>
    </Hero>
  );
  return (
    <PublicShell mode="client" path="/brand/join" hero={hero}>
      <div className="wrap narrow" style={{ padding: 0, maxWidth: 560 }}>
        {err && <div className="note bad" role="alert" style={{ marginBottom: 18 }}>{err}</div>}
        <form className="panel pad" action={join}>
          <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" /></div>
          <h2>Create your brand account</h2>
          <div className="form-grid">
            <div className="fld"><label htmlFor="f-bj-name">Your name</label><input id="f-bj-name" name="name" required maxLength={120} defaultValue={v.name ?? ""} autoComplete="name" /></div>
            <div className="fld"><label htmlFor="f-bj-company">Company or brand</label><input id="f-bj-company" name="company" required maxLength={160} defaultValue={v.company ?? ""} autoComplete="organization" /></div>
            <div className="fld"><label htmlFor="f-bj-email">Work email</label><input id="f-bj-email" name="email" type="email" required defaultValue={v.email ?? ""} autoComplete="email" /></div>
            <div className="fld"><label htmlFor="f-bj-phone">Phone <span className="opt">— optional</span></label><input id="f-bj-phone" name="phone" type="tel" inputMode="tel" defaultValue={v.phone ?? ""} autoComplete="tel" placeholder="98765 43210" /></div>
            <div className="fld" style={{ gridColumn: "1 / -1" }}><label htmlFor="f-bj-password">Password <span className="opt">— at least 10 characters</span></label><input id="f-bj-password" name="password" type="password" required minLength={10} autoComplete="new-password" /></div>
          </div>
          <label className="row" style={{ marginTop: 18, gap: 10, fontSize: 13.5, color: "var(--ink-3)", alignItems: "flex-start", flexWrap: "nowrap" }}>
            <input type="checkbox" name="terms" value="1" required style={{ marginTop: 3 }} />
            <span>Colatch may contact me by email, phone or WhatsApp about my campaigns.</span>
          </label>
          <p className="hint" style={{ margin: "14px 0 0" }}>We'll email you a link to confirm your address. Briefs you already sent from it show up once it's confirmed.</p>
          <button className="btn-foil" style={{ marginTop: 18 }}>Create account</button>
          <p className="hint" style={{ margin: "14px 0 0" }}>Already have one? <a className="link" href="/brand/login">Log in</a></p>
        </form>
      </div>
    </PublicShell>
  );
}
