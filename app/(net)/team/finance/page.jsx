import TeamShell from "../../_ui/TeamShell";
import Flash from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { can } from "@/lib/net/security";
import { formatPaise } from "@/lib/net/dealflow";
import { reconcile, KIND_LABEL } from "./reconcile";
import { inrKpi, inrFull } from "@/components/team/labels";

export const metadata = { title: "Money and ledger", robots: { index: false, follow: false } };

const when = (t) => (t ? new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const tail = (u) => (u ? "…" + String(u).slice(-4) : "—");
const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : "");

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  // Money records are for finance roles only; everyone else gets an explanation, not the data.
  if (!can(me.role, "finance")) {
    return (
      <TeamShell active="finance" eyebrow="Money" title="Money and <b>ledger</b>" email={me.email} role={me.role}>
        <div className="allclear"><b>This page is for finance roles.</b> Your role ({me.role}) can't see payment records. Ask an owner or admin if you need access.</div>
      </TeamShell>
    );
  }
  const kind = KIND_LABEL[searchParams?.kind] ? String(searchParams.kind) : "";
  const from = day(searchParams?.from), to = day(searchParams?.to);
  const where = [], vals = [];
  if (kind) { where.push("l.kind = ?"); vals.push(kind); }
  if (from) { where.push("l.at >= ?::date"); vals.push(from); }
  if (to) { where.push("l.at < (?::date + 1)"); vals.push(to); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const rows = (await env.DB.prepare(
    `SELECT l.*, d.brand, c.name AS creator_name, c.handle FROM finance_ledger l
     LEFT JOIN creator_deals d ON d.id = l.deal_id LEFT JOIN creators c ON c.id = d.creator_id
     ${w} ORDER BY l.id DESC LIMIT 300`
  ).bind(...vals).all().catch(() => ({ results: [] }))).results ?? [];
  const totals = (await env.DB.prepare(`SELECT l.kind, COUNT(*) AS n, COALESCE(SUM(l.amount_paise),0) AS paise, COALESCE(SUM(l.tds_paise),0) AS tds FROM finance_ledger l ${w} GROUP BY l.kind`).bind(...vals).all().catch(() => ({ results: [] }))).results ?? [];
  const tot = Object.fromEntries(totals.map((t) => [t.kind, t]));
  const checks = await reconcile();
  const issues = checks.reduce((a, c) => a + c.rows.length, 0);
  const qs = new URLSearchParams({ ...(kind ? { kind } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();

  return (
    <TeamShell active="finance" eyebrow="Money" title="Money and <b>ledger</b>" email={me.email} role={me.role}
      actions={<a className="btn" href={`/team/finance/export${qs ? "?" + qs : ""}`}>Download CSV</a>}>
      <p className="lead">Every rupee recorded by a finance member, newest first. Rows can't be edited or deleted; a mistake is corrected with a new adjustment row. Nothing here moves money.</p>
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>

      <section className="sheet" aria-labelledby="rec-h" style={{ marginBottom: 32 }}>
        <div className="sheet__h"><h2 id="rec-h">Reconciliation</h2><span className="n">{issues ? `${issues} to check` : "All clear"}</span></div>
        {checks.map((c) => (
          <details key={c.key} className="box" open={c.rows.length > 0 && c.rows.length < 6}>
            <summary><span className={`pill ${c.rows.length ? "mine" : "good"}`} style={{ marginRight: 10 }}>{c.rows.length ? `${c.rows.length} to check` : "OK"}</span>{c.title}</summary>
            <div className="inner">
              <p className="hint" style={{ marginTop: 0 }}>{c.help}</p>
              {c.rows.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{c.rows.map((r, i) => (
                <li key={r.id + ":" + i}><a className="link" href={`/team/deals/${encodeURIComponent(r.id)}`}>{r.brand || r.id}</a>{r.fee ? ` · fee ₹${Number(r.fee).toLocaleString("en-IN")}` : ""}{r.pay_status ? ` · ${r.pay_status}` : ""}{r.utr ? ` · UTR ${tail(r.utr)}` : ""}</li>
              ))}</ul>}
            </div>
          </details>
        ))}
        <p className="hint" style={{ margin: 0 }}>Deals recorded before the ledger was switched on can appear above; add a note in the deal room explaining them.</p>
      </section>

      <div className="grid4" style={{ marginBottom: 24 }}>
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <div key={k} className="panel kpi"><div className="k">{label}</div><div className="v" title={inrFull(Number(tot[k]?.paise || 0) / 100)}>{inrKpi(Number(tot[k]?.paise || 0) / 100)}</div><div className="s">{tot[k]?.n || 0} {Number(tot[k]?.n) === 1 ? "entry" : "entries"}{Number(tot[k]?.tds) ? ` · TDS ${formatPaise(Number(tot[k].tds))}` : ""}</div></div>
        ))}
      </div>

      <form className="panel filters" method="get" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr)) auto", marginBottom: 16 }}>
        <div className="fld"><label htmlFor="f-fin-kind">Type</label>
          <select id="f-fin-kind" name="kind" defaultValue={kind}><option value="">All</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="f-fin-from">From</label><input id="f-fin-from" name="from" type="date" defaultValue={from} /></div>
        <div className="fld"><label htmlFor="f-fin-to">To</label><input id="f-fin-to" name="to" type="date" defaultValue={to} /></div>
        <button className="btn plum">Filter</button>
      </form>

      {rows.length === 0 ? <div className="allclear"><b>No money recorded{kind || from || to ? " for this filter" : " yet"}.</b> Rows appear when finance records a brand payment or a payout in a deal room.</div> : (
        <div className="panel scroll-x"><table className="tbl stack">
          <thead><tr><th>When</th><th>Type</th><th>Deal</th><th className="num">Amount</th><th className="num">TDS</th><th>Reference</th><th>Recorded by</th></tr></thead>
          <tbody>{rows.map((l) => (
            <tr key={l.id}>
              <td className="hint" style={{ whiteSpace: "nowrap" }}>{when(l.at)}</td>
              <td data-label="Type">{KIND_LABEL[l.kind] || l.kind}</td>
              <td data-label="Deal">{l.deal_id ? <a className="link" href={`/team/deals/${encodeURIComponent(l.deal_id)}`}>{l.creator_name || l.handle || "Deal"}{l.brand ? ` × ${l.brand}` : ""}</a> : <span className="hint">—</span>}</td>
              <td data-label="Amount" className="num key">{l.kind === "brand_refund_sent" ? "− " : ""}{formatPaise(Number(l.amount_paise))}</td>
              <td data-label="TDS" className="num">{Number(l.tds_paise) ? formatPaise(Number(l.tds_paise)) : "—"}</td>
              <td data-label="Reference" className="num">{tail(l.utr)}{l.method ? <div className="hint">{l.method.replace(/_/g, " ")}</div> : null}</td>
              <td data-label="Recorded by" className="hint">{l.actor_id}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </TeamShell>
  );
}
