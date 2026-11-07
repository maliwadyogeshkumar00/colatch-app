import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import { flashUrl } from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { lookupProfile, metaReady, cleanHandle } from "@/lib/net/meta";
import { upsertFromInstagram, compact, erBand, tierFor, int, str, parseCsv, mapCsvRows, NICHES, CREATOR_STATUSES, STAGE_LABEL } from "@/lib/net/creators";
import { SKILLS, LANGUAGES, CITIES } from "@/lib/net/match";

export const metadata = { title: "Influencer finder · Colatch Connect", robots: { index: false, follow: false } };

async function saveLookup(fd) {
  "use server";
  await requireTeam();
  const handle = String(fd.get("handle") ?? "");
  let id;
  try {
    const p = await lookupProfile(env, handle);
    id = await upsertFromInstagram(env, p);
    await env.DB.prepare("UPDATE creators SET verified = 1 WHERE id = ?").bind(id).run();
  } catch (e) {
    redirect(`/team/creators?lookup=${encodeURIComponent(handle)}&lerr=${encodeURIComponent(e instanceof Error ? e.message : "Lookup failed.")}`);
  }
  redirect(`/team/creators/${id}?saved=1`);
}

async function addCreator(fd) {
  "use server";
  await requireTeam();
  const handle = cleanHandle(String(fd.get("handle") ?? ""));
  if (!handle) redirect(flashUrl("/team/creators#add", "err", "Add an Instagram handle."));
  const exists = await env.DB.prepare("SELECT id FROM creators WHERE handle = ?").bind(handle).first();
  if (exists) redirect(`/team/creators/${exists.id}`);
  const id = crypto.randomUUID();
  const followers = int(fd.get("followers"));
  await env.DB.prepare(
    `INSERT INTO creators (id, handle, name, skills, niche, city, language, gender, followers, rate_reel, phone, email, tier, source, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'manual',?)`
  ).bind(id, handle, str(fd.get("name")), fd.getAll("skills").map(String).join(", ") || null, str(fd.get("niche")), str(fd.get("city")),
    str(fd.get("language")), str(fd.get("gender")), followers, int(fd.get("rate_reel")), str(fd.get("phone")), str(fd.get("email")),
    tierFor(followers), str(fd.get("notes"))).run();
  redirect(`/team/creators/${id}?saved=1`);
}

async function importSheet(fd) {
  "use server";
  await requireTeam();
  let msg = "", bad = false;
  try {
    let text = String(fd.get("csv") ?? "");
    const file = fd.get("file");
    if (file && typeof file === "object" && "text" in file && file.size) text = await file.text();
    const rows = mapCsvRows(parseCsv(text));
    if (!rows.length) throw new Error("No rows found. Paste a sheet with a header row.");
    const stmts = [];
    for (const r of rows.slice(0, 2000)) {
      const handle = cleanHandle(r.handle);
      if (!handle) continue;
      const followers = int(r.followers);
      const er = r.engagement_rate ? parseFloat(r.engagement_rate.replace("%", "")) : null;
      // Postgres needs the existing-row columns qualified (creators.x) inside ON CONFLICT DO UPDATE.
      stmts.push(env.DB.prepare(
        `INSERT INTO creators (id, handle, name, niche, city, state, language, gender, followers, avg_views, engagement_rate, email, phone, rate_reel, rate_story, rate_post, tags, notes, tier, source)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'csv')
         ON CONFLICT(handle) DO UPDATE SET name=COALESCE(excluded.name,creators.name), niche=COALESCE(excluded.niche,creators.niche), city=COALESCE(excluded.city,creators.city),
           language=COALESCE(excluded.language,creators.language), gender=COALESCE(excluded.gender,creators.gender), followers=COALESCE(excluded.followers,creators.followers),
           avg_views=COALESCE(excluded.avg_views,creators.avg_views), engagement_rate=COALESCE(excluded.engagement_rate,creators.engagement_rate),
           email=COALESCE(excluded.email,creators.email), phone=COALESCE(excluded.phone,creators.phone), rate_reel=COALESCE(excluded.rate_reel,creators.rate_reel),
           rate_story=COALESCE(excluded.rate_story,creators.rate_story), rate_post=COALESCE(excluded.rate_post,creators.rate_post), tags=COALESCE(excluded.tags,creators.tags),
           notes=COALESCE(excluded.notes,creators.notes), tier=COALESCE(excluded.tier,creators.tier), updated_at=datetime('now')`
      ).bind(crypto.randomUUID(), handle, r.name ?? null, r.niche ?? null, r.city ?? null, r.state ?? null, r.language ?? null, r.gender ?? null,
        followers, int(r.avg_views), er != null && isFinite(er) ? er : null, r.email ?? null, r.phone ?? null, int(r.rate_reel), int(r.rate_story),
        int(r.rate_post), r.tags ?? null, r.notes ?? null, tierFor(followers)));
    }
    const before = (await env.DB.prepare("SELECT COUNT(*) n FROM creators").first())?.n ?? 0;
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    const after = (await env.DB.prepare("SELECT COUNT(*) n FROM creators").first())?.n ?? 0;
    const added = after - before, updated = stmts.length - added;
    msg = `Imported ${stmts.length} rows: ${added} new creators, ${updated} updated.`;
  } catch (e) { msg = e instanceof Error ? e.message : "Something went wrong."; bad = true; }
  redirect(flashUrl("/team/creators", bad ? "err" : "ok", msg));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const u = searchParams ?? {};
  const ig = metaReady(env);

  // Instagram lookup runs on GET (?lookup=handle) so the result survives the round-trip.
  let lookup = null;
  let lookupErr = u.lerr ?? "";
  if (u.lookup && ig && !lookupErr) {
    try { lookup = await lookupProfile(env, String(u.lookup)); } catch (e) { lookupErr = e instanceof Error ? e.message : "Lookup failed."; }
  }

  const q = String(u.q ?? "").trim();
  const fSkill = u.skill ?? "";
  const fNiche = u.niche ?? "";
  const fCity = u.city ?? "";
  const fLang = u.lang ?? "";
  const fGender = u.gender ?? "";
  const fMin = int(u.fmin);
  const fMax = int(u.fmax);
  const fEr = u.er ? parseFloat(u.er) : null;
  const fStatus = u.status ?? "";
  const sort = u.sort ?? "followers";
  const where = ["status <> 'blacklisted'"];
  const args = [];
  if (q) { where.push("(handle LIKE ? OR name LIKE ? OR bio LIKE ? OR tags LIKE ? OR notes LIKE ? OR skills LIKE ? OR niche LIKE ?)"); for (let i = 0; i < 7; i++) args.push(`%${q}%`); }
  if (fSkill) { where.push("skills LIKE ?"); args.push(`%${fSkill.split(" ")[0]}%`); }
  if (fNiche) { where.push("niche LIKE ?"); args.push(`%${fNiche}%`); }
  if (fCity) { where.push("city LIKE ?"); args.push(`%${fCity}%`); }
  if (fLang) { where.push("language LIKE ?"); args.push(`%${fLang}%`); }
  if (fGender) { where.push("gender = ?"); args.push(fGender); }
  if (fMin != null) { where.push("followers >= ?"); args.push(fMin); }
  if (fMax != null) { where.push("followers <= ?"); args.push(fMax); }
  if (fEr != null && !isNaN(fEr)) { where.push("engagement_rate >= ?"); args.push(fEr); }
  if (fStatus === "blacklisted") { where[0] = "status = 'blacklisted'"; } else if (fStatus) { where.push("status = ?"); args.push(fStatus); }
  const order = sort === "er" ? "engagement_rate DESC NULLS LAST" : sort === "quality" ? "quality_score DESC NULLS LAST" : sort === "new" ? "created_at DESC" : "followers DESC NULLS LAST";
  let rows = [];
  let total = 0;
  let dbErr = "";
  try {
    rows = (await env.DB.prepare(`SELECT * FROM creators WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 200`).bind(...args).all()).results ?? [];
    total = (await env.DB.prepare("SELECT COUNT(*) n FROM creators").first())?.n ?? 0;
  } catch (e) { dbErr = e instanceof Error ? e.message : String(e); }
  const filtered = Boolean(q || fSkill || fNiche || fCity || fLang || fGender || fMin != null || fMax != null || fEr != null || fStatus);
  const initials = (s) => String(s).replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const flash = u.err || u.ok;
  const lb = lookup ? erBand(lookup.engagement_rate, lookup.followers) : null;

  return (
    <TeamShell active="finder" eyebrow="Creator tools" title="Find the <b>right creator</b>." email={me.email}
      actions={<a className="btn-foil" href="#add">+ Add creators</a>}>
      <p className="lead">Search Colatch's own creator database by talent, niche, city, language and size. Look up any public Instagram creator or business account by handle and save it here with live numbers.</p>

      {dbErr && <div className="note bad" style={{ marginBottom: 18 }}><b>Database not reachable.</b> ({dbErr})</div>}
      {flash && <div className={`note ${u.err ? "bad" : "good"}`} style={{ marginBottom: 18 }}>{flash}</div>}

      <div className="panel pad">
        <div className="spread"><h2 style={{ margin: 0 }}>Look up on Instagram</h2>{ig ? <span className="pill good">Instagram connected</span> : <span className="pill ok">Instagram not connected</span>}</div>
        <form method="get" className="row" style={{ marginTop: 14 }}>
          <input className="in" style={{ flex: 1, minWidth: 220 }} name="lookup" placeholder="@handle or instagram.com/handle" required defaultValue={lookup?.handle ?? u.lookup ?? ""} />
          <button className="btn plum" type="submit" disabled={!ig}>Look up</button>
        </form>
        {!ig && <p className="hint" style={{ margin: "10px 0 0" }}>Connect Colatch's Instagram business account (META_ACCESS_TOKEN and META_IG_USER_ID in Vercel) to pull live followers and engagement. Until then, add creators by hand or import a sheet below.</p>}
        {lookupErr && <div className="note bad" style={{ marginTop: 14 }}>{lookupErr}</div>}
        {lookup && (
          <div className="panel pad" style={{ marginTop: 16, boxShadow: "none", background: "var(--ivory)" }}>
            <div className="spread">
              <div className="who"><div className="ava" style={{ width: 56, height: 56 }}>{lookup.profile_pic ? <img src={lookup.profile_pic} alt="" /> : initials(lookup.handle)}</div>
                <div><b style={{ fontSize: 17 }}>{lookup.name || lookup.handle}</b><span>@{lookup.handle} · {tierFor(lookup.followers)}</span></div></div>
              <form action={saveLookup} className="row"><input type="hidden" name="handle" value={lookup.handle} /><button className="btn plum">Save to database</button></form>
            </div>
            <div className="grid4" style={{ marginTop: 16 }}>
              <div><div className="lbl">Followers</div><div style={{ fontSize: 22, fontWeight: 300 }}>{compact(lookup.followers)}</div></div>
              <div><div className="lbl">Engagement</div><div style={{ fontSize: 22, fontWeight: 300 }}>{lookup.engagement_rate}% <span className={`pill ${lb.tone}`}>{lb.label}</span></div></div>
              <div><div className="lbl">Avg likes · comments</div><div style={{ fontSize: 22, fontWeight: 300 }}>{compact(lookup.avg_likes)} · {compact(lookup.avg_comments)}</div></div>
              <div><div className="lbl">Posts / week · Reels</div><div style={{ fontSize: 22, fontWeight: 300 }}>{lookup.posts_per_week} · {Math.round(lookup.reel_share * 100)}%</div></div>
            </div>
            {lookup.bio && <p className="muted small" style={{ margin: "14px 0 0", whiteSpace: "pre-line" }}>{lookup.bio}</p>}
          </div>
        )}
      </div>

      <form className="panel filters sec" method="get">
        <div className="fld"><label>Search</label><input name="q" defaultValue={q} placeholder="Name, handle, bio, tag…" /></div>
        <div className="fld"><label>Talent</label><select name="skill" defaultValue={fSkill}><option value="">Any</option>{SKILLS.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="fld"><label>Niche</label><select name="niche" defaultValue={fNiche}><option value="">Any</option>{NICHES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="fld"><label>City</label><input name="city" list="cities" defaultValue={fCity} placeholder="Any" /></div>
        <div className="fld"><label>Language</label><select name="lang" defaultValue={fLang}><option value="">Any</option>{LANGUAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="fld"><label>Followers</label><div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><input name="fmin" defaultValue={u.fmin ?? ""} placeholder="Min" /><input name="fmax" defaultValue={u.fmax ?? ""} placeholder="Max" /></div></div>
        <button className="btn plum" type="submit">Search</button>
        <div className="fld"><label>Gender</label><select name="gender" defaultValue={fGender}><option value="">Any</option>{["Female", "Male", "Other"].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="fld"><label>Min engagement %</label><input name="er" defaultValue={u.er ?? ""} placeholder="e.g. 2" /></div>
        <div className="fld"><label>Status</label><select name="status" defaultValue={fStatus}><option value="">Any</option>{CREATOR_STATUSES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></div>
        <div className="fld"><label>Sort</label><select name="sort" defaultValue={sort}>{[["followers", "Biggest first"], ["er", "Best engagement"], ["quality", "Best quality score"], ["new", "Newest"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {filtered && <a className="btn ghost" href="/team/creators">Clear</a>}
      </form>
      <datalist id="cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="sec">
        <div className="spread" style={{ marginBottom: 12 }}><div className="h2" style={{ margin: 0 }}>{filtered ? `${rows.length} matching creators` : `${total} creators in the database`}</div>{rows.length === 200 && <span className="hint">Showing the first 200. Narrow the filters.</span>}</div>
        {rows.length ? (
          <div className="panel scroll-x"><table className="tbl">
            <thead><tr><th>Creator</th><th>Talent · niche</th><th>City</th><th className="num">Followers</th><th className="num">Engagement</th><th className="num">Quality</th><th className="num">Reel rate</th><th>Status</th></tr></thead>
            <tbody>{rows.map((c) => { const b = erBand(c.engagement_rate, c.followers); return (
              <tr key={c.id}>
                <td><a className="who" href={`/team/creators/${c.id}`}><div className="ava">{c.profile_pic ? <img src={c.profile_pic} alt="" loading="lazy" /> : initials(c.name || c.handle)}</div><div><b>{c.name || c.handle}{c.verified ? " ✓" : ""}</b><span>@{c.handle}</span></div></a></td>
                <td>{(c.skills || "").split(",").filter(Boolean).slice(0, 2).map((s) => <span key={s} className="tag">{s.trim()}</span>)}{c.niche && <span className="tag">{c.niche.split(",")[0]}</span>}</td>
                <td>{c.city || <span className="muted">—</span>}</td>
                <td className="num">{compact(c.followers)}</td>
                <td className="num">{c.engagement_rate != null ? <span className={`pill ${b.tone}`}>{c.engagement_rate}%</span> : <span className="muted">—</span>}</td>
                <td className="num">{c.quality_score ?? <span className="muted">—</span>}</td>
                <td className="num">{c.rate_reel ? `₹${compact(c.rate_reel)}` : <span className="muted">—</span>}</td>
                <td><span className="pill">{STAGE_LABEL[c.status] || c.status}</span></td>
              </tr>); })}</tbody>
          </table></div>
        ) : (
          <div className="panel empty"><b>{filtered ? "No creator matches these filters." : "No creators yet."}</b>{filtered ? "Loosen a filter, or look the creator up on Instagram above." : "Import your existing sheet below, add creators by hand, or share the creator sign-up page so they join themselves."}</div>
        )}
      </div>

      <div className="sec grid2" id="add">
        <form className="panel pad" action={addCreator}>
          <h2>Add a creator</h2>
          <div className="form-grid">
            <div className="fld"><label>Instagram handle</label><input name="handle" required placeholder="@handle" /></div>
            <div className="fld"><label>Name</label><input name="name" /></div>
            <div className="fld full"><label>Talent</label><div className="chips">{SKILLS.slice(0, 16).map((s) => <label key={s} className="chip"><input type="checkbox" name="skills" value={s} /><span>{s}</span></label>)}</div></div>
            <div className="fld"><label>Niche</label><select name="niche"><option value="">—</option>{NICHES.map((n) => <option key={n}>{n}</option>)}</select></div>
            <div className="fld"><label>City</label><input name="city" list="cities" /></div>
            <div className="fld"><label>Languages</label><input name="language" placeholder="Hindi, English" /></div>
            <div className="fld"><label>Gender</label><select name="gender"><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select></div>
            <div className="fld"><label>Followers</label><input name="followers" placeholder="e.g. 85K or 1.2L" /></div>
            <div className="fld"><label>Reel rate (₹)</label><input name="rate_reel" placeholder="e.g. 25000" /></div>
            <div className="fld"><label>Phone / WhatsApp</label><input name="phone" /></div>
            <div className="fld"><label>Email</label><input name="email" type="email" /></div>
            <div className="fld full"><label>Notes</label><input name="notes" /></div>
          </div>
          <button className="btn plum" style={{ marginTop: 16 }}>Add creator</button>
        </form>
        <form className="panel pad" action={importSheet}>
          <h2>Import a sheet</h2>
          <p className="hint" style={{ marginTop: -6 }}>Paste from Excel or Google Sheets, or upload a CSV. The first row must be headers. We read: <b>handle</b> (or username / instagram link), name, niche, city, state, language, gender, followers, avg views, engagement rate, email, phone, reel rate, story rate, post rate, tags, notes. Existing handles are updated, never duplicated.</p>
          <div className="fld"><label>Upload CSV <span className="opt">— optional</span></label><input type="file" name="file" accept=".csv,.tsv,.txt" /></div>
          <div className="fld" style={{ marginTop: 12 }}><label>Or paste rows</label><textarea name="csv" rows={9} placeholder={"handle\tname\tniche\tcity\tfollowers\treel rate\n@priya.dances\tPriya\tDance\tDelhi\t82K\t25000"} /></div>
          <button className="btn plum" style={{ marginTop: 16 }}>Import</button>
        </form>
      </div>
    </TeamShell>
  );
}
