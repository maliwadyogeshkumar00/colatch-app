import { redirect } from "next/navigation";
import { headers } from "next/headers";
import TeamShell from "../../_ui/TeamShell";
import { day } from "@/components/team/labels";
import Flash, { flashUrl } from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { extractNeeds, slugify } from "@/lib/net/brief";
import { needsToFields, requirementChips, CAMPAIGN_STATUS_LABEL } from "@/lib/net/campaign";
import { inr } from "@/lib/net/creators";
import { scrubContacts } from "@/lib/net/guard";
import { weekSeries } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, FilterBar, FilterChips, DataTable, Grid, Section, Card, AsideCard, InlineState, Pill, Tags, Split, Cell, Figure, Pager, paginate, pageHref } from "@/components/ui";

export const metadata = { title: "Open campaigns", robots: { index: false, follow: false } };

async function readBrief(fd) {
  "use server";
  await requireTeam("shortlist");
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
       FROM campaigns k ORDER BY CASE k.status WHEN 'pending' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, k.rush DESC, k.created_at DESC LIMIT 200`
    ).all()).results ?? [];
  } catch (e) { dbErr = e instanceof Error ? e.message : String(e); }
  const counts = { pending: camps.filter((c) => c.status === "pending").length, open: camps.filter((c) => c.status === "open").length };
  const shown = tab === "all" ? camps : camps.filter((c) => c.status === tab);
  // 25 a page, like team home's "Showing 12 of 51"; the tab stays in the links.
  const pg = paginate(shown, searchParams?.page, 25);
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;

  // Everything below is worked out from the rows already loaded: no extra queries.
  const now = Date.now();
  const nowSql = new Date(now).toISOString().replace("T", " ").slice(0, 19);
  const by = (s) => camps.filter((c) => c.status === s).length;
  const sum = (k) => camps.reduce((a, c) => a + Number(c[k] || 0), 0);
  const newApps = sum("newapps"), allApps = sum("apps");
  const weekly = weekSeries(camps.map((c) => c.created_at), now, 8);
  const briefs8 = weekly.reduce((a, b) => a + b, 0);
  const rush = camps.filter((c) => Number(c.rush) === 1 && c.status === "pending").length;
  const held = camps.filter((c) => c.held_reason).length;
  const plural = (n, one, many) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
  const TABS = [["all", "All", camps.length], ["pending", "Waiting", counts.pending], ["open", "Open", counts.open], ["closed", "Closed", by("closed")], ["rejected", "Rejected", by("rejected")]];
  const STATUS_TONE = { open: "done", pending: "wait", closed: "off", rejected: "off" };

  const columns = [
    { key: "title", label: "Campaign", render: (k) => (
      <Cell eyebrow={`${k.brand || k.client_company || "Brand confidential"} · ${k.source === "client" ? "from client" : "team"}`} title={k.title}
        sub={(requirementChips(k).length > 0 || k.deliverables) && <><Tags items={requirementChips(k)} max={4} />{k.deliverables && <span>{k.deliverables}</span>}</>} />
    ) },
    { key: "status", label: "Status", primary: true, render: (k) => (
      <span className="ui-pills">
        <Pill tone={STATUS_TONE[k.status] || "quiet"}>{CAMPAIGN_STATUS_LABEL[k.status] || k.status}</Pill>
        {k.held_reason && <Pill tone="mine" title={k.held_reason}>On hold: verify brand</Pill>}
        {Number(k.rush) === 1 && k.status === "pending" && <Pill tone="plum">Rush</Pill>}
        {k.featured_until && String(k.featured_until) > nowSql && <Pill tone="gold">Featured</Pill>}
      </span>
    ) },
    { key: "apps", label: "Applicants", num: true, render: (k) => (
      <Figure value={Number(k.apps || 0)} note={k.newapps > 0 ? `${k.newapps} new` : k.creators_needed ? `needs ${k.creators_needed}` : null} />
    ) },
    { key: "budget_total", label: "Budget", num: true, render: (k) => (k.budget_total ? <Figure value={inr(k.budget_total)} /> : null) },
    { key: "deadline", label: "Apply by", num: true, render: (k) => (k.deadline ? day(k.deadline) || k.deadline : null) },
  ];

  return (
    <TeamShell active="campaigns" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator tools" }, { label: "Open campaigns" }]}
        actions={<a className="btn-foil" href="#new">+ New opportunity</a>}
        eyebrow="Creator tools · Briefs"
        title="Briefs in, <b>right creators</b> out."
        sub="Clients send briefs from the public brief page, or the team pastes one in here. AI turns it into clear needs: talent, city, size and language. Once you approve it, only creators who fit can see it and apply."
      />
      {dbErr && <div style={{ marginBottom: 16 }}><InlineState kind="error" label="Database not reachable.">{dbErr}</InlineState></div>}
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>

      <KpiStrip label="Campaigns at a glance" items={[
        { label: "Waiting for approval", value: counts.pending, foot: rush ? `${rush} marked rush · client and team briefs` : "client and team briefs", href: "?tab=pending" },
        { label: "Live for creators", value: counts.open, foot: "shown only to matching creators", href: "?tab=open" },
        { featured: true, label: "New applicants to review", value: newApps, foot: `${plural(allApps, "applicant", "applicants")} in all` },
        { label: "Briefs in · 8 weeks", value: briefs8, spark: weekly, sparkLabel: "Briefs created per week, last 8 weeks", foot: "per week, oldest first" },
      ]} />

      <Grid aside={<>
        <AsideCard eyebrow="Insight" title="Where briefs stand" foot={<a href="?tab=all">See every brief</a>}>
          <Split label="Campaigns by status" parts={[
            { label: "Waiting", n: counts.pending, href: "?tab=pending" },
            { label: "Open", n: counts.open, href: "?tab=open" },
            { label: "Closed", n: by("closed"), href: "?tab=closed" },
            { label: "Rejected", n: by("rejected"), href: "?tab=rejected" },
          ]} />
          <p className="small">{counts.pending ? <><b>{plural(counts.pending, "brief", "briefs")}</b> waiting for approval{held ? <>, {held} on hold until the brand is verified</> : null}. Approve to show them to matching creators.</> : <>Nothing waiting for approval.</>}</p>
        </AsideCard>
        <AsideCard eyebrow="Share these links" title="Bring in briefs and creators">
          <p className="small">Clients: <code className="k">{origin}/brief</code></p>
          <p className="small">Creators: <code className="k">{origin}/join</code></p>
        </AsideCard>
        <AsideCard tone="night" eyebrow="Read a brief with AI" title="Paste it as it came.">
          <p className="small">A WhatsApp message, an email or deck notes. AI picks out talent, cities, follower range, languages, deliverables and budget, and lists what to clarify.</p>
          <p className="small"><a href="#new">Paste a brief →</a></p>
        </AsideCard>
      </>}>
        <Section title="Campaigns" sub={`${plural(shown.length, "brief", "briefs")}${tab === "all" ? "" : ` · ${TABS.find((t) => t[0] === tab)?.[1] || tab}`}. Waiting for approval first, then open, newest first.`}>
          <FilterBar label="Filter campaigns">
            <FilterChips name="tab" label="Filter by status" current={tab} hrefFor={(v) => `?tab=${v}`} options={TABS.map(([value, label, count]) => ({ value, label, count }))} />
          </FilterBar>
          <DataTable caption="Campaigns" columns={columns} rows={pg.rows} rowHref={(k) => `/team/campaigns/${k.id}`}
            empty={{ title: "Nothing here yet.", body: tab === "all" ? "Paste a brief below, or send clients the brief link." : "No campaigns with this status.", action: tab === "all" ? <a className="btn sm" href="#new">Paste a brief</a> : <a className="btn sm" href="?tab=all">See all campaigns</a> }} />
          <Pager p={pg} noun={["brief", "briefs"]} label="Campaign pages" hrefFor={(n) => pageHref(searchParams, n, { path: "/team/campaigns" })} />
        </Section>

        <Section id="new" title="New opportunity from a brief" sub="Paste the client's WhatsApp message, email or deck notes as it is. AI picks out the talent, cities, follower range, languages, deliverables and budget, and lists questions to clarify. You check it before anything goes live.">
          <Card>
            <form action={readBrief}>
              <div className="form-grid">
                <div className="fld full"><label htmlFor="f-team-campaigns-raw-1">Brief</label><textarea id="f-team-campaigns-raw-1" name="raw" rows={6} placeholder="Need 4 female Bhangra dancers in Delhi/Chandigarh, 50K+ followers, Punjabi, 1 reel + 2 stories each for our Lohri launch. Shoot 8 Jan. Budget ₹3L." /></div>
                <div className="fld"><label htmlFor="f-team-campaigns-brand-2">Brand <span className="opt">— optional</span></label><input id="f-team-campaigns-brand-2" name="brand" /></div>
              </div>
              <button className="btn plum" style={{ marginTop: 14 }}>Read brief →</button>
              {!env.ANTHROPIC_API_KEY && <p className="hint" style={{ margin: "10px 0 0" }}>No AI key is set, so keyword rules read the brief. Add <code className="k">ANTHROPIC_API_KEY</code> in Vercel for full AI reading.</p>}
            </form>
          </Card>
        </Section>
      </Grid>
    </TeamShell>
  );
}
