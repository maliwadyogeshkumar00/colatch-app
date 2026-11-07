import { redirect } from "next/navigation";
import { headers } from "next/headers";
import TeamShell from "../../../_ui/TeamShell";
import CampaignFields from "../../../_ui/CampaignFields";
import { flashUrl } from "../../../_ui/flash";
import { AutoSelect, CopyButton } from "../../_client";
import { requireTeam } from "../../_guard";
import { env } from "@/lib/net/env";
import { campaignFieldsFromForm, rankCreators, requirementChips, CAMPAIGN_STATUS_LABEL, REJECT_REASONS } from "@/lib/net/campaign";
import { compact, inr } from "@/lib/net/creators";
import { match } from "@/lib/net/match";
import { checkBrief } from "@/lib/net/compliance";
import { newToken } from "@/lib/net/tokens";
import { scrubContacts } from "@/lib/net/guard";
import { marketRate } from "@/lib/net/value";

export const metadata = { title: "Campaign · Colatch Connect", robots: { index: false, follow: false } };

const back = (id, key, msg) => flashUrl(`/team/campaigns/${id}`, key, msg);

/** Every form on this page posts here; `action` says what to do. Mirrors the POST handler of the Astro page. */
async function handle(fd, forced) {
  await requireTeam();
  const id = String(fd.get("id") ?? "");
  const action = forced || String(fd.get("action") ?? "");
  let msg = "";
  try {
    if (action === "save" || action === "approve") {
      const v = campaignFieldsFromForm(fd);
      const sb = scrubContacts(v.brief); v.brief = sb.text || null; v.title = scrubContacts(v.title).text || v.title;
      const cur = await env.DB.prepare("SELECT raw_brief FROM campaigns WHERE id=?").bind(id).first();
      const blocked = action === "approve" && checkBrief([cur?.raw_brief, v.brief, v.title, v.brand].join(" ")).some((x) => x.level === "block");
      if (blocked) return back(id, "err", "Not published: this brief promotes betting or real-money gaming, which Colatch does not run. Reject it, or remove that content first.");
      await env.DB.prepare(
        `UPDATE campaigns SET title=?, brand=?, brief=?, deliverables=?, talent_types=?, niche=?, city=?, languages=?, gender=?, min_followers=?, max_followers=?,
         creators_needed=?, budget_note=?, budget_total=?, deadline=?, shoot_date=?, pay_type=?, revisions=?, usage_rights=?, payment_days=?, approve_hours=?, mandatories=?, exclusions=?, brand_url=?, promised_cpv=?, brand_category=?, reward_value=?, commission_pct=?, funded=? ${action === "approve" ? ", status='open', is_open=CASE WHEN pitch_id IS NULL THEN 1 ELSE 0 END" : ""} WHERE id=?`
      ).bind(v.title, v.brand, v.brief, v.deliverables, v.talent_types, v.niche, v.city, v.languages, v.gender, v.min_followers, v.max_followers,
        v.creators_needed, v.budget_note, v.budget_total, v.deadline, v.shoot_date, v.pay_type, v.revisions, v.usage_rights, v.payment_days, v.approve_hours, v.mandatories, v.exclusions, v.brand_url, v.promised_cpv, v.brand_category, v.reward_value, v.commission_pct, v.funded, id).run();
      msg = (action === "approve" ? "Published. Matching creators can see it now." : "Saved.") + (sb.found ? ` ${sb.found} contact detail(s) were hidden from the creator brief.` : "");
    } else if (["close", "reject", "reopen"].includes(action)) {
      const st = action === "close" ? "closed" : action === "reject" ? "rejected" : "open";
      // A booked creator idea (pitch_id set) is a private deal with that creator: never publish it to the open feed.
      await env.DB.prepare("UPDATE campaigns SET status=?, is_open=CASE WHEN pitch_id IS NULL AND ?=1 THEN 1 ELSE 0 END WHERE id=?").bind(st, st === "open" ? 1 : 0, id).run();
      msg = `Marked ${CAMPAIGN_STATUS_LABEL[st].toLowerCase()}.`;
    } else if (action === "verify") {
      // #69 Verified brand: clears the scam-shield hold.
      await env.DB.prepare("UPDATE campaigns SET brand_verified=1, held_reason=NULL WHERE id=?").bind(id).run();
      msg = "Brand marked verified. The hold is cleared; creators will see a Verified brand badge.";
    } else if (action === "feature") {
      // #94 Featured brief: pinned for 7 days.
      await env.DB.prepare("UPDATE campaigns SET featured_until=datetime('now','+7 days') WHERE id=?").bind(id).run();
      msg = "Featured for 7 days. Remember to invoice ₹1,999.";
    } else if (action === "unfeature") {
      await env.DB.prepare("UPDATE campaigns SET featured_until=NULL WHERE id=?").bind(id).run();
      msg = "No longer featured.";
    } else if (action === "share") {
      await env.DB.prepare("UPDATE campaigns SET share_token=COALESCE(share_token, ?) WHERE id=?").bind(newToken() + newToken(), id).run();
      msg = "Client shortlist link ready. Copy it below and send it to the client.";
    } else if (action === "note") {
      await env.DB.prepare("UPDATE campaign_applications SET team_note=? WHERE id=? AND campaign_id=?").bind(String(fd.get("team_note") ?? "").trim().slice(0, 400) || null, String(fd.get("app") ?? ""), id).run();
      msg = "Note saved. The client sees it on the shortlist.";
    } else if (action === "app") {
      const appId = String(fd.get("app") ?? "");
      const st = String(fd.get("status") ?? "");
      if (["shortlisted", "rejected", "accepted", "new"].includes(st)) {
        const reason = String(fd.get("reason") ?? "");
        if (st === "rejected" && !REJECT_REASONS[reason]) return back(id, "err", "Pick a reason before rejecting. The creator sees it with a tip.");
        await env.DB.prepare("UPDATE campaign_applications SET status=?, reject_reason=? WHERE id=? AND campaign_id=?").bind(st, st === "rejected" ? reason : null, appId, id).run();
        if (st === "shortlisted" || st === "accepted") {
          const a = await env.DB.prepare("SELECT a.creator_id, a.rate_quote, k.brand, k.client_company, k.deliverables, k.revisions, k.shoot_date, k.reward_value, c.rate_reel, c.followers FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id LEFT JOIN creators c ON c.id=a.creator_id WHERE a.id=?").bind(appId).first();
          if (a?.creator_id) {
            const existing = await env.DB.prepare("SELECT id FROM creator_deals WHERE creator_id=? AND campaign_id=?").bind(a.creator_id, id).first();
            const stage = st === "accepted" ? "confirmed" : "shortlisted";
            if (existing) await env.DB.prepare("UPDATE creator_deals SET stage=?, updated_at=datetime('now') WHERE id=?").bind(stage, existing.id).run();
            else await env.DB.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, application_id, brand, deliverable, stage, fee, revisions_included, go_live_date, market_rate, reward_value) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
              .bind(crypto.randomUUID(), a.creator_id, id, appId, a.brand || a.client_company || "Confidential", a.deliverables, stage, a.rate_quote, a.revisions ?? 2, a.shoot_date, marketRate(a), a.reward_value).run();
          }
        }
        msg = st === "accepted" ? "Accepted and added to the CRM as confirmed." : st === "shortlisted" ? "Shortlisted and added to the CRM." : "Updated.";
      }
    }
  } catch (e) {
    return back(id, "err", e instanceof Error ? e.message : "Something went wrong.");
  }
  return msg ? back(id, "ok", msg) : `/team/campaigns/${id}`;
}

async function act(fd) { "use server"; redirect(await handle(fd)); }
async function saveAct(fd) { "use server"; redirect(await handle(fd, "save")); }
async function approveAct(fd) { "use server"; redirect(await handle(fd, "approve")); }

export default async function Page({ params, searchParams }) {
  const me = await requireTeam();
  const id = params.id;
  const k = await env.DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(id).first();
  if (!k) redirect("/team/campaigns");
  const flash = searchParams?.err || searchParams?.ok || (searchParams?.new ? "Brief read. Check the needs below, fix anything, then approve to publish it to matching creators." : "");
  const tone = searchParams?.err ? "bad" : "good";

  const apps = (await env.DB.prepare(
    `SELECT a.*, c.profile_pic, c.followers AS cf, c.engagement_rate, c.quality_score, c.verified, c.skills, c.niche AS cniche, c.city AS ccity, c.language, c.gender, c.portfolio_links, c.rate_reel, c.bio_pitch, c.open_to_barter, c.status AS cstatus
     FROM campaign_applications a LEFT JOIN creators c ON c.id=a.creator_id WHERE a.campaign_id=? ORDER BY a.created_at DESC`
  ).bind(id).all()).results ?? [];
  // Re-score applicants against the current brief so edits to the brief re-rank them.
  const ranked = apps.map((a) => ({ a, m: match({ skills: a.skills, niche: a.cniche, city: a.ccity ?? a.city, language: a.language, gender: a.gender, followers: a.cf ?? a.followers, engagement_rate: a.engagement_rate, quality_score: a.quality_score, verified: a.verified, status: a.cstatus, portfolio_links: a.portfolio_links, rate_reel: a.rate_reel, bio_pitch: a.bio_pitch, open_to_barter: a.open_to_barter }, k) }))
    .sort((x, y) => (y.m.eligible ? 1 : 0) - (x.m.eligible ? 1 : 0) || y.m.score - x.m.score);
  const appliedHandles = new Set(apps.map((a) => a.handle));
  const pool = (await rankCreators(env, k, 40)).filter((x) => !appliedHandles.has(x.c.handle));
  let ai = {};
  try { ai = JSON.parse(k.ai_notes || "{}"); } catch {}
  const flags = checkBrief([k.raw_brief, k.brief, k.title, k.brand].join(" "));
  const slApps = apps.filter((a) => ["shortlisted", "accepted"].includes(a.status));
  const slTotal = slApps.length, slOk = slApps.filter((a) => a.client_decision === "approved").length, slNo = slApps.filter((a) => a.client_decision === "declined").length;
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const inviteText = (name) => `Hi ${name}! Colatch here. We have a paid opportunity that fits your profile: "${k.title}"${k.budget_note ? ` (${k.budget_note})` : ""}. See the brief and apply: ${origin}/creator/o/${k.slug}`;
  const wa = (phone, name) => phone ? `https://wa.me/${String(phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(inviteText(name))}` : "";
  const initials = (s) => String(s).replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const chips = requirementChips(k);
  const eligibleN = ranked.filter((r) => r.m.eligible).length;
  const hidden = (a) => <><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value={a} /></>;
  const esc = (s) => String(s).replace(/</g, "&lt;");
  const nowTs = new Date().toISOString().replace("T", " ").slice(0, 19);

  return (
    <TeamShell active="campaigns" eyebrow={CAMPAIGN_STATUS_LABEL[k.status] || k.status} title={esc(k.title)} email={me.email}
      actions={<>
        {k.status === "open" && <a className="btn" href={`/creator/o/${k.slug}`} target="_blank">Creator view ↗</a>}
        {k.status === "open" ? <form action={act}>{hidden("close")}<button className="btn">Close</button></form>
          : k.status === "pending" ? <form action={act}>{hidden("reject")}<button className="btn danger">Reject</button></form>
          : <form action={act}>{hidden("reopen")}<button className="btn">Reopen</button></form>}
      </>}>

      {flash && <div className={`note ${tone}`} style={{ marginBottom: 16 }}>{flash}</div>}

      {k.held_reason && <div className="note bad" style={{ marginBottom: 16 }}>
        <div className="spread"><div><b>On hold: {k.held_reason}.</b> Call or WhatsApp {k.client_name || "the client"}{k.client_phone ? ` on ${k.client_phone}` : ""} and check the company (GST, website, LinkedIn) before publishing.{ai.website ? ` They gave the website ${ai.website}.` : ""}</div>
          <form action={act}>{hidden("verify")}<button className="btn plum">Mark brand verified</button></form></div>
      </div>}

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        {Number(k.brand_verified) === 1 ? <span className="pill good">Verified brand</span> : !k.held_reason && <form action={act}>{hidden("verify")}<button className="btn sm">Mark brand verified</button></form>}
        {Number(k.rush) === 1 && <span className="pill bad">Rush: shortlist in 6 working hours (+5% fee)</span>}
        {k.brief_score != null && <span className="pill">Brief strength {k.brief_score}/100</span>}
        {k.featured_until && k.featured_until > nowTs
          ? <><span className="pill ok">Featured until {String(k.featured_until).slice(0, 10)}</span><form action={act}>{hidden("unfeature")}<button className="btn sm">Stop featuring</button></form></>
          : <>{ai.featured_request && <span className="pill ok">Client asked to feature (₹1,999)</span>}<form action={act}>{hidden("feature")}<button className="btn sm">Feature for 7 days</button></form></>}
      </div>

      <div className="grid4">
        <div className="panel kpi"><div className="k">Applicants</div><div className="v">{apps.length}</div><div className="s">{eligibleN} meet every requirement</div></div>
        <div className="panel kpi"><div className="k">Matching creators</div><div className="v">{pool.length + eligibleN}{pool.length === 40 ? "+" : ""}</div><div className="s">in the database who can see this</div></div>
        <div className="panel kpi"><div className="k">Needed</div><div className="v">{k.creators_needed ?? "—"}</div><div className="s">{k.deliverables || "Deliverables not set"}</div></div>
        <div className="panel kpi"><div className="k">Client budget</div><div className="v">{k.budget_total ? inr(k.budget_total) : "—"}</div><div className="s">{k.creators_needed && k.budget_total ? `${inr(k.budget_total / k.creators_needed)} per creator` : "team only"}</div></div>
      </div>

      {flags.length > 0 && (
        <div className="stack sec" style={{ marginTop: 20 }}>{flags.map((f, i) => <div key={i} className={`note ${f.level === "check" ? "warn" : "bad"}`}><b>{f.level === "block" ? "Blocked" : f.level === "stop" ? "Stop and check" : "Check"}: {f.title}.</b> {f.detail}</div>)}</div>
      )}

      {(k.source === "client" || k.raw_brief || ai.questions?.length) ? (
        <div className="grid2 sec" style={{ alignItems: "start" }}>
          {k.raw_brief && <div className="panel pad"><h2>Original brief {k.source === "client" ? "from client" : ""}</h2><p style={{ whiteSpace: "pre-line", margin: 0, color: "var(--ink-2)" }}>{k.raw_brief}</p>
            {k.source === "client" && <p className="hint" style={{ margin: "14px 0 0" }}><b>{k.client_name}</b>{k.client_company ? ` · ${k.client_company}` : ""}<br />{k.client_email}{k.client_phone ? ` · ${k.client_phone}` : ""}</p>}</div>}
          <div className="panel pad"><h2>{ai.engine === "ai" ? "AI read this brief" : "Read by keyword rules"}</h2>
            <div>{chips.map((r) => <span key={r} className="tag">{r}</span>)}{!chips.length && <span className="hint">No hard requirements, so every creator can see it.</span>}</div>
            {ai.questions?.length ? <><div className="lbl" style={{ marginTop: 16 }}>Clarify with the client</div><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{ai.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></> : null}
          </div>
        </div>
      ) : null}

      <form className="panel pad sec" action={saveAct}>
        <input type="hidden" name="id" value={id} />
        <div className="spread"><h2 style={{ margin: 0 }}>Needs and what creators see</h2><span className="hint">Talent, followers, city and gender decide who can see this. Niche and language only change the ranking.</span></div>
        <div style={{ marginTop: 16 }}><CampaignFields v={k} /></div>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn" formAction={saveAct}>Save</button>
          {k.status !== "open" && <button className="btn plum" formAction={approveAct}>Approve &amp; publish to matching creators</button>}
        </div>
      </form>

      <div className="panel pad sec">
        <div className="spread">
          <div><h2 style={{ margin: 0 }}>Client shortlist</h2><p className="hint" style={{ margin: "6px 0 0" }}>Shortlisted and accepted creators appear on a private page where the client approves or declines each one. Your note on each creator is shown as "Why we picked them".</p></div>
          {k.share_token
            ? <div className="row"><code className="k">{origin}/shortlist/{k.share_token.slice(0, 8)}…</code><CopyButton url={`${origin}/shortlist/${k.share_token}`} /><a className="btn sm" href={`/shortlist/${k.share_token}`} target="_blank">Open ↗</a></div>
            : <form action={act}>{hidden("share")}<button className="btn plum">Create client link</button></form>}
        </div>
        {slTotal > 0 && <p className="small" style={{ margin: "12px 0 0" }}>{slTotal} on the shortlist · <b style={{ color: "var(--good)" }}>{slOk} approved</b> · {slNo} declined · {slTotal - slOk - slNo} waiting</p>}
      </div>

      <div className="sec">
        <div className="h2">Applicants, best match first</div>
        {ranked.length ? (
          <div className="panel scroll-x"><table className="tbl">
            <thead><tr><th>Match</th><th>Creator</th><th className="num">Followers</th><th className="num">ER</th><th className="num">Quote</th><th>Why</th><th>Status</th></tr></thead>
            <tbody>{ranked.map(({ a, m }) => (
              <tr key={a.id}>
                <td><div className="score sm" style={{ "--v": m.score }}><i>{m.score}</i></div></td>
                <td><a className="who" href={a.creator_id ? `/team/creators/${a.creator_id}` : `https://instagram.com/${a.handle}`}><div className="ava">{a.profile_pic ? <img src={a.profile_pic} alt="" /> : initials(a.name || a.handle)}</div><div><b>{a.name || a.handle}{a.verified ? " ✓" : ""}</b><span>@{a.handle}{a.ccity || a.city ? ` · ${a.ccity || a.city}` : ""}</span></div></a>
                  {a.pitch && <div className="hint" style={{ maxWidth: 360, marginTop: 6 }}>"{a.pitch}"</div>}</td>
                <td className="num">{compact(a.cf ?? a.followers)}</td>
                <td className="num">{a.engagement_rate != null ? `${a.engagement_rate}%` : "—"}</td>
                <td className="num">{a.rate_quote ? inr(a.rate_quote) : "—"}</td>
                <td style={{ maxWidth: 260 }}>{m.reasons.slice(0, 2).map((r) => <span key={r} className="tag">{r}</span>)}{m.blockers.map((b) => <span key={b} className="tag" style={{ background: "rgba(155,59,59,.08)", color: "#7a2c2c" }}>{b}</span>)}</td>
                <td>{a.client_decision && <span className={`pill ${a.client_decision === "approved" ? "good" : "low"}`} style={{ marginBottom: 6 }}>Client {a.client_decision}</span>}{a.client_note && <div className="hint" style={{ maxWidth: 200 }}>"{a.client_note}"</div>}
                  {["shortlisted", "accepted"].includes(a.status) && <form action={act} className="row" style={{ margin: "6px 0", gap: 6, flexWrap: "nowrap" }}>{hidden("note")}<input type="hidden" name="app" value={a.id} /><input className="in" name="team_note" defaultValue={a.team_note ?? ""} placeholder="Why we picked them" style={{ padding: "6px 8px", fontSize: 12.5, minWidth: 180 }} /><button className="btn sm">Save</button></form>}
                  <form action={act}>{hidden("app")}<input type="hidden" name="app" value={a.id} />
                    <select className="in" name="reason" defaultValue={a.reject_reason ?? ""} style={{ width: "auto", padding: "6px 8px", fontSize: 12, marginBottom: 4 }}><option value="">Reason if rejecting…</option>{Object.entries(REJECT_REASONS).map(([key, val]) => <option key={key} value={key}>{val[0]}</option>)}</select>
                    <AutoSelect className="in" name="status" defaultValue={a.status} style={{ width: "auto", padding: "6px 8px", fontSize: 12.5 }}>{[["new", "New"], ["shortlisted", "Shortlist"], ["accepted", "Accept"], ["rejected", "Reject"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</AutoSelect></form></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="panel empty"><b>No applicants yet.</b>{k.status === "open" ? "Invite the matching creators below. Each invite is a ready WhatsApp message." : "Approve the opportunity so matching creators can see it."}</div>}
      </div>

      <div className="sec">
        <div className="spread" style={{ marginBottom: 12 }}><div className="h2" style={{ margin: 0 }}>Matching creators who haven't applied</div><span className="hint">From Colatch's database, ranked by the same engine</span></div>
        {pool.length ? (
          <div className="panel scroll-x"><table className="tbl">
            <thead><tr><th>Match</th><th>Creator</th><th className="num">Followers</th><th className="num">ER</th><th className="num">Reel rate</th><th>Why</th><th></th></tr></thead>
            <tbody>{pool.map(({ c, m }) => (
              <tr key={c.id}>
                <td><div className="score sm" style={{ "--v": m.score }}><i>{m.score}</i></div></td>
                <td><a className="who" href={`/team/creators/${c.id}`}><div className="ava">{c.profile_pic ? <img src={c.profile_pic} alt="" loading="lazy" /> : initials(c.name || c.handle)}</div><div><b>{c.name || c.handle}</b><span>@{c.handle}{c.city ? ` · ${c.city}` : ""}</span></div></a></td>
                <td className="num">{compact(c.followers)}</td>
                <td className="num">{c.engagement_rate != null ? `${c.engagement_rate}%` : "—"}</td>
                <td className="num">{c.rate_reel ? inr(c.rate_reel) : "—"}</td>
                <td style={{ maxWidth: 260 }}>{m.reasons.slice(0, 2).map((r) => <span key={r} className="tag">{r}</span>)}</td>
                <td>{k.status === "open" && (wa(c.phone, c.name || c.handle) ? <a className="btn sm" href={wa(c.phone, c.name || c.handle)} target="_blank" rel="noopener">Invite on WhatsApp</a> : <a className="btn sm" href={`https://ig.me/m/${c.handle}`} target="_blank" rel="noopener">Invite on Instagram</a>)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="panel empty"><b>No one in the database fits yet.</b>Loosen a hard requirement, import more creators, or share <code className="k">{origin}/join</code> with {chips[0]?.toLowerCase() || "creator"} communities.</div>}
      </div>
    </TeamShell>
  );
}
