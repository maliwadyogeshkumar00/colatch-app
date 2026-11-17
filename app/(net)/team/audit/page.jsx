import TeamShell from "../../_ui/TeamShell";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { PageHeader, KpiStrip, FilterBar, FilterChips, Grid, Section, AsideCard, EmptyState, Pill } from "@/components/ui";
import { Feed, stamp } from "@/components/admin/Charts";

export const metadata = { title: "Audit log", robots: { index: false, follow: false } };

const PAGE = 50;
const when = (t) => stamp(t, { seconds: true });
const clean = (s, n = 80) => String(s ?? "").trim().slice(0, n);
const short = (d) => { if (!d) return ""; const s = typeof d === "string" ? d : JSON.stringify(d); return s.length > 160 ? s.slice(0, 157) + "…" : s; };

export default async function Page({ searchParams }) {
  // Owners and admins only: the log names every person and every action.
  const me = await requireTeam("team");
  const action = clean(searchParams?.action), entity = clean(searchParams?.entity), actor = clean(searchParams?.actor, 190);
  const before = /^\d{1,18}$/.test(String(searchParams?.before || "")) ? String(searchParams.before) : "";
  const where = [], vals = [];
  if (action) { where.push("action LIKE ?"); vals.push(action.replace(/[%_\\]/g, "\\$&") + "%"); }
  if (entity) { where.push("entity = ?"); vals.push(entity); }
  if (actor) { where.push("actor_id = ?"); vals.push(actor); }
  if (before) { where.push("id < ?"); vals.push(before); }
  // One extra row tells us whether an older page exists.
  const rows = (await env.DB.prepare(
    `SELECT id, at, actor_kind, actor_id, action, entity, entity_id, detail FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ${PAGE + 1}`
  ).bind(...vals).all().catch(() => ({ results: [] }))).results ?? [];
  const more = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const entities = (await env.DB.prepare("SELECT DISTINCT entity FROM audit_log WHERE entity IS NOT NULL ORDER BY entity LIMIT 50").all().catch(() => ({ results: [] }))).results ?? [];
  const keep = { ...(action ? { action } : {}), ...(entity ? { entity } : {}), ...(actor ? { actor } : {}) };
  const older = more ? "?" + new URLSearchParams({ ...keep, before: String(list[list.length - 1].id) }).toString() : "";
  const newest = "?" + new URLSearchParams(keep).toString();

  // Read-only activity counts for the strip (unfiltered): last 24 hours, 7 days, people, sign-ins, and a 14-day line.
  const k = (await env.DB.prepare(`SELECT
      COUNT(*) FILTER (WHERE at > now() - interval '24 hours') AS day_n,
      COUNT(*) FILTER (WHERE at > now() - interval '7 days') AS week_n,
      COUNT(DISTINCT actor_id) FILTER (WHERE at > now() - interval '7 days') AS people_n,
      COUNT(*) FILTER (WHERE at > now() - interval '7 days' AND action LIKE '%.login') AS logins_n,
      COUNT(*) FILTER (WHERE at > now() - interval '7 days' AND (action LIKE 'finance.%' OR action LIKE 'referral_earning.%' OR action LIKE '%payout%' OR action LIKE '%funding%')) AS money_n
    FROM audit_log WHERE at > now() - interval '7 days'`).first().catch(() => null)) || {};
  const daily = (await env.DB.prepare(`SELECT to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM audit_log WHERE at > now() - interval '14 days' GROUP BY 1`).all().catch(() => ({ results: [] }))).results ?? [];
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + 5.5 * 36e5 - (13 - i) * 864e5).toISOString().slice(0, 10));
  const spark = days.map((d) => Number(daily.find((r) => r.d === d)?.n || 0));
  const filtered = Boolean(action || entity || actor);
  const quick = [["", "Everything"], ["team.", "Team and logins"], ["deal.", "Deals"], ["finance.", "Money"], ["webhook.", "Webhooks"], ["creator.", "Creators"]];
  const quickHref = (a) => "?" + new URLSearchParams({ ...(a ? { action: a } : {}), ...(entity ? { entity } : {}), ...(actor ? { actor } : {}) }).toString();
  const record = (r) => (r.entity === "deal" && r.entity_id ? <a className="link" href={`/team/deals/${encodeURIComponent(r.entity_id)}`}>deal {String(r.entity_id).slice(0, 8)}</a> : <span>{r.entity || "—"}{r.entity_id ? ` ${String(r.entity_id).slice(0, 12)}` : ""}</span>);

  return (
    <TeamShell active="audit" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Owners and admins" }, { label: "Audit log" }]}
        eyebrow="Owners and admins"
        title="Audit <b>log</b>"
        sub="Every sign-in, decision and money record, newest first. The log can't be edited from the app."
      />

      <KpiStrip label="Activity" items={[
        { label: "Last 24 hours", value: Number(k.day_n || 0), foot: "entries logged" },
        { featured: true, label: "Last 7 days", value: Number(k.week_n || 0), foot: "per day, last 14 days", spark, sparkLabel: "Audit entries per day, last 14 days" },
        { label: "People and systems", value: Number(k.people_n || 0), foot: `acted in 7 days · ${Number(k.logins_n || 0)} sign-ins`, href: "?action=team." },
        { label: "Money actions", value: Number(k.money_n || 0), foot: "exports, payouts and funding in 7 days", href: "?action=finance." },
      ]} />

      <Grid aside={<>
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
          <p className="small" style={{ margin: 0 }}>Who did it (team, creator, brand or system), the action, the record it touched and a short detail. Money records also live in the append-only ledger under Money and ledger.</p>
        </AsideCard>
      </>}>
        <Section title="Activity" sub={list.length ? `${list.length}${more ? "+" : ""} ${list.length === 1 ? "entry" : "entries"}${filtered ? " for this filter" : ""}${before ? ", older page" : ""}, newest first.` : undefined}>
          <FilterBar label="Quick filters">
            <FilterChips name="action" label="Filter by area" current={action} hrefFor={quickHref} options={quick.map(([value, label]) => ({ value, label }))} />
          </FilterBar>
          {list.length === 0 ? (
            <EmptyState title={`Nothing logged${filtered ? " for this filter" : " yet"}.`} body={filtered ? "Try a wider filter." : "Sign-ins, decisions and money records appear here as they happen."} action={filtered ? <a className="btn sm" href="?">Clear the filter</a> : null} />
          ) : (
            <Feed label="Audit entries, newest first" items={list.map((r) => ({
              key: r.id,
              when: <>{when(r.at)} <span className="adm-dim">· #{r.id}</span></>,
              title: <><code>{r.action}</code> <span className="adm-dim">by</span> {r.actor_id || "—"}</>,
              sub: <>{record(r)}{r.detail ? <span className="adm-mono" style={{ display: "block", marginTop: 2 }}>{short(r.detail)}</span> : null}</>,
              meta: <Pill tone={r.actor_kind === "team" ? "plum" : r.actor_kind === "system" ? "quiet" : "wait"}>{r.actor_kind}</Pill>,
            }))} />
          )}
          <div className="row" style={{ marginTop: 16, gap: 8 }}>
            {before && <a className="btn" href={newest}>Newest</a>}
            {more && <a className="btn" href={older}>Older entries</a>}
          </div>
        </Section>
      </Grid>
    </TeamShell>
  );
}
