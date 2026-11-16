import TeamShell from "../../_ui/TeamShell";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";

export const metadata = { title: "System health", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Only whether each setting is present is shown. Values are never read into the page.
const CONFIG = [
  ["DATABASE_URL", "Database connection", true, () => !!(process.env.DATABASE_URL || process.env.POSTGRES_URL)],
  ["SITE_URL", "Public site address used in emails", true],
  ["RESEND_API_KEY", "Email sending (Resend)", true],
  ["EMAIL_FROM", "Sender address for emails", true],
  ["TEAM_SETUP_CODE", "Code to create the first team owner", false],
  ["TEAM_ALERTS_EMAIL", "Team inbox for alerts", false],
  ["BLOB_READ_WRITE_TOKEN", "Creator image uploads (Vercel Blob)", false],
  ["ANTHROPIC_API_KEY", "AI brief and matching (Anthropic)", false],
  ["GEMINI_API_KEY", "AI helpers (Gemini)", false],
];
const when = (t) => (t ? new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }) : "");

export default async function Page() {
  const me = await requireTeam("team");
  const q = (sql) => env.DB.prepare(sql).all().then((r) => r.results ?? []).catch(() => null);
  const [errors, settings, outbox] = await Promise.all([
    q("SELECT id, at, source, message, digest FROM app_errors ORDER BY id DESC LIMIT 100"),
    q("SELECT key, value FROM app_settings WHERE key IN ('schema_version','migration_warnings')"),
    q("SELECT status, COUNT(*) AS n FROM notifications GROUP BY status"),
  ]);
  const set = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
  const box = Object.fromEntries((outbox || []).map((o) => [o.status, Number(o.n)]));
  const cfg = CONFIG.map(([k, label, required, test]) => ({ k, label, required, on: test ? test() : !!process.env[k] }));
  const missingRequired = cfg.filter((c) => c.required && !c.on).length;

  return (
    <TeamShell active="system" eyebrow="Owners and admins" title="System <b>health</b>" email={me.email} role={me.role}>
      <p className="lead">What's switched on, what's failing, and what's waiting to be sent. Settings show only whether they're present, never their values.</p>

      <div className="grid4" style={{ marginBottom: 24 }}>
        <div className="panel kpi"><div className="k">Database schema</div><div className="v">{set.schema_version ? `v${set.schema_version}` : "—"}</div><div className="s">{settings === null ? "Couldn't read settings" : set.migration_warnings ? "Has migration warnings" : "No migration warnings"}</div></div>
        <div className="panel kpi"><div className="k">Errors logged</div><div className="v">{errors === null ? "—" : errors.length}</div><div className="s">{errors?.length === 100 ? "showing the latest 100" : "all shown below"}</div></div>
        <div className="panel kpi"><div className="k">Emails waiting</div><div className="v">{(box.queued || 0) + (box.failed || 0)}</div><div className="s">{box.failed || 0} failed · {box.not_configured || 0} not configured</div></div>
        <div className="panel kpi"><div className="k">Settings</div><div className="v">{cfg.filter((c) => c.on).length}/{cfg.length}</div><div className="s">{missingRequired ? `${missingRequired} required missing` : "Required ones present"}</div></div>
      </div>

      {set.migration_warnings && <div className="note" style={{ marginBottom: 24 }}><b>Migration warnings.</b> {set.migration_warnings}. These unique rules were not added because existing rows break them; remove the duplicates by hand, then redeploy.</div>}

      <section className="sheet" aria-labelledby="cfg-h" style={{ marginBottom: 32 }}>
        <div className="sheet__h"><h2 id="cfg-h">Settings</h2></div>
        <div className="panel scroll-x"><table className="tbl">
          <thead><tr><th>Setting</th><th>What it does</th><th>Status</th></tr></thead>
          <tbody>{cfg.map((c) => (
            <tr key={c.k}><td><code>{c.k}</code></td><td>{c.label}{c.required ? "" : <span className="hint"> · optional</span>}</td>
              <td><span className={`pill ${c.on ? "good" : c.required ? "mine" : "low"}`}>{c.on ? "Set" : "Not set"}</span></td></tr>
          ))}</tbody>
        </table></div>
        <p className="hint">The sign-in session secret is generated and stored in the database on first use, so it is not listed here.</p>
      </section>

      <section className="sheet" aria-labelledby="ob-h" style={{ marginBottom: 32 }}>
        <div className="sheet__h"><h2 id="ob-h">Email outbox</h2></div>
        {outbox === null ? <p className="hint">Couldn't read the outbox.</p> : (
          <div className="panel scroll-x"><table className="tbl">
            <thead><tr><th>Status</th><th className="num">Count</th></tr></thead>
            <tbody>{["queued", "sent", "failed", "not_configured", "skipped"].map((s) => (
              <tr key={s}><td>{s.replace("_", " ")}</td><td className="num">{box[s] || 0}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="sheet" aria-labelledby="bk-h" style={{ marginBottom: 32 }}>
        <div className="sheet__h"><h2 id="bk-h">Backups</h2></div>
        <div className="note info">Neon keeps point-in-time history; restore is done in the Neon console — not verified from here.</div>
      </section>

      <section aria-labelledby="err-h">
        <div className="sheet__h"><h2 id="err-h">Recent errors</h2><span className="n">{errors?.length ?? 0}</span></div>
        {errors === null ? <p className="hint">Couldn't read the error log.</p> : errors.length === 0 ? <div className="allclear"><b>No errors logged.</b></div> : (
          <div className="panel scroll-x"><table className="tbl">
            <thead><tr><th>When</th><th>Where</th><th>Message</th><th>Ref</th></tr></thead>
            <tbody>{errors.map((e) => (
              <tr key={e.id}>
                <td className="hint" style={{ whiteSpace: "nowrap" }}>{when(e.at)}</td>
                <td><code>{e.source}</code></td>
                <td style={{ maxWidth: 420, wordBreak: "break-word" }}>{String(e.message || "").slice(0, 300)}</td>
                <td className="hint">{e.digest || e.id}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </TeamShell>
  );
}
