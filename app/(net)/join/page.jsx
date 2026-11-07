import { redirect } from "next/navigation";
import PublicShell from "../_ui/PublicShell";
import CreatorProfileFields from "../_ui/CreatorProfileFields";
import { flashUrl } from "../_ui/flash";
import { packForm, unpackForm } from "../_ui/keep";
import { env } from "@/lib/net/env";
import { hashPassword } from "@/lib/net/auth";
import { cleanHandle, lookupProfile, metaReady } from "@/lib/net/meta";
import { profileFromForm, saveProfile, upsertFromInstagram, str } from "@/lib/net/creators";
import { currentCreator, startCreatorSession } from "@/lib/net/creatorAuth";
import { readRefCookie, recordReferral } from "@/lib/net/referral";

export const metadata = { title: "Join Colatch as a creator · Colatch", description: "Join Colatch's creator network and get paid brand deals that fit what you do." };

async function join(fd) {
  "use server";
  let dest;
  try {
    if (str(fd.get("website"))) throw new Error("Something went wrong."); // honeypot
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    const handle = cleanHandle(String(fd.get("handle") ?? ""));
    const name = str(fd.get("name"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
    if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
    if (!/^[a-z0-9._]{1,30}$/.test(handle)) throw new Error("Enter your Instagram handle, like @yourname.");
    const p = profileFromForm(fd);
    if (!p.skills) throw new Error("Pick at least one thing you do, so we can show you the right briefs.");
    if (!fd.get("consent")) throw new Error("Please agree to be contacted about brand opportunities.");
    if (await env.DB.prepare("SELECT id FROM creator_accounts WHERE email=?").bind(email).first()) throw new Error("This email already has an account. Log in instead.");

    let creator = await env.DB.prepare("SELECT id FROM creators WHERE handle=?").bind(handle).first();
    if (creator && (await env.DB.prepare("SELECT id FROM creator_accounts WHERE creator_id=?").bind(creator.id).first()))
      throw new Error(`@${handle} has already joined. Log in, or write to marketing@colatch.com if this is your account.`);

    // Pull real numbers from Instagram when we can — self-reported numbers are only a fallback.
    let verified = false;
    if (metaReady(env)) {
      try { const ig = await lookupProfile(env, handle); const id = await upsertFromInstagram(env, ig); creator = { id }; verified = true; } catch { /* personal/private account: keep self-reported */ }
    }
    if (!creator) {
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO creators (id, handle, name, email, status, source) VALUES (?,?,?,?, 'new', 'application')").bind(id, handle, name, email).run();
      creator = { id };
    }
    await env.DB.prepare("UPDATE creators SET name=COALESCE(name,?), email=COALESCE(email,?), verified=? WHERE id=?").bind(name, email, verified ? 1 : 0, creator.id).run();
    await saveProfile(env, creator.id, p);

    const { hash, salt } = await hashPassword(password);
    const accountId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO creator_accounts (id, creator_id, email, password_hash, salt) VALUES (?,?,?,?,?)").bind(accountId, creator.id, email, hash, salt).run();
    await recordReferral(env, readRefCookie(), "creator", creator.id).catch(() => false);
    await startCreatorSession(accountId);
    const next = String(fd.get("next") ?? "");
    dest = next.startsWith("/creator/o/") ? next : "/creator?welcome=1";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    dest = flashUrl(`/join?v=${packForm(fd)}`, "err", msg);
  }
  redirect(dest);
}

export default async function Page({ searchParams }) {
  if (await currentCreator()) redirect("/creator");
  const v = unpackForm(searchParams?.v);
  const err = searchParams?.err;
  const openCount = (await env.DB.prepare("SELECT COUNT(*) n FROM campaigns WHERE status='open'").first().catch(() => null))?.n ?? 0;
  const next = searchParams?.next ?? v.next ?? "";
  const hero = (
    <section className="hero"><div className="hero-in">
      <div className="eb">Colatch creator network</div>
      <h1>Brand deals made for <b>what you do.</b></h1>
      <p>Tell us once who you are: dancer, chef, comedian, mom creator, whatever you make. You'll only see briefs you actually fit, with the pay, dates and deliverables up front. Free to join, and you choose what to apply for.</p>
      <div className="row" style={{ marginTop: 22, gap: 22, color: "rgba(244,239,227,.8)", fontSize: 14 }}>
        <span>✦ {openCount > 0 ? `${openCount} open ${openCount === 1 ? "brief" : "briefs"} right now` : "New briefs every week"}</span><span>✦ Only briefs that match you</span><span>✦ No fees, ever</span>
      </div>
    </div></section>
  );
  return (
    <PublicShell path="/join" hero={hero}>
      <div className="wrap narrow" style={{ padding: 0 }}>
        {err && <div className="note bad" style={{ marginBottom: 18 }}>{err}</div>}
        <form className="panel pad" action={join}>
          <input type="hidden" name="next" value={next} />
          <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" /></div>
          <h2>Your account</h2>
          <div className="form-grid">
            <div className="fld"><label>Your name</label><input name="name" required defaultValue={v.name ?? ""} /></div>
            <div className="fld"><label>Instagram handle</label><input name="handle" required defaultValue={v.handle ?? ""} placeholder="@yourname" /></div>
            <div className="fld"><label>Email</label><input name="email" type="email" required defaultValue={v.email ?? ""} autoComplete="email" /></div>
            <div className="fld"><label>Password</label><input name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
          </div>
          <h2 style={{ marginTop: 28 }}>About your work</h2>
          <CreatorProfileFields v={v} />
          <label className="row" style={{ marginTop: 20, gap: 10, fontSize: 13.5, color: "var(--ink-3)", alignItems: "flex-start", flexWrap: "nowrap" }}>
            <input type="checkbox" name="consent" value="1" required style={{ marginTop: 3 }} />
            <span>Colatch may contact me on WhatsApp, Instagram or email about brand opportunities, and may share my profile with brands for campaigns I apply to.</span>
          </label>
          <button className="btn-foil" style={{ marginTop: 22 }}>Join and see my matches →</button>
          <p className="hint" style={{ margin: "14px 0 0" }}>Already joined? <a className="link" href={`/creator/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Log in</a></p>
        </form>
      </div>
    </PublicShell>
  );
}
