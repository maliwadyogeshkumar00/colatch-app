import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import { flashUrl } from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { lookupProfile, metaReady, cleanHandle } from "@/lib/net/meta";
import { upsertFromInstagram, compact, erBand, tierFor, int, str, parseCsv, mapCsvRows, NICHES, CREATOR_STATUSES, STAGE_LABEL, PLATFORMS, PLATFORM_IDS, PLATFORM_LABEL, platformsFor } from "@/lib/net/creators";
import { AGE_BANDS, audienceSummary } from "@/lib/net/audience";
import { findSimilar } from "@/lib/net/lookalike";
import { SKILLS, LANGUAGES, CITIES } from "@/lib/net/match";
import { creatorStatusLabel, nicheLabel, inrFull } from "@/components/team/labels";
import { weekSeries } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, FilterBar, FilterChips, DataTable, Grid, Section, Card, AsideCard, InlineState, Pill, Split, Cell, Avatar, Pager, paginate, pageHref } from "@/components/ui";

export const metadata = { title: "Influencer finder", robots: { index: false, follow: false } };

async function saveLookup(fd) {
  "use server";
  await requireTeam("shortlist");
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
  await requireTeam("shortlist");
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
  await requireTeam("shortlist");
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
  // Audience filters read the creator's self-reported split (creators.audience, see lib/net/audience.ts).
  const fAud = ["women", "men"].includes(u.aud) ? u.aud : "";
  const fACity = String(u.acity ?? "").trim().slice(0, 40);
  const fAge = AGE_BANDS.includes(u.aage) ? u.aage : "";
  const fPf = [].concat(u.pf ?? []).map(String).filter((x) => PLATFORM_IDS.includes(x));
  const fLike = cleanHandle(String(u.like ?? ""));
  if (fAud) where.push(`COALESCE((audience->'gender'->>'${fAud}')::numeric, 0) >= 60`);
  if (fACity) { where.push("EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(audience->'cities') = 'array' THEN audience->'cities' ELSE '[]'::jsonb END) e WHERE e->>'name' LIKE ?)"); args.push(`%${fACity}%`); }
  if (fAge) { where.push("audience->>'core_age' = ?"); args.push(fAge); }
  // Every ticked platform must be on the creator's profile.
  for (const plat of fPf) { where.push("EXISTS (SELECT 1 FROM creator_platforms p WHERE p.creator_id = creators.id AND p.platform = ?)"); args.push(plat); }
  const order = sort === "er" ? "engagement_rate DESC NULLS LAST" : sort === "quality" ? "quality_score DESC NULLS LAST" : sort === "new" ? "created_at DESC" : "followers DESC NULLS LAST";
  let rows = [];
  let total = 0;
  let dbErr = "";
  let extraStatuses = [];
  let seed = null;
  let pf = {};
  try {
    if (fLike) {
      // Lookalike mode: rank creators like @handle (lib/net/lookalike.ts); the other filters still apply.
      seed = await env.DB.prepare("SELECT * FROM creators WHERE handle = ?").bind(fLike).first();
      if (seed) rows = (await findSimilar(env, seed, { limit: 200, where: where.slice(1), args })).map((r) => ({ ...r.creator, _score: r.score, _why: r.why }));
    } else rows = (await env.DB.prepare(`SELECT * FROM creators WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 200`).bind(...args).all()).results ?? [];
    pf = await platformsFor(env, rows.map((r) => r.id));
    total = (await env.DB.prepare("SELECT COUNT(*) n FROM creators").first())?.n ?? 0;
    // Stored statuses outside the standard list (e.g. "active") still get a filter option.
    extraStatuses = ((await env.DB.prepare("SELECT DISTINCT status FROM creators WHERE status IS NOT NULL").all().catch(() => ({ results: [] }))).results ?? []).map((r) => r.status).filter((x) => x && !CREATOR_STATUSES.includes(x));
  } catch (e) { dbErr = e instanceof Error ? e.message : String(e); }
  const filtered = Boolean(q || fSkill || fNiche || fCity || fLang || fGender || fMin != null || fMax != null || fEr != null || fStatus || fAud || fACity || fAge || fPf.length || fLike);
  const initials = (s) => String(s).replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const flash = u.err || u.ok;
  const lb = lookup ? erBand(lookup.engagement_rate, lookup.followers) : null;

  // Read-only roll-up of the whole database for the KPI strip. A failure only blanks the tiles.
  const kpi = await env.DB.prepare(
    `SELECT COUNT(*) n, SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) v, AVG(engagement_rate) er,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM creator_accounts a WHERE a.creator_id = creators.id) THEN 1 ELSE 0 END) logins
     FROM creators WHERE COALESCE(status, '') <> 'blacklisted'`
  ).first().catch(() => null);
  const kn = (v) => (kpi ? Number(v || 0) : "—");
  // Sign-ups per week for the Creators tile (read-only; created_at is stored as UTC text).
  const joinedAt = await env.DB.prepare("SELECT created_at FROM creators WHERE created_at >= ? AND COALESCE(status, '') <> 'blacklisted'")
    .bind(new Date(Date.now() - 84 * 864e5).toISOString().replace("T", " ").slice(0, 19)).all().then((r) => (r.results ?? []).map((x) => x.created_at)).catch(() => []);
  const joined = weekSeries(joinedAt, Date.now(), 12);
  const joinedN = joined.reduce((a, b) => a + b, 0);
  // Review queue: newest creators with no quality score yet (read-only).
  const toReview = await env.DB.prepare("SELECT id, name, handle, followers, city, created_at, COUNT(*) OVER () total FROM creators WHERE quality_score IS NULL AND COALESCE(status, '') <> 'blacklisted' ORDER BY created_at DESC LIMIT 5")
    .all().then((r) => r.results ?? []).catch(() => []);
  const toReviewN = Number(toReview[0]?.total || 0);
  const avgEr = kpi?.er != null ? `${Number(kpi.er).toFixed(1)}%` : "—";
  // Sort chips keep every other filter in the link.
  const sortHref = (v) => {
    const sp = new URLSearchParams();
    for (const [key, val] of Object.entries(u)) if (!["sort", "ok", "err", "lerr"].includes(key)) [].concat(val).forEach((x) => x !== "" && x != null && sp.append(key, String(x)));
    if (v !== "followers") sp.set("sort", v);
    const qs = sp.toString();
    return `/team/creators${qs ? `?${qs}` : ""}`;
  };
  const SORTS = [["followers", "Biggest first"], ["er", "Best engagement"], ["quality", "Best quality score"], ["new", "Newest"]];
  const TIERS = ["Nano", "Micro", "Mid", "Macro", "Mega"];
  // The size bar covers every creator it describes: the whole database (read-only roll-up) when nothing is
  // filtered, otherwise every row in this list. Creators without a follower count get their own "Size not known" part.
  const tierOf = (r) => { const t = r.tier || tierFor(r.followers); return TIERS.includes(t) ? t : "Size not known"; };
  const dbTiers = filtered ? null : await env.DB.prepare(
    `SELECT COALESCE(NULLIF(tier, ''), CASE WHEN followers IS NULL THEN NULL WHEN followers < 10000 THEN 'Nano' WHEN followers < 100000 THEN 'Micro'
       WHEN followers < 500000 THEN 'Mid' WHEN followers < 1000000 THEN 'Macro' ELSE 'Mega' END) t, COUNT(*) n
     FROM creators WHERE COALESCE(status, '') <> 'blacklisted' GROUP BY 1`
  ).all().then((r) => r.results ?? []).catch(() => null);
  const tierCount = {};
  if (dbTiers) for (const r of dbTiers) { const t = TIERS.includes(r.t) ? r.t : "Size not known"; tierCount[t] = (tierCount[t] || 0) + Number(r.n || 0); }
  else for (const r of rows) tierCount[tierOf(r)] = (tierCount[tierOf(r)] || 0) + 1;
  const tierParts = [...TIERS, "Size not known"].map((t) => ({ label: t, n: tierCount[t] || 0 })).filter((x) => x.n > 0);
  const tierTotal = tierParts.reduce((a, x) => a + x.n, 0);
  const pg = paginate(rows, u.page, 25);
  const columns = [
    { key: "creator", label: "Creator", render: (c) => (
      <span className="tr-person"><Avatar name={c.name || c.handle} src={c.profile_pic || undefined} size={40} />
        <Cell title={<>{c.name || c.handle}{c.verified ? " ✓" : ""}</>} sub={<span>@{c.handle}</span>} /></span>
    ) },
    ...(seed ? [{ key: "why", label: "Why similar", render: (c) => <span className="tr-simwhy"><span className="sim-score sm">{c._score}<small>/100</small></span> <span className="small">{c._why}</span></span> }] : []),
    { key: "talent", label: "Talent · niche", render: (c) => (<>
      <span className="tr-why">{(c.skills || "").split(",").filter(Boolean).slice(0, 2).map((s) => <span key={s} className="tag">{s.trim()}</span>)}{c.niche && <span className="tag">{nicheLabel(c.niche.split(",")[0])}</span>}</span>
      {(pf[c.id]?.length > 0 || audienceSummary(c)) && <div className="finder-meta">{(pf[c.id] ?? []).map((p) => <span key={p.platform} className="pf-chip" title={PLATFORM_LABEL[p.platform]}>{PLATFORM_LABEL[p.platform]}{p.followers != null ? ` ${compact(p.followers)}` : ""}</span>)}{audienceSummary(c) && <span className="aud-line">Audience: {audienceSummary(c)}</span>}</div>}
    </>) },
    { key: "city", label: "City", render: (c) => c.city || <span className="muted">—</span> },
    { key: "followers", label: "Followers", num: true, primary: true, render: (c) => compact(c.followers) },
    { key: "er", label: "Engagement", num: true, render: (c) => { const b = erBand(c.engagement_rate, c.followers); return c.engagement_rate != null ? <span className={`pill ${b.tone}`}>{c.engagement_rate}%</span> : <span className="muted">—</span>; } },
    { key: "quality", label: "Quality", num: true, render: (c) => c.quality_score ?? <span className="muted" title="Not reviewed yet">—</span> },
    { key: "rate", label: "Reel rate", num: true, render: (c) => (c.rate_reel ? inrFull(c.rate_reel) : <span className="muted">—</span>) },
    { key: "status", label: "Status", render: (c) => <Pill>{creatorStatusLabel(c.status)}</Pill> },
  ];

  return (
    <TeamShell active="finder" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator tools" }, { label: "Influencer finder" }]}
        actions={<a className="btn-foil" href="#add">+ Add creators</a>}
        eyebrow="Creator tools · Finder"
        title="Find the <b>right creator</b>."
        sub="Search Colatch's own creator database by talent, niche, city, language and size. Look up any public Instagram creator or business account by handle and save it here with live numbers."
      />

      {dbErr && <div style={{ marginBottom: 16 }}><InlineState kind="error" label="Database not reachable.">{dbErr}</InlineState></div>}
      {flash && <div className={`note ${u.err ? "bad" : "good"}`} style={{ marginBottom: 16 }}>{flash}</div>}

      <KpiStrip label="Creator database at a glance" items={[
        { label: "Creators", value: kn(kpi?.n), spark: joined, sparkLabel: "Creators added per week, last 12 weeks", foot: `+${joinedN} in 12 weeks · blacklist excluded` },
        { label: "Verified", value: kn(kpi?.v), foot: "numbers checked on Instagram" },
        { label: "With a portal login", value: kn(kpi?.logins), foot: "can apply and accept deals" },
        { featured: true, label: "Average engagement", value: avgEr, foot: "across creators with an engagement figure" },
      ]} />

      <Grid aside={
        <AsideCard eyebrow="Insight" title={seed ? `Creators like <b>@${seed.handle}</b>` : filtered ? "This search by size" : "The database by size"}
          foot={filtered ? <a href="/team/creators">Clear the search</a> : <a href="#add">Import a sheet</a>}>
          {tierParts.length ? <Split label={dbTiers ? "Every creator in the database by tier" : "Creators in this list by tier"} parts={tierParts} /> : <p className="small">No creators in this list yet.</p>}
          <p className="small">{dbTiers ? `All ${tierTotal.toLocaleString("en-IN")} creators in the database.` : rows.length === 200 ? "The first 200 by the current sort." : `All ${rows.length.toLocaleString("en-IN")} in this list.`} Tiers follow followers: Nano under 10K, Micro to 1L, Mid to 5L, Macro to 10L, Mega above.</p>
        </AsideCard>
      }>
        <Section id="lookup" title="Look up on Instagram" actions={ig ? <Pill tone="done">Instagram connected</Pill> : <Pill tone="wait">Instagram not connected</Pill>}>
          <Card>
            <form method="get" className="row tr-fields">
              <input className="in tr-grow" name="lookup" aria-label="Instagram handle or link" placeholder="@handle or instagram.com/handle" required defaultValue={lookup?.handle ?? u.lookup ?? ""} />
              <button className="btn plum" type="submit" disabled={!ig}>Look up</button>
            </form>
            {!ig && <p className="hint" style={{ margin: "10px 0 0" }}>Connect Colatch's Instagram business account (META_ACCESS_TOKEN and META_IG_USER_ID in Vercel) to pull live followers and engagement. Until then, add creators by hand or import a sheet below.</p>}
            {lookupErr && <div className="note bad" style={{ marginTop: 14 }}>{lookupErr}</div>}
            {lookup && (
              <div className="tr-lookup">
                <div className="spread">
                  <div className="who"><div className="ava" style={{ width: 56, height: 56 }}>{lookup.profile_pic ? <img src={lookup.profile_pic} alt="" /> : initials(lookup.handle)}</div>
                    <div><b style={{ fontSize: 17 }}>{lookup.name || lookup.handle}</b><span>@{lookup.handle} · {tierFor(lookup.followers)}</span></div></div>
                  <form action={saveLookup} className="row"><input type="hidden" name="handle" value={lookup.handle} /><button className="btn plum">Save to database</button></form>
                </div>
                <dl className="tr-stats">
                  <div><dt>Followers</dt><dd>{compact(lookup.followers)}</dd></div>
                  <div><dt>Engagement</dt><dd>{lookup.engagement_rate}% <span className={`pill ${lb.tone}`}>{lb.label}</span></dd></div>
                  <div><dt>Avg likes · comments</dt><dd>{compact(lookup.avg_likes)} · {compact(lookup.avg_comments)}</dd></div>
                  <div><dt>Posts / week · Reels</dt><dd>{lookup.posts_per_week} · {Math.round(lookup.reel_share * 100)}%</dd></div>
                </dl>
                {lookup.bio && <p className="muted small" style={{ margin: "14px 0 0", whiteSpace: "pre-line" }}>{lookup.bio}</p>}
              </div>
            )}
          </Card>
        </Section>
        <Section id="review" title={toReviewN ? `To review <b>${toReviewN.toLocaleString("en-IN")}</b>` : "To review"} sub={toReviewN ? "Newest creators without a quality score. Open one to check the profile and score it." : null}>
          {toReview.length ? <Card><ol className="tr-queue">{toReview.map((c) => (
            <li key={c.id}><a href={`/team/creators/${c.id}`}>
              <span className="tr-person"><Avatar name={c.name || c.handle} size={32} /><span className="tr-queue__t"><b>{c.name || c.handle}</b><span className="hint">@{c.handle}{c.city ? ` · ${c.city}` : ""}{c.followers != null ? ` · ${compact(c.followers)} followers` : " · followers not known"}</span></span></span>
              <span className="tr-queue__age">Review →</span>
            </a></li>))}</ol></Card>
            : <Card><p className="small" style={{ margin: 0 }}><b>Every creator has a quality score.</b> New sign-ups and imports land here.</p></Card>}
        </Section>
      </Grid>

      <Section id="finder" title={seed ? `${rows.length} creators like @${seed.handle}` : filtered ? `${rows.length} matching creators` : `${total} creators in the database`}
        sub={seed ? <>Ranked by shared talent and niche, size, city, languages, engagement, audience and platforms. <a className="link" href={`/team/creators/${seed.id}`}>Open @{seed.handle}</a></> : rows.length === 200 ? "Showing the first 200. Narrow the filters." : "Filter by talent, niche, city, language, size, audience and platforms."}>
        <form className="panel filters" method="get">
          <div className="fld"><label htmlFor="f-team-creators-q-1">Search</label><input id="f-team-creators-q-1" name="q" defaultValue={q} placeholder="Name, handle, bio, tag…" /></div>
          <div className="fld"><label htmlFor="f-team-creators-skill-2">Talent</label><select id="f-team-creators-skill-2" name="skill" defaultValue={fSkill}><option value="">Any</option>{SKILLS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="fld"><label htmlFor="f-team-creators-niche-3">Niche</label><select id="f-team-creators-niche-3" name="niche" defaultValue={fNiche}><option value="">Any</option>{NICHES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="fld"><label htmlFor="f-team-creators-city-4">City</label><input id="f-team-creators-city-4" name="city" list="cities" defaultValue={fCity} placeholder="Any" /></div>
          <div className="fld"><label htmlFor="f-team-creators-lang-5">Language</label><select id="f-team-creators-lang-5" name="lang" defaultValue={fLang}><option value="">Any</option>{LANGUAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="fld"><label htmlFor="f-team-creators-fmin">Followers</label><div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><input id="f-team-creators-fmin" name="fmin" aria-label="Minimum followers" defaultValue={u.fmin ?? ""} placeholder="Min" /><input name="fmax" aria-label="Maximum followers" defaultValue={u.fmax ?? ""} placeholder="Max" /></div></div>
          <button className="btn plum" type="submit">Search</button>
          <div className="fld"><label htmlFor="f-team-creators-gender-6">Gender</label><select id="f-team-creators-gender-6" name="gender" defaultValue={fGender}><option value="">Any</option>{["Female", "Male", "Other"].map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="fld"><label htmlFor="f-team-creators-er-7">Min engagement %</label><input id="f-team-creators-er-7" name="er" defaultValue={u.er ?? ""} placeholder="e.g. 2" /></div>
          <div className="fld"><label htmlFor="f-team-creators-status-8">Status</label><select id="f-team-creators-status-8" name="status" defaultValue={fStatus}><option value="">Any</option>{[...CREATOR_STATUSES, ...extraStatuses].map((s) => <option key={s} value={s}>{creatorStatusLabel(s)}</option>)}</select></div>
          <div className="fld"><label htmlFor="f-team-creators-sort-9">Sort</label><select id="f-team-creators-sort-9" name="sort" defaultValue={sort}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          {filtered && <a className="btn ghost" href="/team/creators">Clear</a>}
          <div className="finder-more">
            <div className="fld"><label htmlFor="f-team-creators-like">Find creators like</label><input id="f-team-creators-like" name="like" defaultValue={u.like ?? ""} placeholder="@handle" autoCapitalize="none" spellCheck={false} /></div>
            <div className="fld"><label htmlFor="f-team-creators-aud">Audience mostly</label><select id="f-team-creators-aud" name="aud" defaultValue={fAud}><option value="">Any</option><option value="women">Women (60%+)</option><option value="men">Men (60%+)</option></select></div>
            <div className="fld"><label htmlFor="f-team-creators-acity">Audience city</label><input id="f-team-creators-acity" name="acity" list="cities" defaultValue={fACity} placeholder="In their top cities" /></div>
            <div className="fld"><label htmlFor="f-team-creators-aage">Core audience age</label><select id="f-team-creators-aage" name="aage" defaultValue={fAge}><option value="">Any</option>{AGE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
            <fieldset className="fld pf-filter">
              <legend>Also on <span className="opt">— all ticked</span></legend>
              <div className="chips">{PLATFORMS.map((p) => <label key={p.id} className="chip"><input type="checkbox" name="pf" value={p.id} defaultChecked={fPf.includes(p.id)} /><span>{p.label}</span></label>)}</div>
            </fieldset>
          </div>
        </form>
        <datalist id="cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>

        {fLike && !seed && !dbErr && <div className="note bad tr-gap">No creator @{fLike} in the database yet. Look them up on Instagram above, then search again.</div>}
        {!seed && <div className="tr-gap"><FilterBar label="Sort creators">
          <FilterChips name="sort" label="Sort by" current={sort} hrefFor={sortHref} options={SORTS.map(([value, label]) => ({ value, label }))} />
        </FilterBar></div>}
        <DataTable caption="Creators" columns={columns} rows={pg.rows} rowHref={(c) => `/team/creators/${c.id}`} scroll
          empty={{ title: filtered ? "No creator matches these filters." : "No creators yet.", body: filtered ? "Loosen a filter, or look the creator up on Instagram above." : "Import your existing sheet below, add creators by hand, or share the creator sign-up page so they join themselves.", action: filtered ? <a className="btn sm" href="/team/creators">Clear the filters</a> : <a className="btn sm" href="#add">Add creators</a> }} />
        <Pager p={pg} noun={["creator", "creators"]} label="Creator pages" hrefFor={(n) => pageHref(u, n, { path: "/team/creators", hash: "#finder", drop: ["ok", "err", "lerr", "lookup"] })} />
      </Section>

      <Section id="add" title="Add creators" sub="One by hand, or a whole sheet at once. Existing handles are updated, never duplicated.">
        <Grid cols={2}>
          <Card><form action={addCreator}>
            <h3 className="tr-cardh">Add a creator</h3>
            <div className="form-grid">
              <div className="fld"><label htmlFor="f-team-creators-handle-10">Instagram handle</label><input id="f-team-creators-handle-10" name="handle" required placeholder="@handle" /></div>
              <div className="fld"><label htmlFor="f-team-creators-name-11">Name</label><input id="f-team-creators-name-11" name="name" /></div>
              <div className="fld full"><label>Talent</label><div className="chips">{SKILLS.slice(0, 16).map((s) => <label key={s} className="chip"><input type="checkbox" name="skills" value={s} /><span>{s}</span></label>)}</div></div>
              <div className="fld"><label htmlFor="f-team-creators-niche-12">Niche</label><select id="f-team-creators-niche-12" name="niche"><option value="">—</option>{NICHES.map((n) => <option key={n}>{n}</option>)}</select></div>
              <div className="fld"><label htmlFor="f-team-creators-city-13">City</label><input id="f-team-creators-city-13" name="city" list="cities" /></div>
              <div className="fld"><label htmlFor="f-team-creators-language-14">Languages</label><input id="f-team-creators-language-14" name="language" placeholder="Hindi, English" /></div>
              <div className="fld"><label htmlFor="f-team-creators-gender-15">Gender</label><select id="f-team-creators-gender-15" name="gender"><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select></div>
              <div className="fld"><label htmlFor="f-team-creators-followers-16">Followers</label><input id="f-team-creators-followers-16" name="followers" placeholder="e.g. 85K or 1.2L" /></div>
              <div className="fld"><label htmlFor="f-team-creators-rate-reel-17">Reel rate (₹)</label><input id="f-team-creators-rate-reel-17" name="rate_reel" placeholder="e.g. 25000" /></div>
              <div className="fld"><label htmlFor="f-team-creators-phone-18">Phone / WhatsApp</label><input id="f-team-creators-phone-18" name="phone" /></div>
              <div className="fld"><label htmlFor="f-team-creators-email-19">Email</label><input id="f-team-creators-email-19" name="email" type="email" /></div>
              <div className="fld full"><label htmlFor="f-team-creators-notes-20">Notes</label><input id="f-team-creators-notes-20" name="notes" /></div>
            </div>
            <button className="btn plum" style={{ marginTop: 16 }}>Add creator</button>
          </form></Card>
          <Card><form action={importSheet}>
            <h3 className="tr-cardh">Import a sheet</h3>
            <p className="hint" style={{ marginTop: 0 }}>Paste from Excel or Google Sheets, or upload a CSV. The first row must be headers. We read: <b>handle</b> (or username / instagram link), name, niche, city, state, language, gender, followers, avg views, engagement rate, email, phone, reel rate, story rate, post rate, tags, notes. Existing handles are updated, never duplicated.</p>
            <div className="fld"><label htmlFor="f-team-creators-file-21">Upload CSV <span className="opt">— optional</span></label><input id="f-team-creators-file-21" type="file" name="file" accept=".csv,.tsv,.txt" /></div>
            <div className="fld" style={{ marginTop: 12 }}><label htmlFor="f-team-creators-csv-22">Or paste rows</label><textarea id="f-team-creators-csv-22" name="csv" rows={9} placeholder={"handle\tname\tniche\tcity\tfollowers\treel rate\n@priya.dances\tPriya\tDance\tDelhi\t82K\t25000"} /></div>
            <button className="btn plum" style={{ marginTop: 16 }}>Import</button>
          </form></Card>
        </Grid>
      </Section>
    </TeamShell>
  );
}
