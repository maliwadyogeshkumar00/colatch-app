import { redirect } from "next/navigation";
import { ClaimNote } from "@/app/(net)/join/_claim.js";
import { headers } from "next/headers";
import PublicShell from "../../_ui/PublicShell";
import CreatorProfileFields from "../../_ui/CreatorProfileFields";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { profileFromForm, saveProfile, compact, inr, str, PLATFORMS, PLATFORM_LABEL, platformFromForm, creatorPlatforms } from "@/lib/net/creators";
import { parseAudience, audienceFormValues, audienceSourceLabel, readAudience, AGE_BANDS, MAX_CITIES, ageField, cityField, cityPctField, genderField } from "@/lib/net/audience";
import { lookupProfile, metaReady } from "@/lib/net/meta";
import { profileGaps } from "@/lib/net/match";
import { uploadsReady, uploadCreatorImage, deleteBlob, UPLOAD_MAX_FILES } from "@/lib/net/blob";
import { audit, logError } from "@/lib/net/security";
import { safeUrl } from "@/lib/net/guard";
import { inrShort } from "@/lib/net/dashboard";
import { PageHeader, Grid, SummaryRail, Avatar } from "@/components/ui";

export const metadata = { title: "Your profile", robots: { index: false } };

const back = (tone, msg) => `/creator/profile?tone=${tone}&msg=${encodeURIComponent(msg)}`;
// Messages for the audience and platform sections show inside that section, where the page lands.
const backAt = (at, tone, msg) => `${back(tone, msg)}&at=${at}#${at}`;
const SECTIONS = ["audience", "platforms"];

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

// ---- Audience split from Instagram Insights (creators.audience). Saving new numbers makes them self-reported again.
async function saveAudience(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  const { audience, errors } = parseAudience(fd);
  if (!audience) redirect(backAt("audience", "bad", errors.slice(0, 3).join(" ")));
  const json = JSON.stringify(audience);
  // A split the team already checked stays checked only if the numbers did not change.
  await env.DB.prepare(
    "UPDATE creators SET audience_source = CASE WHEN audience_source = 'team_checked' AND audience = ?::jsonb THEN 'team_checked' ELSE 'self_reported' END, audience = ?::jsonb, audience_updated_at = now(), updated_at = datetime('now') WHERE id = ?"
  ).bind(json, json, me.creator.id).run();
  await audit({ kind: "creator", id: me.creator.id }, "audience.saved", "creator", me.creator.id, { cities: audience.cities.length, gender: !!audience.gender, age: !!audience.age });
  redirect(backAt("audience", "good", "Audience saved. It now shows on your media kit."));
}

async function clearAudience() {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  await env.DB.prepare("UPDATE creators SET audience = NULL, audience_source = NULL, audience_updated_at = NULL, updated_at = datetime('now') WHERE id = ?").bind(me.creator.id).run();
  await audit({ kind: "creator", id: me.creator.id }, "audience.cleared", "creator", me.creator.id);
  redirect(backAt("audience", "good", "Audience numbers removed."));
}

// ---- Other platforms (creator_platforms): one row per platform, saved again to update.
async function savePlatform(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  const { value: p, error } = platformFromForm(fd);
  if (!p) redirect(backAt("platforms", "bad", error));
  await env.DB.prepare(
    `INSERT INTO creator_platforms (creator_id, platform, handle, url, followers, avg_views, updated_at) VALUES (?,?,?,?,?,?, now())
     ON CONFLICT (creator_id, platform) DO UPDATE SET handle = excluded.handle, url = excluded.url, followers = excluded.followers, avg_views = excluded.avg_views, updated_at = now()`
  ).bind(me.creator.id, p.platform, p.handle, p.url, p.followers, p.avg_views).run();
  await audit({ kind: "creator", id: me.creator.id }, "platform.saved", "creator", me.creator.id, { platform: p.platform });
  redirect(backAt("platforms", "good", `${PLATFORM_LABEL[p.platform]} saved.`));
}

async function deletePlatform(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/profile");
  if (me.claimPending) redirect("/creator/profile");
  // Owner check is in the WHERE clause.
  const row = await env.DB.prepare("DELETE FROM creator_platforms WHERE creator_id = ? AND platform = ? RETURNING platform").bind(me.creator.id, String(fd.get("platform") ?? "")).first();
  if (!row) redirect(backAt("platforms", "bad", "That platform was already removed."));
  await audit({ kind: "creator", id: me.creator.id }, "platform.deleted", "creator", me.creator.id, { platform: row.platform });
  redirect(backAt("platforms", "good", `${PLATFORM_LABEL[row.platform] || "Platform"} removed.`));
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
  const at = SECTIONS.includes(searchParams?.at) ? searchParams.at : "";
  const here = (sec) => (flash && at === sec ? <div className={`note ${tone}`} role={tone === "bad" ? "alert" : "status"} style={{ margin: "12px 0" }}>{flash}</div> : null);
  const origin = `https://${headers().get("host")}`;
  const media = (await env.DB.prepare("SELECT id, url, caption FROM creator_media WHERE creator_id=? ORDER BY created_at").bind(c.id).all().catch(() => ({ results: [] }))).results ?? [];
  const canUpload = uploadsReady();
  const aud = audienceFormValues(c.audience);
  const hasAudience = !!readAudience(c.audience);
  const platforms = await creatorPlatforms(env, c.id);
  const pfEdit = platforms.find((p) => p.platform === searchParams?.pf) || null;
  const pfDefault = pfEdit?.platform || PLATFORMS.find((p) => !platforms.some((x) => x.platform === p.id))?.id || PLATFORMS[0].id;
  const kitTags = [...String(c.skills || "").split(","), ...String(c.niche || "").split(",")].map((x) => x.trim()).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const pic = safeUrl(c.profile_pic);
  const reels = String(c.portfolio_links || "").split(/\s+/).filter(Boolean).length;
  const SECS = [["basics", "What you make"], ["payout", "Payout"], ["media", "Work samples"], ["audience", "Audience"], ["platforms", "Platforms"]];
  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/profile">
      <div className="cr-page">
        <PageHeader crumbs={[{ label: "Home", href: "/creator" }, "Profile"]} eyebrow="Profile · media kit" title={`@${c.handle}`}
          sub="What you fill in here decides which briefs you see, and builds the media kit brands open before they book you."
          meta={[{ label: "Complete", value: `${done}%`, gold: done === 100 }, { label: "Work samples", value: `${media.length}/${UPLOAD_MAX_FILES}` }, { label: "Platforms", value: 1 + platforms.length }]} />
        {flash && !at && <div className={`note ${tone}`}>{flash} {tone === "good" && <a className="link" href="/creator">See matches →</a>}</div>}
        <nav className="cr-secnav" aria-label="Profile sections">{SECS.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}</nav>

        <Grid aside={<>
          <section className="cr-kitmini" aria-labelledby="kitmini-h">
            <p className="cr-kitmini__eb">Your media kit · what brands see</p>
            <div className="cr-kitmini__who">
              <Avatar name={c.name || c.handle} src={pic || undefined} size={56} />
              <div style={{ minWidth: 0 }}><h2 id="kitmini-h" className="cr-kitmini__name">{c.name || c.handle}</h2><p className="cr-kitmini__sub">@{c.handle}{c.city ? ` · ${c.city}` : ""}</p></div>
            </div>
            {c.bio_pitch && <p className="cr-kitmini__bio">{c.bio_pitch}</p>}
            {kitTags.length > 0 && <div className="cr-kitmini__tags">{kitTags.slice(0, 5).map((t) => <span key={t}>{t}</span>)}</div>}
            <dl className="cr-kitmini__stats">
              <div><dt>Followers</dt><dd>{c.followers ? compact(c.followers) : "—"}</dd></div>
              <div><dt>Avg views</dt><dd>{c.avg_views ? compact(c.avg_views) : "—"}</dd></div>
              <div><dt>1 Reel</dt><dd>{c.rate_reel ? inrShort(c.rate_reel) : "—"}</dd></div>
            </dl>
            <a className="cr-kitmini__open" href={`/m/${c.handle}`} target="_blank">Open my media kit ↗</a>
          </section>
          <SummaryRail title="What's filled in" items={[
            { label: "What you do", value: c.skills ? String(c.skills).split(",").filter(Boolean).length + " picked" : "" },
            { label: "City", value: c.city || "" },
            { label: "Followers", value: c.followers ? compact(c.followers) : "" },
            { label: "Reel rate", value: c.rate_reel ? inr(c.rate_reel) : "" },
            { label: "Best reels", value: reels ? `${reels} ${reels === 1 ? "link" : "links"}` : "" },
            { label: "WhatsApp", value: c.phone ? "Added" : "" },
            { label: "UPI for payouts", value: c.upi_id ? "Added" : "" },
            { label: "Audience split", value: hasAudience ? "Added" : "" },
          ]} total={{ label: "Profile complete", value: `${done}%` }}>
            <p className="hint" style={{ margin: 0 }}>{gaps.length ? <>Missing: {gaps.slice(0, 3).join(", ")}. Saved values show here and on your media kit.</> : "Everything brands look for is filled in."}</p>
          </SummaryRail>
          <p className="hint" style={{ margin: 0 }}>Put <a className="link" href={`/m/${c.handle}`} target="_blank">{origin}/m/{c.handle}</a> in your Instagram bio so brands can book you through Colatch.</p>
        </>}>
          <div className="stack cr-forms">
        {c.verified ? <div className="note info">✓ Your follower count ({compact(c.followers)}) comes from Instagram and updates automatically.</div> : null}
        {!c.owner_verified && <form className="panel pad" action={verifyBio}>
          <h2>Prove this is your account</h2>
          <p style={{ margin: "0 0 12px", color: "var(--ink-2)" }}>Add <code className="k" style={{ fontSize: 14 }}>{c.verify_code}</code> anywhere in your Instagram bio, then tap check. Verified creators get a ✓ that brands see, and rank higher in matches.</p>
          <button className="btn plum">Check my bio</button>
        </form>}
        {c.owner_verified ? <div className="note good">✓ Account ownership verified.</div> : null}
        <form className="panel pad" action={saveMain} id="basics">
          <h2>What you make</h2>
          <div className="fld" style={{ marginBottom: 18 }}><label htmlFor="f-creator-profile-name-5">Name</label><input id="f-creator-profile-name-5" name="name" defaultValue={c.name ?? ""} /></div>
          <CreatorProfileFields v={c} />
          <button className="btn-foil" style={{ marginTop: 22 }}>Save profile</button>
        </form>
        <form className="panel pad" action={savePayout} id="payout">
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
        <section className="panel pad" id="media" aria-labelledby="media-h">
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
        <form className="panel pad aud-form" action={saveAudience} id="audience" aria-labelledby="audience-h">
          <div className="spread"><h2 id="audience-h" style={{ margin: 0 }}>Your audience</h2>{hasAudience && <span className={`pill ${c.audience_source === "team_checked" ? "good" : "ok"}`}>{c.audience_source === "team_checked" ? "Checked by Colatch" : "Self-reported"}</span>}</div>
          <p style={{ margin: "10px 0 4px", color: "var(--ink-2)" }}>Brands ask who watches you. Open Instagram → Professional dashboard → Total followers, and copy the numbers here. Fill in any part you have; each part should add up to about 100%.</p>
          {hasAudience && <p className="hint" style={{ margin: "0 0 4px" }}>{audienceSourceLabel(c)}</p>}
          {here("audience")}
          <fieldset className="aud-group">
            <legend>Top cities <span className="opt">— up to {MAX_CITIES}, % of followers</span></legend>
            {Array.from({ length: MAX_CITIES }, (_, i) => i + 1).map((i) => (
              <div className="aud-row" key={i}>
                <div className="fld"><label htmlFor={`f-aud-city-${i}`}>City {i}</label><input id={`f-aud-city-${i}`} name={cityField(i)} list="pcities" maxLength={40} defaultValue={aud[cityField(i)] ?? ""} placeholder={i === 1 ? "Mumbai" : ""} /></div>
                <div className="fld"><label htmlFor={`f-aud-city-pct-${i}`}>Share %</label><input id={`f-aud-city-pct-${i}`} name={cityPctField(i)} inputMode="decimal" maxLength={5} defaultValue={aud[cityPctField(i)] ?? ""} placeholder={i === 1 ? "31" : ""} /></div>
              </div>
            ))}
          </fieldset>
          <fieldset className="aud-group">
            <legend>Gender <span className="opt">— % of followers</span></legend>
            <div className="aud-nums">
              {[["women", "Women"], ["men", "Men"], ["other", "Other"]].map(([k, l]) => <div className="fld" key={k}><label htmlFor={`f-aud-${k}`}>{l} %</label><input id={`f-aud-${k}`} name={genderField(k)} inputMode="decimal" maxLength={5} defaultValue={aud[genderField(k)] ?? ""} /></div>)}
            </div>
          </fieldset>
          <fieldset className="aud-group">
            <legend>Age <span className="opt">— % of followers</span></legend>
            <div className="aud-nums">
              {AGE_BANDS.map((b) => <div className="fld" key={b}><label htmlFor={`f-${ageField(b)}`}>{b} %</label><input id={`f-${ageField(b)}`} name={ageField(b)} inputMode="decimal" maxLength={5} defaultValue={aud[ageField(b)] ?? ""} /></div>)}
            </div>
          </fieldset>
          <div className="row" style={{ marginTop: 18, gap: 10 }}>
            <button className="btn plum">Save audience</button>
            {hasAudience && <button className="btn ghost" formAction={clearAudience} formNoValidate>Remove audience numbers</button>}
          </div>
        </form>
        <section className="panel pad" id="platforms" aria-labelledby="platforms-h">
          <h2 id="platforms-h">Other platforms</h2>
          <p style={{ margin: "0 0 12px", color: "var(--ink-2)" }}>Add where else you post. Brands booking YouTube, Moj or ShareChat find you by this.</p>
          {here("platforms")}
          {platforms.length > 0 && <ul className="pf-list">
            {platforms.map((p) => (
              <li key={p.platform}>
                <span className="pf-mark" aria-hidden="true">{PLATFORMS.find((x) => x.id === p.platform)?.mark}</span>
                <div className="pf-txt"><b>{PLATFORM_LABEL[p.platform]}</b><span>@{p.handle}{p.followers != null ? ` · ${compact(p.followers)} followers` : ""}{p.avg_views != null ? ` · ${compact(p.avg_views)} avg views` : ""}</span></div>
                <div className="pf-act">
                  <a className="btn sm" href={`/creator/profile?pf=${p.platform}#platforms`}>Edit</a>
                  <form action={deletePlatform}><input type="hidden" name="platform" value={p.platform} /><button className="btn sm" aria-label={`Remove ${PLATFORM_LABEL[p.platform]}`}>Remove</button></form>
                </div>
              </li>
            ))}
          </ul>}
          <form action={savePlatform} className="form-grid" key={pfDefault}>
            <div className="fld"><label htmlFor="f-pf-platform">Platform</label><select id="f-pf-platform" name="platform" defaultValue={pfDefault}>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}{platforms.some((x) => x.platform === p.id) ? " (added)" : ""}</option>)}</select></div>
            <div className="fld"><label htmlFor="f-pf-handle">Handle or profile link</label><input id="f-pf-handle" name="handle" required maxLength={300} autoCapitalize="none" spellCheck={false} defaultValue={pfEdit?.handle ?? ""} placeholder="@yourname" /></div>
            <div className="fld full"><label htmlFor="f-pf-url">Profile link <span className="opt">— optional, https:// only</span></label><input id="f-pf-url" name="url" type="url" inputMode="url" maxLength={300} defaultValue={pfEdit?.url ?? ""} placeholder="https://www.youtube.com/@yourname" /></div>
            <div className="fld"><label htmlFor="f-pf-followers">Followers or subscribers</label><input id="f-pf-followers" name="followers" inputMode="numeric" defaultValue={pfEdit?.followers ?? ""} placeholder="e.g. 45K or 1.2L" /></div>
            <div className="fld"><label htmlFor="f-pf-views">Avg views per video <span className="opt">— optional</span></label><input id="f-pf-views" name="avg_views" inputMode="numeric" defaultValue={pfEdit?.avg_views ?? ""} placeholder="e.g. 30K" /></div>
            <div className="full"><button className="btn plum">{pfEdit ? `Update ${PLATFORM_LABEL[pfEdit.platform]}` : "Save platform"}</button>{pfEdit && <a className="btn ghost" href="/creator/profile#platforms" style={{ marginLeft: 8 }}>Cancel</a>}</div>
          </form>
        </section>
          </div>
        </Grid>
      </div>
    </PublicShell>
  );
}
