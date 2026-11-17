import TeamShell from "../../_ui/TeamShell";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { PageHeader, KpiStrip, ChartCard, FilterBar, FilterChips, Grid, Section, AsideCard, EmptyState, Pill } from "@/components/ui";
import { Feed, ShareBar, HBars, stamp } from "@/components/admin/Charts";
import Pager, { PER_PAGE, pageOf } from "@/components/admin/Pager";
import { AREAS, SENSITIVE, areaOf, actionTitle, changeLines, parseDetail } from "@/components/admin/audit";

export const metadata = { title: "Audit log", robots: { index: false, follow: false } };

const PAGE = PER_PAGE;
const when = (t) => stamp(t, { seconds: true });
const clean = (s, n = 80) => String(s ?? "").trim().slice(0, n);
const pretty = (d) => { const o = parseDetail(d); if (!o) return ""; return o._raw ? o._raw : JSON.stringify(o, null, 2); };

export default async function Page({ searchParams }) {
  // Owners and admins only: the log names every person and every action.
  const me = await requireTeam("team");
  const many = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results ?? [];
  const action = clean(searchParams?.action), entity = clean(searchParams?.entity), actor = clean(searchParams?.actor, 190);
  // `before` is the older cursor link format; it still works as a filter so saved links keep opening.
  const before = /^\d{1,18}$/.test(String(searchParams?.before || "")) ? String(searchParams.before) : "";
  const where = [], vals = [];
  if (action) { where.push("action LIKE ?"); vals.push(action.replace(/[%_\\]/g, "\\$&") + "%"); }
  if (entity) { where.push("entity = ?"); vals.push(entity); }
  if (actor) { where.push("actor_id = ?"); vals.push(actor); }
  if (before) { where.push("id < ?"); vals.push(before); }
  const W = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log ${W}`).bind(...vals).first().catch(() => null))?.n || 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(pageOf(searchParams), pages);
  const list = await many(`SELECT id, at, actor_kind, actor_id, action, entity, entity_id, detail FROM audit_log ${W} ORDER BY id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, ...vals);
  const entities = await many("SELECT DISTINCT entity FROM audit_log WHERE entity IS NOT NULL ORDER BY entity LIMIT 50");
  const keep = { ...(action ? { action } : {}), ...(entity ? { entity } : {}), ...(actor ? { actor } : {}), ...(before ? { before } : {}) };

  // Read-only activity counts (unfiltered): last 24 hours, 7 days, people, sign-ins, money, and a 14-day line.
  const k = (await env.DB.prepare(`SELECT
      COUNT(*) FILTER (WHERE at > now() - interval '24 hours') AS day_n,
      COUNT(*) FILTER (WHERE at > now() - interval '7 days') AS week_n,
      COUNT(DISTINCT actor_id) FILTER (WHERE at > now() - interval '7 days') AS people_n,
      COUNT(*) FILTER (WHERE at > now() - interval '7 days' AND action LIKE '%.login') AS logins_n,
      COUNT(*) FILTER (WHERE at > now() - interval '7 days' AND (action LIKE 'finance.%' OR action LIKE 'referral_earning.%' OR action LIKE '%payout%' OR action LIKE '%funding%')) AS money_n
    FROM audit_log WHERE at > now() - interval '7 days'`).first().catch(() => null)) || {};
  const daily = await many(`SELECT to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM audit_log WHERE at > now() - interval '14 days' GROUP BY 1`);
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + 5.5 * 36e5 - (13 - i) * 864e5).toISOString().slice(0, 10));
  const spark = days.map((d) => Number(daily.find((r) => r.d === d)?.n || 0));
  // Read-only: the 7-day mix by area and by person, and the access and money changes an owner should see.
  const heads = await many(`SELECT split_part(action, '.', 1) AS head, COUNT(*) AS n FROM audit_log WHERE at > now() - interval '7 days' GROUP BY 1`);
  const mix = [...AREAS, { key: "other", label: "Other", prefixes: [] }].map((a) => ({ label: a.label, n: heads.filter((h) => areaOf(h.head + ".x").key === a.key).reduce((s, h) => s + Number(h.n || 0), 0), key: a.key }))
    .filter((a) => a.n > 0).sort((x, y) => y.n - x.n);
  const actors = await many(`SELECT actor_kind, actor_id, COUNT(*) AS n FROM audit_log WHERE at > now() - interval '7 days' AND actor_id IS NOT NULL GROUP BY 1, 2 ORDER BY COUNT(*) DESC LIMIT 6`);
  const sens = [...SENSITIVE];
  const flagged = await many(`SELECT id, at, actor_kind, actor_id, action, entity, entity_id, detail FROM audit_log WHERE at > now() - interval '7 days' AND action IN (${sens.map(() => "?").join(",")}) ORDER BY at DESC, id DESC LIMIT 6`, ...sens);
  const flaggedN = Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE at > now() - interval '7 days' AND action IN (${sens.map(() => "?").join(",")})`).bind(...sens).first().catch(() => null))?.n || 0);

  // Names for the people on this screen: team members by id or email, creators by id.
  const team = await many("SELECT id, email, name FROM team_users");
  const ids = [...new Set([...list, ...flagged, ...actors].filter((r) => r.actor_kind === "creator" && r.actor_id).map((r) => String(r.actor_id)))].slice(0, 80);
  const creators = ids.length ? await many(`SELECT id, name, handle FROM creators WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids) : [];
  const nameOf = new Map([...team.flatMap((t) => [[t.id, t.name || t.email], [String(t.email || "").toLowerCase(), t.name || t.email]]), ...creators.map((c) => [c.id, c.name || (c.handle ? "@" + c.handle : c.id)])]);
  const cut = (x) => (String(x).length > 24 ? String(x).slice(0, 22) + "…" : String(x));
  const who = (r) => (r.actor_id ? nameOf.get(r.actor_id) || nameOf.get(String(r.actor_id).toLowerCase()) || cut(r.actor_id) : r.actor_kind === "system" ? "System" : "Someone");

  const filtered = Boolean(action || entity || actor || before);
  const quick = [["", "Everything"], ["team.", "Team and logins"], ["deal.", "Deals"], ["finance.", "Money"], ["webhook.", "Webhooks"], ["creator.", "Creators"]];
  const quickHref = (a) => "?" + new URLSearchParams({ ...(a ? { action: a } : {}), ...(entity ? { entity } : {}), ...(actor ? { actor } : {}) }).toString();
  const record = (r) => (r.entity === "deal" && r.entity_id ? <a className="link" href={`/team/deals/${encodeURIComponent(r.entity_id)}`}>Deal {String(r.entity_id).slice(0, 8)}</a> : r.entity ? <span>{String(r.entity).replace(/_/g, " ")}{r.entity_id ? ` ${String(r.entity_id).slice(0, 12)}` : ""}</span> : null);
  const item = (r, full = true) => {
    const lines = changeLines(r.action, r.detail);
    const raw = pretty(r.detail);
    return {
      key: r.id,
      when: <>{when(r.at)} <span className="adm-dim">· #{r.id}</span></>,
      title: <><b>{who(r)}</b> <span className="adm-dim">·</span> {actionTitle(r.action)}</>,
      sub: (<>
        {record(r) && <span className="adm-au__rec">{record(r)}</span>}
        {lines.length > 0 && <ul className="adm-au__lines">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        {full && raw && <details className="adm-au__raw"><summary>Raw detail</summary><pre>{raw}</pre></details>}
      </>),
      meta: <span className="adm-au__meta"><Pill tone={r.actor_kind === "team" ? "plum" : r.actor_kind === "system" ? "quiet" : "wait"}>{r.actor_kind}</Pill><code>{r.action}</code></span>,
    };
  };

  return (
    <TeamShell active="audit" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Owners and admins" }, { label: "Audit log" }]}
        eyebrow="Owners and admins"
        title="Audit <b>log</b>"
        sub="Every sign-in, decision and money record, newest first. The log can't be edited from the app."
        meta={[{ label: "To review · 7 days", value: flaggedN, gold: flaggedN > 0 }, { label: "Entries in all", value: total.toLocaleString("en-IN") }]}
      />

      <KpiStrip label="Activity" items={[
        { label: "Last 24 hours", value: Number(k.day_n || 0), foot: "entries logged" },
        { featured: true, label: "Last 7 days", value: Number(k.week_n || 0), foot: "per day, last 14 days", spark, sparkLabel: "Audit entries per day, last 14 days" },
        { label: "People and systems", value: Number(k.people_n || 0), foot: `acted in 7 days · ${Number(k.logins_n || 0)} sign-ins`, href: "?action=team." },
        { label: "Money actions", value: Number(k.money_n || 0), foot: "exports, payouts and funding in 7 days", href: "?action=finance." },
      ]} />

      <Grid cols={2}>
        <ChartCard level={2} title="What happened" period="Last 7 days" figure={Number(k.week_n || 0).toLocaleString("en-IN")} figureTitle="Entries in the last 7 days" foot="Grouped by the first part of each action.">
          {mix.length ? <ShareBar label="Audit entries by area, last 7 days" parts={mix.map((m) => ({ label: m.label, n: m.n }))} />
            : <EmptyState title="Quiet week." body="Nothing was logged in the last 7 days." />}
        </ChartCard>
        <ChartCard level={2} title="Who acted most" period="Last 7 days" foot="Team members, creators, brands and system jobs, by entries logged.">
          {actors.length ? <HBars label="Entries per person, last 7 days" aLabel="Entries" rows={actors.map((a) => ({ label: `${who(a)} · ${a.actor_kind}`, a: Number(a.n) }))} />
            : <EmptyState title="Nobody yet." body="People appear here once they act." />}
        </ChartCard>
      </Grid>

      <Grid aside={<>
        <AsideCard eyebrow="Review" title="Access and money changes" foot={<span className="small">{flaggedN ? `${flaggedN > flagged.length ? `Latest ${flagged.length} of ${flaggedN}` : flaggedN} in the last 7 days: role changes, new or disabled logins, exports and payouts. Check each was expected.` : "No access or money changes in the last 7 days."}</span>}>
          {flagged.length ? (
            <ol className="adm-au__q" aria-label="Latest access and money changes">
              {flagged.map((r) => { const l = changeLines(r.action, r.detail, 1)[0]; return (
                <li key={r.id}>
                  <b>{actionTitle(r.action)}</b>
                  <span>{who(r)} · {stamp(r.at, { year: false })}</span>
                  {l && <span className="adm-au__q1">{l}</span>}
                </li>
              ); })}
            </ol>
          ) : <p className="small" style={{ margin: 0 }}>Nothing to review this week.</p>}
        </AsideCard>
        <AsideCard eyebrow="Filter" title="Narrow the log">
          <form method="get" className="adm-stack">
            <div className="fld"><label htmlFor="f-au-action">Action starts with</label><input id="f-au-action" name="action" defaultValue={action} placeholder="e.g. deal. or dispute." /></div>
            <div className="fld"><label htmlFor="f-au-entity">Record type</label>
              <select id="f-au-entity" name="entity" defaultValue={entity}><option value="">All</option>{entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity}</option>)}</select></div>
            <div className="fld"><label htmlFor="f-au-actor">Done by (email or id)</label><input id="f-au-actor" name="actor" defaultValue={actor} /></div>
            <div className="row" style={{ gap: 8 }}><button className="btn plum">Filter</button>{filtered && <a className="btn sm" href="?">Clear</a>}</div>
          </form>
        </AsideCard>
        <AsideCard eyebrow="What gets logged" title="Kept for every action">
          <p className="small" style={{ margin: 0 }}>Who did it (team, creator, brand or system), the action, the record it touched and what changed. Open “Raw detail” on any entry for the exact stored record. Money records also live in the append-only ledger under Money and ledger.</p>
        </AsideCard>
      </>}>
        <Section id="log" title="Activity" sub={total ? `${total.toLocaleString("en-IN")} ${total === 1 ? "entry" : "entries"}${filtered ? " for this filter" : ""}, newest first.` : undefined}>
          <FilterBar label="Quick filters">
            <FilterChips name="action" label="Filter by area" current={action} hrefFor={quickHref} options={quick.map(([value, label]) => ({ value, label }))} />
          </FilterBar>
          {list.length === 0 ? (
            <EmptyState title={`Nothing logged${filtered ? " for this filter" : " yet"}.`} body={filtered ? "Try a wider filter." : "Sign-ins, decisions and money records appear here as they happen."} action={filtered ? <a className="btn sm" href="?">Clear the filter</a> : null} />
          ) : (
            <Feed label="Audit entries, newest first" items={list.map((r) => item(r))} />
          )}
          <Pager page={page} total={total} keep={keep} hash="log" noun="entries" prev="Newer" next="Older" />
        </Section>
      </Grid>
    </TeamShell>
  );
}
