import TeamShell from "../../_ui/TeamShell";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";

export const metadata = { title: "Audit log", robots: { index: false, follow: false } };

const PAGE = 50;
const when = (t) => (t ? new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }) : "");
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

  return (
    <TeamShell active="audit" eyebrow="Owners and admins" title="Audit <b>log</b>" email={me.email} role={me.role}>
      <p className="lead">Every sign-in, decision and money record, newest first. The log can't be edited from the app.</p>
      <form className="panel filters" method="get" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr)) auto", marginBottom: 16 }}>
        <div className="fld"><label htmlFor="f-au-action">Action starts with</label><input id="f-au-action" name="action" defaultValue={action} placeholder="e.g. deal. or dispute." /></div>
        <div className="fld"><label htmlFor="f-au-entity">Record type</label>
          <select id="f-au-entity" name="entity" defaultValue={entity}><option value="">All</option>{entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity}</option>)}</select></div>
        <div className="fld"><label htmlFor="f-au-actor">Done by (email or id)</label><input id="f-au-actor" name="actor" defaultValue={actor} /></div>
        <button className="btn plum">Filter</button>
      </form>
      {list.length === 0 ? <div className="allclear"><b>Nothing logged{action || entity || actor ? " for this filter" : " yet"}.</b></div> : (
        <div className="panel scroll-x"><table className="tbl">
          <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id}>
              <td className="num hint">{r.id}</td>
              <td className="hint" style={{ whiteSpace: "nowrap" }}>{when(r.at)}</td>
              <td><span className="pill">{r.actor_kind}</span><div className="hint">{r.actor_id || "—"}</div></td>
              <td><code>{r.action}</code></td>
              <td>{r.entity === "deal" && r.entity_id ? <a className="link" href={`/team/deals/${encodeURIComponent(r.entity_id)}`}>deal {String(r.entity_id).slice(0, 8)}</a> : <span className="hint">{r.entity || "—"}{r.entity_id ? ` ${String(r.entity_id).slice(0, 12)}` : ""}</span>}</td>
              <td className="hint" style={{ maxWidth: 360, wordBreak: "break-word" }}>{short(r.detail)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        {before && <a className="btn" href={newest}>Newest</a>}
        {more && <a className="btn" href={older}>Older entries</a>}
      </div>
    </TeamShell>
  );
}
