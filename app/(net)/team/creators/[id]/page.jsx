import { redirect } from "next/navigation";
import TeamShell from "../../../_ui/TeamShell";
import { flashUrl } from "../../../_ui/flash";
import { requireTeam } from "../../_guard";
import { env } from "@/lib/net/env";
import { lookupProfile, metaReady } from "@/lib/net/meta";
import { upsertFromInstagram, aiReview, compact, inr, erBand, tierFor, int, str, NICHES, CREATOR_STATUSES, DEAL_STAGES, STAGE_LABEL } from "@/lib/net/creators";
import { SKILLS, list } from "@/lib/net/match";

export const metadata = { title: "Creator · Colatch Connect", robots: { index: false, follow: false } };

async function act(fd) {
  "use server";
  await requireTeam();
  const id = String(fd.get("id") ?? "");
  const action = String(fd.get("action") ?? "");
  let msg = "", bad = false;
  try {
    if (action === "save") {
      const followers = int(fd.get("followers"));
      await env.DB.prepare(
        `UPDATE creators SET name=?, skills=?, niche=?, city=?, state=?, language=?, gender=?, followers=?, avg_views=?, engagement_rate=?,
         email=?, phone=?, rate_reel=?, rate_story=?, rate_post=?, status=?, tags=?, notes=?, portfolio_links=?, tier=?, updated_at=datetime('now') WHERE id=?`
      ).bind(str(fd.get("name")), fd.getAll("skills").map(String).join(", ") || null, fd.getAll("niche").map(String).join(", ") || null,
        str(fd.get("city")), str(fd.get("state")), str(fd.get("language")), str(fd.get("gender")), followers, int(fd.get("avg_views")),
        fd.get("engagement_rate") ? parseFloat(String(fd.get("engagement_rate"))) || null : null, str(fd.get("email")), str(fd.get("phone")),
        int(fd.get("rate_reel")), int(fd.get("rate_story")), int(fd.get("rate_post")), String(fd.get("status") || "new"), str(fd.get("tags")),
        str(fd.get("notes")), str(fd.get("portfolio_links")), tierFor(followers), id).run();
      msg = "Profile saved.";
    } else if (action === "refresh") {
      const row = await env.DB.prepare("SELECT handle FROM creators WHERE id=?").bind(id).first();
      if (row) { await upsertFromInstagram(env, await lookupProfile(env, row.handle)); await env.DB.prepare("UPDATE creators SET verified=1 WHERE id=?").bind(id).run(); }
      msg = "Refreshed from Instagram.";
    } else if (action === "review") {
      // The standalone AI reviewer page is not ported; the same review runs from here when Instagram is connected.
      const row = await env.DB.prepare("SELECT handle FROM creators WHERE id=?").bind(id).first();
      if (row) {
        const p = await lookupProfile(env, row.handle);
        const { review, engine } = await aiReview(env, p);
        await env.DB.prepare("UPDATE creators SET quality_score=?, verified=1 WHERE id=?").bind(review.score, id).run();
        await env.DB.prepare("INSERT INTO profile_reviews (id, creator_id, handle, score, summary, report_json, engine) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), id, p.handle, review.score, review.summary, JSON.stringify(review), engine).run();
        msg = `Reviewed: ${review.score}/100. ${review.verdict}`;
      }
    } else if (action === "owner") {
      await env.DB.prepare("UPDATE creators SET owner_verified=1 WHERE id=?").bind(id).run();
      msg = "Ownership marked verified.";
    } else if (action === "deal") {
      await env.DB.prepare("INSERT INTO creator_deals (id, creator_id, brand, deliverable, stage, fee, expected_views, go_live_date, notes) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), id, str(fd.get("brand")), str(fd.get("deliverable")), String(fd.get("stage") || "shortlisted"), int(fd.get("fee")),
          int(fd.get("expected_views")), str(fd.get("go_live_date")), str(fd.get("notes"))).run();
      msg = "Added to the CRM.";
    }
  } catch (e) { msg = e instanceof Error ? e.message : "Something went wrong."; bad = true; }
  redirect(msg ? flashUrl(`/team/creators/${id}`, bad ? "err" : "ok", msg) : `/team/creators/${id}`);
}

export default async function Page({ params, searchParams }) {
  const me = await requireTeam();
  const id = params.id;
  const flash = searchParams?.err || searchParams?.ok || (searchParams?.saved ? "Saved." : "");
  const tone = searchParams?.err ? "bad" : "good";

  const c = await env.DB.prepare("SELECT * FROM creators WHERE id = ?").bind(id).first();
  if (!c) redirect("/team/creators");
  const deals = (await env.DB.prepare("SELECT * FROM creator_deals WHERE creator_id=? ORDER BY created_at DESC").bind(id).all()).results ?? [];
  const apps = (await env.DB.prepare("SELECT a.*, k.title, k.slug, k.id AS cid FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id WHERE a.creator_id=? OR a.handle=? ORDER BY a.created_at DESC").bind(id, c.handle).all()).results ?? [];
  const review = await env.DB.prepare("SELECT score, summary, engine, created_at FROM profile_reviews WHERE handle=? ORDER BY created_at DESC LIMIT 1").bind(c.handle).first();
  const hasAccount = await env.DB.prepare("SELECT email FROM creator_accounts WHERE creator_id=?").bind(id).first();
  const b = erBand(c.engagement_rate, c.followers);
  const ownerOk = Boolean(c.owner_verified);
  const vcode = c.verify_code;
  const skills = list(c.skills);
  const niches = list(c.niche);
  const wa = c.phone ? `https://wa.me/${String(c.phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}` : "";
  const ig = metaReady(env);
  const esc = (s) => String(s).replace(/</g, "&lt;");
  const hidden = (a) => <><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value={a} /></>;

  return (
    <TeamShell active="finder" eyebrow="Creator profile" title={`${esc(c.name || "@" + c.handle)}${c.verified ? " <b>✓</b>" : ""}`} email={me.email}
      actions={<>
        <a className="btn" href={`https://instagram.com/${c.handle}`} target="_blank" rel="noopener">Instagram ↗</a>
        {wa && <a className="btn" href={wa} target="_blank" rel="noopener">WhatsApp ↗</a>}
        {ig && <form action={act}>{hidden("review")}<button className="btn-foil">AI review</button></form>}
      </>}>

      {flash && <div className={`note ${tone}`} style={{ marginBottom: 18 }}>{flash}</div>}

      <div className="grid4">
        <div className="panel kpi"><div className="k">Followers</div><div className="v">{compact(c.followers)}</div><div className="s">{c.tier || "—"} · @{c.handle}</div></div>
        <div className="panel kpi"><div className="k">Engagement</div><div className="v">{c.engagement_rate != null ? `${c.engagement_rate}%` : "—"}</div><div className="s"><span className={`pill ${b.tone}`}>{b.label}</span></div></div>
        <div className="panel kpi"><div className="k">Quality score</div><div className="v">{c.quality_score ?? "—"}</div><div className="s">{review ? `${review.engine === "ai" ? "AI" : "Rules"} review · ${String(review.created_at).slice(0, 10)}` : "Not reviewed yet"}</div></div>
        <div className="panel kpi"><div className="k">Reel rate</div><div className="v">{c.rate_reel ? inr(c.rate_reel) : "—"}</div><div className="s">{c.avg_views && c.rate_reel ? `CPV ₹${(c.rate_reel / c.avg_views).toFixed(2)} per view` : "Add rate + avg views for CPV"}</div></div>
      </div>

      <div className="note info" style={{ marginTop: 16 }}>
        {ownerOk ? <b style={{ color: "var(--good)" }}>Owner verified ✓ · </b> : vcode ? <span>Bio code <code className="k">{vcode}</code> <form action={act} style={{ display: "inline" }}>{hidden("owner")}<button className="btn sm">Mark verified</button></form> · </span> : null}
        Source: <b>{c.source}</b>{c.last_synced_at ? ` · Instagram numbers from ${String(c.last_synced_at).slice(0, 10)}` : ""} · {hasAccount ? `Creator has a portal login (${hasAccount.email})` : "No portal login yet"}
        {ig && <form action={act} style={{ display: "inline", marginLeft: 10 }}>{hidden("refresh")}<button className="btn sm">Refresh from Instagram</button></form>}
      </div>
      {review?.summary && <p className="small" style={{ margin: "12px 0 0" }}><b>Latest review:</b> {review.summary}</p>}
      {c.bio && <p className="muted" style={{ whiteSpace: "pre-line", margin: "16px 0 0" }}>{c.bio}</p>}

      <div className="sec grid2" style={{ alignItems: "start" }}>
        <form className="panel pad" action={act}>
          {hidden("save")}
          <h2>Profile</h2>
          <div className="form-grid">
            <div className="fld"><label>Name</label><input name="name" defaultValue={c.name ?? ""} /></div>
            <div className="fld"><label>Status</label><select name="status" defaultValue={c.status}>{CREATOR_STATUSES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></div>
            <div className="fld full"><label>Talent</label><div className="chips">{SKILLS.map((s) => <label key={s} className="chip"><input type="checkbox" name="skills" value={s} defaultChecked={skills.includes(s)} /><span>{s}</span></label>)}</div></div>
            <div className="fld full"><label>Niche</label><div className="chips">{NICHES.map((s) => <label key={s} className="chip"><input type="checkbox" name="niche" value={s} defaultChecked={niches.includes(s)} /><span>{s}</span></label>)}</div></div>
            <div className="fld"><label>City</label><input name="city" defaultValue={c.city ?? ""} /></div>
            <div className="fld"><label>State</label><input name="state" defaultValue={c.state ?? ""} /></div>
            <div className="fld"><label>Languages</label><input name="language" defaultValue={c.language ?? ""} placeholder="Hindi, English" /></div>
            <div className="fld"><label>Gender</label><select name="gender" defaultValue={c.gender ?? ""}>{["", "Female", "Male", "Other"].map((g) => <option key={g} value={g}>{g || "—"}</option>)}</select></div>
            <div className="fld"><label>Followers</label><input name="followers" defaultValue={c.followers ?? ""} /></div>
            <div className="fld"><label>Avg reel views</label><input name="avg_views" defaultValue={c.avg_views ?? ""} /></div>
            <div className="fld"><label>Engagement %</label><input name="engagement_rate" defaultValue={c.engagement_rate ?? ""} /></div>
            <div className="fld"><label>Reel rate ₹</label><input name="rate_reel" defaultValue={c.rate_reel ?? ""} /></div>
            <div className="fld"><label>Story rate ₹</label><input name="rate_story" defaultValue={c.rate_story ?? ""} /></div>
            <div className="fld"><label>Post rate ₹</label><input name="rate_post" defaultValue={c.rate_post ?? ""} /></div>
            <div className="fld"><label>Phone / WhatsApp</label><input name="phone" defaultValue={c.phone ?? ""} /></div>
            <div className="fld"><label>Email</label><input name="email" defaultValue={c.email ?? ""} /></div>
            <div className="fld full"><label>Best work links <span className="opt">— one per line</span></label><textarea name="portfolio_links" rows={3} defaultValue={c.portfolio_links ?? ""} /></div>
            <div className="fld full"><label>Tags</label><input name="tags" defaultValue={c.tags ?? ""} placeholder="festive, premium, punjabi wedding…" /></div>
            <div className="fld full"><label>Team notes</label><textarea name="notes" rows={3} defaultValue={c.notes ?? ""} /></div>
          </div>
          <button className="btn plum" style={{ marginTop: 16 }}>Save profile</button>
        </form>

        <div className="stack">
          <form className="panel pad" action={act}>
            {hidden("deal")}
            <h2>Add to CRM</h2>
            <div className="form-grid">
              <div className="fld"><label>Brand</label><input name="brand" required /></div>
              <div className="fld"><label>Deliverable</label><input name="deliverable" placeholder="1 Reel + 2 Stories" /></div>
              <div className="fld"><label>Stage</label><select name="stage">{DEAL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></div>
              <div className="fld"><label>Fee ₹</label><input name="fee" defaultValue={c.rate_reel ?? ""} /></div>
              <div className="fld"><label>Expected views</label><input name="expected_views" defaultValue={c.avg_views ?? ""} /></div>
              <div className="fld"><label>Go-live date</label><input name="go_live_date" type="date" /></div>
              <div className="fld full"><label>Notes</label><input name="notes" /></div>
            </div>
            <button className="btn plum" style={{ marginTop: 14 }}>Add deal</button>
          </form>

          <div className="panel">
            <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Deals</h2></div>
            {deals.length ? <table className="tbl"><thead><tr><th>Brand</th><th>Stage</th><th className="num">Fee</th><th className="num">CPV</th></tr></thead><tbody>
              {deals.map((d) => { const v = d.actual_views || d.expected_views; return <tr key={d.id}><td><a className="link" href={`/team/deals/${d.id}`}>{d.brand}</a><div className="hint">{d.deliverable}</div></td><td><span className="pill">{STAGE_LABEL[d.stage]}</span></td><td className="num">{inr(d.fee)}</td><td className="num">{d.fee && v ? `₹${(d.fee / v).toFixed(2)}` : "—"}</td></tr>; })}
            </tbody></table> : <p className="hint" style={{ padding: "0 20px 18px" }}>No deals yet.</p>}
          </div>

          <div className="panel">
            <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Applications</h2></div>
            {apps.length ? <table className="tbl"><tbody>
              {apps.map((a) => <tr key={a.id}><td><a className="link" href={`/team/campaigns/${a.cid}`}>{a.title}</a><div className="hint">{String(a.created_at).slice(0, 10)}</div></td><td className="num">{a.match_score ?? "—"}</td><td><span className="pill">{a.status}</span></td></tr>)}
            </tbody></table> : <p className="hint" style={{ padding: "0 20px 18px" }}>Hasn't applied to any opportunity.</p>}
          </div>
        </div>
      </div>
    </TeamShell>
  );
}
