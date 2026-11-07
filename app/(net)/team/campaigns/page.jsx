import { redirect } from "next/navigation";
import { headers } from "next/headers";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { extractNeeds, slugify } from "@/lib/net/brief";
import { needsToFields, requirementChips, CAMPAIGN_STATUS_LABEL } from "@/lib/net/campaign";
import { inr } from "@/lib/net/creators";
import { scrubContacts } from "@/lib/net/guard";

export const metadata = { title: "Open campaigns · Colatch Connect", robots: { index: false, follow: false } };

async function readBrief(fd) {
  "use server";
  await requireTeam();
  const text = String(fd.get("raw") ?? "").trim();
  if (text.length < 15) redirect(flashUrl("/team/campaigns#new", "err", "Paste a few lines of the brief first."));
  let id;
  try {
    const { needs, engine } = await extractNeeds(env, text);
    const v = needsToFields(needs);
    v.brief = scrubContacts(v.brief).text; v.title = scrubContacts(v.title).text;
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO campaigns (id, slug, title, brand, brief, raw_brief, deliverables, talent_types, niche, city, languages, gender, min_followers, max_followers,
       creators_needed, budget_total, status, source, ai_notes, is_open) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','team',?,0)`
    ).bind(id, slugify(v.title), v.title, String(fd.get("brand") ?? "").trim() || null, v.brief, text, v.deliverables, v.talent_types, v.niche, v.city,
      v.languages, v.gender, v.min_followers, v.max_followers, v.creators_needed, v.budget_total,
      JSON.stringify({ engine, questions: needs.questions })).run();
  } catch (e) {
    redirect(flashUrl("/team/campaigns#new", "err", e instanceof Error ? e.message : "Something went wrong."));
  }
  redirect(`/team/campaigns/${id}?new=1`);
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const tab = searchParams?.tab ?? "all";
  let camps = [];
  let dbErr = "";
  try {
    camps = (await env.DB.prepare(
      `SELECT k.*, (SELECT COUNT(*) FROM campaign_applications a WHERE a.campaign_id=k.id) apps,
              (SELECT COUNT(*) FROM campaign_applications a WHERE a.campaign_id=k.id AND a.status='new') newapps
       FROM campaigns k ORDER BY CASE k.status WHEN 'pending' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, k.created_at DESC LIMIT 200`
    ).all()).results ?? [];
  } catch (e) { dbErr = e instanceof Error ? e.message : String(e); }
  const counts = { pending: camps.filter((c) => c.status === "pending").length, open: camps.filter((c) => c.status === "open").length };
  const shown = tab === "all" ? camps : camps.filter((c) => c.status === tab);
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;

  return (
    <TeamShell active="campaigns" eyebrow="Creator tools" title="Briefs in, <b>right creators</b> out." email={me.email}
      actions={<a className="btn-foil" href="#new">+ New opportunity</a>}>
      <p className="lead">Clients send briefs from the public brief page, or the team pastes one in here. AI turns it into clear needs: talent, city, size and language. Once you approve it, only creators who fit can see it and apply.</p>
      {dbErr && <div className="note bad" style={{ marginBottom: 16 }}><b>Database not reachable.</b> ({dbErr})</div>}
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>

      <div className="grid3">
        <div className="panel kpi"><div className="k">Waiting for approval</div><div className="v">{counts.pending}</div><div className="s">client and team briefs</div></div>
        <div className="panel kpi"><div className="k">Live for creators</div><div className="v">{counts.open}</div><div className="s">shown only to matching creators</div></div>
        <div className="panel kpi"><div className="k">Share these links</div><div className="s" style={{ marginTop: 8 }}>Clients: <code className="k">{origin}/brief</code></div><div className="s" style={{ marginTop: 6 }}>Creators: <code className="k">{origin}/join</code></div></div>
      </div>

      <div className="row sec" style={{ marginTop: 24 }}>
        {[["all", "All"], ["pending", "Waiting"], ["open", "Open"], ["closed", "Closed"], ["rejected", "Rejected"]].map(([key, l]) => <a key={key} className={`btn sm ${tab === key ? "plum" : ""}`} href={`?tab=${key}`}>{l}</a>)}
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {shown.map((k) => (
          <a key={k.id} className="opp" href={`/team/campaigns/${k.id}`}>
            <div className="top">
              <div style={{ minWidth: 0 }}>
                <div className="br">{k.brand || k.client_company || "Brand confidential"} · {k.source === "client" ? "from client" : "team"}</div>
                <h3>{k.title}</h3>
              </div>
              <div className="row" style={{ gap: 8, flex: "none" }}>
                {k.newapps > 0 && <span className="pill ok">{k.newapps} new</span>}
                <span className={`pill ${k.status === "open" ? "good" : k.status === "pending" ? "ok" : ""}`}>{CAMPAIGN_STATUS_LABEL[k.status] || k.status}</span>
              </div>
            </div>
            <div className="why">{requirementChips(k).map((r) => <span key={r} style={{ background: "var(--ivory-2)", color: "var(--p700)" }}>{r}</span>)}</div>
            <div className="facts"><span><b>{k.apps}</b> applicants</span>{k.creators_needed ? <span>Needs <b>{k.creators_needed}</b></span> : null}{k.deliverables && <span>{k.deliverables}</span>}{k.budget_total ? <span>Budget <b>{inr(k.budget_total)}</b></span> : null}{k.deadline && <span>Apply by <b>{k.deadline}</b></span>}</div>
          </a>
        ))}
        {!shown.length && <div className="panel empty"><b>Nothing here yet.</b>Paste a brief below, or send clients the brief link.</div>}
      </div>

      <form className="panel pad sec" id="new" action={readBrief}>
        <h2>New opportunity from a brief</h2>
        <p className="hint" style={{ marginTop: -6 }}>Paste the client's WhatsApp message, email or deck notes as it is. AI picks out the talent, cities, follower range, languages, deliverables and budget, and lists questions to clarify. You check it before anything goes live.</p>
        <div className="form-grid">
          <div className="fld full"><label>Brief</label><textarea name="raw" rows={6} placeholder="Need 4 female Bhangra dancers in Delhi/Chandigarh, 50K+ followers, Punjabi, 1 reel + 2 stories each for our Lohri launch. Shoot 8 Jan. Budget ₹3L." /></div>
          <div className="fld"><label>Brand <span className="opt">— optional</span></label><input name="brand" /></div>
        </div>
        <button className="btn plum" style={{ marginTop: 14 }}>Read brief →</button>
        {!env.ANTHROPIC_API_KEY && <p className="hint" style={{ margin: "10px 0 0" }}>No AI key is set, so keyword rules read the brief. Add <code className="k">ANTHROPIC_API_KEY</code> in Vercel for full AI reading.</p>}
      </form>
    </TeamShell>
  );
}
