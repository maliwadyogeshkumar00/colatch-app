import { redirect } from "next/navigation";
import { ClaimNote } from "@/app/(net)/join/_claim.js";
import { headers } from "next/headers";
import PublicShell from "../../_ui/PublicShell";
import CreatorProfileFields from "../../_ui/CreatorProfileFields";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { profileFromForm, saveProfile, compact, str } from "@/lib/net/creators";
import { lookupProfile, metaReady } from "@/lib/net/meta";
import { profileGaps } from "@/lib/net/match";
import { uploadsReady, uploadCreatorImage, deleteBlob, UPLOAD_MAX_FILES } from "@/lib/net/blob";
import { audit, logError } from "@/lib/net/security";

export const metadata = { title: "Your profile", robots: { index: false } };

const back = (tone, msg) => `/creator/profile?tone=${tone}&msg=${encodeURIComponent(msg)}`;

async function savePayout(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  const upi = str(fd.get("upi_id"));
  const pan4 = String(fd.get("pan_last4") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-4) || null;
  const gstin = String(fd.get("gstin") ?? "").toUpperCase().replace(/\s/g, "") || null;
  if (upi && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upi)) redirect(back("bad", "That UPI ID looks wrong. It should look like name@okhdfcbank."));
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) redirect(back("bad", "That GSTIN looks wrong. It has 15 characters, like 07ABCDE1234F1Z5."));
  await env.DB.prepare("UPDATE creators SET upi_id=?, pan_name=?, pan_last4=?, gstin=? WHERE id=?").bind(upi, str(fd.get("pan_name")), pan4, gstin, me.creator.id).run();
  redirect(back("good", "Payout details saved."));
}

async function verifyBio() {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  const code = me.creator.verify_code;
  let dest;
  if (!code) dest = back("bad", "Refresh the page to get your code.");
  else if (!metaReady(env)) dest = back("bad", "Automatic checking is not switched on yet. The Colatch team will verify your code manually within a day.");
  else {
    try {
      const ig = await lookupProfile(env, me.creator.handle);
      if ((ig.bio || "").toUpperCase().includes(code)) {
        await env.DB.prepare("UPDATE creators SET owner_verified=1, verified=1, followers=?, engagement_rate=?, profile_pic=COALESCE(?, profile_pic) WHERE id=?").bind(ig.followers, ig.engagement_rate, ig.profile_pic, me.creator.id).run();
        dest = back("good", "Verified ✓ You can remove the code from your bio now.");
      } else dest = back("bad", `We couldn't find ${code} in your Instagram bio yet. Instagram can take a few minutes to update. Try again shortly.`);
    } catch (e) { dest = back("bad", e instanceof Error ? e.message : "Could not check Instagram right now."); }
  }
  redirect(dest);
}

async function saveMain(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  const p = profileFromForm(fd);
  if (!p.skills) redirect(back("bad", "Pick at least one thing you do."));
  await saveProfile(env, me.creator.id, p);
  const name = str(fd.get("name"));
  if (name) await env.DB.prepare("UPDATE creators SET name=? WHERE id=?").bind(name, me.creator.id).run();
  redirect(back("good", "Saved. Your matches have been updated."));
}

// ---- Work samples (images on the media kit). Each file is checked again in lib/net/blob.ts.
async function uploadMedia(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  const file = fd.get("file");
  if (!file || typeof file === "string" || !file.size) redirect(back("bad", "Choose an image to upload.") + "#media");
  const caption = String(fd.get("caption") ?? "").trim().slice(0, 140) || null;
  const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM creator_media WHERE creator_id=?").bind(me.creator.id).first();
  if (Number(have?.n || 0) >= UPLOAD_MAX_FILES) redirect(back("bad", `You can show up to ${UPLOAD_MAX_FILES} images. Delete one to add another.`) + "#media");
  let dest;
  try {
    const up = await uploadCreatorImage(me.creator.id, file);
    if (!up.ok) dest = back("bad", up.error);
    else {
      // The limit is checked again in the insert itself, so two uploads at once can't pass 6.
      const id = crypto.randomUUID();
      const r = await env.DB.prepare(
        "INSERT INTO creator_media (id, creator_id, url, content_type, bytes, caption) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM creator_media WHERE creator_id = ?) < ? RETURNING id"
      ).bind(id, me.creator.id, up.url, up.contentType, up.bytes, caption, me.creator.id, UPLOAD_MAX_FILES).first();
      if (!r) { await deleteBlob(up.url); dest = back("bad", `You can show up to ${UPLOAD_MAX_FILES} images. Delete one to add another.`); }
      else {
        await audit({ kind: "creator", id: me.creator.id }, "media.uploaded", "creator", me.creator.id, { media: id, bytes: up.bytes });
        dest = back("good", "Image added to your media kit.");
      }
    }
  } catch (e) {
    await logError("creator/profile.uploadMedia", e);
    dest = back("bad", "The upload didn't go through. Nothing was saved; try again.");
  }
  redirect(dest + "#media");
}

async function deleteMedia(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  // Owner check is in the WHERE clause: a creator can only delete their own images.
  const row = await env.DB.prepare("DELETE FROM creator_media WHERE id=? AND creator_id=? RETURNING id, url").bind(String(fd.get("id") ?? ""), me.creator.id).first();
  if (!row) redirect(back("bad", "That image was already removed.") + "#media");
  const gone = await deleteBlob(row.url);
  if (!gone) await logError("creator/profile.deleteMedia", new Error("Blob delete failed; file left in storage"), { media: row.id });
  await audit({ kind: "creator", id: me.creator.id }, "media.deleted", "creator", me.creator.id, { media: row.id, storage_deleted: gone });
  redirect(back("good", "Image removed from your media kit.") + "#media");
}

export default async function Page({ searchParams }) {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  // A pending profile claim sees none of that creator's data, and writes nothing.
  if (me.claimPending) return <PublicShell creatorName={me.creator.name || me.creator.handle} path="/creator/profile"><ClaimNote status="pending" /></PublicShell>;
  if (!me.creator.verify_code) {
    const code = "CLT" + [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    await env.DB.prepare("UPDATE creators SET verify_code=? WHERE id=? AND verify_code IS NULL").bind(code, me.creator.id).run();
    me.creator.verify_code = code;
  }
  const c = me.creator;
  const gaps = profileGaps(c);
  const done = Math.round(((8 - gaps.length) / 8) * 100);
  const flash = searchParams?.msg || "";
  const tone = searchParams?.tone === "bad" ? "bad" : "good";
  const origin = `https://${headers().get("host")}`;
  const media = (await env.DB.prepare("SELECT id, url, caption FROM creator_media WHERE creator_id=? ORDER BY created_at").bind(c.id).all().catch(() => ({ results: [] }))).results ?? [];
  const canUpload = uploadsReady();
  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/profile">
      <div className="wrap narrow" style={{ padding: 0 }}>
        <div className="spread" style={{ marginBottom: 18 }}>
          <div><div className="lbl">Profile</div><h1 style={{ margin: "6px 0 0", fontWeight: 300, fontSize: 30, color: "var(--head)" }}>@{c.handle}</h1></div>
          <div className="row" style={{ gap: 12 }}><div className="score" style={{ "--v": done }}><i>{done}%</i></div><span className="small muted">complete</span></div>
        </div>
        <div className="note info" style={{ marginBottom: 16 }}>Your public media kit: <a className="link" href={`/m/${c.handle}`} target="_blank">{origin}/m/{c.handle}</a>. Put it in your Instagram bio so brands can book you through Colatch.</div>
        {flash && <div className={`note ${tone}`} style={{ marginBottom: 16 }}>{flash} {tone === "good" && <a className="link" href="/creator">See matches →</a>}</div>}
        {c.verified ? <div className="note info" style={{ marginBottom: 16 }}>✓ Your follower count ({compact(c.followers)}) comes from Instagram and updates automatically.</div> : null}
        {!c.owner_verified && <form className="panel pad" action={verifyBio} style={{ marginBottom: 18 }}>
          <h2>Prove this is your account</h2>
          <p style={{ margin: "0 0 12px", color: "var(--ink-2)" }}>Add <code className="k" style={{ fontSize: 14 }}>{c.verify_code}</code> anywhere in your Instagram bio, then tap check. Verified creators get a ✓ that brands see, and rank higher in matches.</p>
          <button className="btn plum">Check my bio</button>
        </form>}
        {c.owner_verified ? <div className="note good" style={{ marginBottom: 16 }}>✓ Account ownership verified.</div> : null}

        <form className="panel pad" action={savePayout} id="payout" style={{ marginBottom: 18 }}>
          <h2>Payout details</h2>
          <div className="form-grid">
            <div className="fld"><label htmlFor="f-creator-profile-upi-id-1">UPI ID</label><input id="f-creator-profile-upi-id-1" name="upi_id" defaultValue={c.upi_id ?? ""} placeholder="yourname@okhdfcbank" /></div>
            <div className="fld"><label htmlFor="f-creator-profile-pan-name-2">Name as on PAN</label><input id="f-creator-profile-pan-name-2" name="pan_name" defaultValue={c.pan_name ?? ""} /></div>
            <div className="fld"><label htmlFor="f-creator-profile-pan-last4-3">Last 4 characters of PAN</label><input id="f-creator-profile-pan-last4-3" name="pan_last4" defaultValue={c.pan_last4 ?? ""} maxLength={4} placeholder="1234" /><span className="hint">We never store your full PAN here. The team collects it securely before your first payout.</span></div>
            <div className="fld"><label htmlFor="f-creator-profile-gstin-4">GSTIN <span className="opt">— only if registered</span></label><input id="f-creator-profile-gstin-4" name="gstin" defaultValue={c.gstin ?? ""} /></div>
          </div>
          <p className="hint" style={{ margin: "12px 0 0" }}>Without a PAN, TDS is deducted at 20% instead of 10%.</p>
          <button className="btn plum" style={{ marginTop: 14 }}>Save payout details</button>
        </form>

        <section className="panel pad" id="media" aria-labelledby="media-h" style={{ marginBottom: 18 }}>
          <h2 id="media-h">Work samples</h2>
          <p style={{ margin: "0 0 12px", color: "var(--ink-2)" }}>Up to {UPLOAD_MAX_FILES} images on your media kit: JPEG, PNG or WebP, 4 MB each. Show finished work, not your contact details.</p>
          {media.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, marginBottom: 14 }}>
            {media.map((m) => (
              <figure key={m.id} style={{ margin: 0 }}>
                <div style={{ aspectRatio: "4 / 5", overflow: "hidden", borderRadius: 10, background: "var(--line, #eee)" }}><img src={m.url} alt={m.caption || "Work sample"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
                <figcaption className="small muted" style={{ margin: "6px 0" }}>{m.caption || "No caption"}</figcaption>
                <form action={deleteMedia}><input type="hidden" name="id" value={m.id} /><button className="btn" style={{ minHeight: 44, width: "100%" }}>Delete</button></form>
              </figure>
            ))}
          </div>}
          {!canUpload ? <div className="note info">Uploads aren't switched on yet; add your best reels as links below.</div>
            : media.length >= UPLOAD_MAX_FILES ? <p className="hint" style={{ margin: 0 }}>You're showing {UPLOAD_MAX_FILES} images, the most allowed. Delete one to add another.</p>
            : <form action={uploadMedia} className="form-grid">
                <div className="fld"><label htmlFor="f-media-file">Image</label><input id="f-media-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
                <div className="fld"><label htmlFor="f-media-caption">Caption <span className="opt">— optional</span></label><input id="f-media-caption" name="caption" maxLength={140} placeholder="e.g. Reel for a skincare launch" /></div>
                <div><button className="btn plum" style={{ minHeight: 44 }}>Upload image</button></div>
              </form>}
        </section>

        <form className="panel pad" action={saveMain}>
          <div className="fld" style={{ marginBottom: 18 }}><label htmlFor="f-creator-profile-name-5">Name</label><input id="f-creator-profile-name-5" name="name" defaultValue={c.name ?? ""} /></div>
          <CreatorProfileFields v={c} />
          <button className="btn-foil" style={{ marginTop: 22 }}>Save profile</button>
        </form>
      </div>
    </PublicShell>
  );
}
