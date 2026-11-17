import TeamShell from "../../_ui/TeamShell";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { JOB_NAMES, JOB_LABEL } from "@/lib/net/jobs";
import { PageHeader, DataTable, Grid, Section, AsideCard, InlineState, Pill, Cell } from "@/components/ui";
import { Tiles, ShareBar, stamp } from "@/components/admin/Charts";

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
  ["CRON_SECRET", "Scheduled jobs (Vercel Cron sends it; jobs are off without it)", false],
];
const when = (t) => stamp(t, { seconds: true, year: false });

export default async function Page() {
  const me = await requireTeam("team");
  const q = (sql) => env.DB.prepare(sql).all().then((r) => r.results ?? []).catch(() => null);
  const [errors, settings, outbox, runs, hookRows, stuck] = await Promise.all([
    q("SELECT id, at, source, message, digest FROM app_errors ORDER BY id DESC LIMIT 100"),
    q("SELECT key, value FROM app_settings WHERE key IN ('schema_version','migration_warnings')"),
    q("SELECT status, COUNT(*) AS n FROM notifications GROUP BY status"),
    q("SELECT job, last_run_at, last_result FROM cron_runs"),
    q("SELECT status, COUNT(*) AS n FROM webhook_deliveries GROUP BY status"),
    q("SELECT d.id, d.event, d.status, d.attempts, d.last_error, d.created_at, w.url FROM webhook_deliveries d LEFT JOIN webhooks w ON w.id=d.webhook_id WHERE d.status IN ('pending','failed') ORDER BY d.created_at DESC LIMIT 20"),
  ]);
  const runBy = Object.fromEntries((runs || []).map((r) => [r.job, r]));
  const hooks = Object.fromEntries((hookRows || []).map((r) => [r.status, Number(r.n)]));
  // Hourly schedule: a job not seen for 26 hours means cron isn't calling (or CRON_SECRET is missing). Daily plans allow 26h.
  const stale = (t) => !t || Date.now() - new Date(t).getTime() > 26 * 36e5;
  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return "deleted webhook"; } };
  const set = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
  const box = Object.fromEntries((outbox || []).map((o) => [o.status, Number(o.n)]));
  const cfg = CONFIG.map(([k, label, required, test]) => ({ k, label, required, on: test ? test() : !!process.env[k] }));
  const missingRequired = cfg.filter((c) => c.required && !c.on).length;

  const unsent = (box.queued || 0) + (box.failed || 0) + (box.not_configured || 0);
  const jobBad = JOB_NAMES.filter((j) => stale(runBy[j]?.last_run_at) || String(runBy[j]?.last_result || "").startsWith("error")).length;
  const errDay = (errors || []).filter((e) => Date.now() - new Date(e.at).getTime() < 864e5).length;
  const tiles = [
    { label: "Database schema", value: set.schema_version ? `v${set.schema_version}` : "—", state: settings === null ? "off" : set.migration_warnings ? "warn" : "ok", stateText: settings === null ? "Can't read" : set.migration_warnings ? "Warnings" : "Up to date", note: settings === null ? "Couldn't read settings" : set.migration_warnings ? "Has migration warnings" : "No migration warnings" },
    { label: "Scheduled jobs", value: `${JOB_NAMES.length - jobBad}/${JOB_NAMES.length}`, state: runs === null ? "off" : jobBad ? "warn" : "ok", stateText: runs === null ? "Can't read" : jobBad ? `${jobBad} to check` : "On time", note: runs === null ? "Couldn't read the job history" : "ran in the last day without an error", href: "#jobs" },
    { label: "Webhook deliveries", value: hookRows === null ? "—" : (hooks.delivered || 0).toLocaleString("en-IN"), state: hookRows === null ? "off" : hooks.failed ? "warn" : "ok", stateText: hookRows === null ? "Can't read" : hooks.failed ? `${hooks.failed} failed` : hooks.pending ? `${hooks.pending} retrying` : "Clear", note: `delivered · ${hooks.pending || 0} waiting to retry · ${hooks.failed || 0} failed`, href: "#wh" },
    { label: "Emails not sent", value: outbox === null ? "—" : unsent, state: outbox === null ? "off" : unsent ? "warn" : "ok", stateText: outbox === null ? "Can't read" : unsent ? "Waiting" : "Clear", note: `${box.queued || 0} queued · ${box.failed || 0} failed · ${box.not_configured || 0} email not set up`, href: "/team/notifications" },
    { label: "Errors logged", value: errors === null ? "—" : errors.length, state: errors === null ? "off" : errDay ? "warn" : "ok", stateText: errors === null ? "Can't read" : errDay ? `${errDay} today` : "Quiet today", note: errors?.length === 100 ? "showing the latest 100" : "all shown below", href: "#err" },
    { label: "Settings", value: `${cfg.filter((c) => c.on).length}/${cfg.length}`, state: missingRequired ? "warn" : "ok", stateText: missingRequired ? `${missingRequired} required missing` : "Required set", note: "settings present in Vercel", href: "#cfg" },
  ];
  const attention = tiles.filter((t) => t.state !== "ok").length;

  return (
    <TeamShell active="system" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Owners and admins" }, { label: "System health" }]}
        eyebrow="Owners and admins"
        title="System <b>health</b>"
        sub="What's switched on, what's failing, and what's waiting to be sent. Settings show only whether they're present, never their values."
        meta={[{ label: "Need a look", value: attention, gold: attention > 0 }, { label: "Checks", value: tiles.length }]}
      />
      <Tiles label="System checks" items={tiles} />
      {set.migration_warnings && <div style={{ marginBottom: 24 }}><InlineState kind="error" label="Migration warnings.">{set.migration_warnings}. These unique rules were not added because existing rows break them; remove the duplicates by hand, then redeploy.</InlineState></div>}

      <Grid aside={<>
        <AsideCard eyebrow="Email" title="Outbox by status" foot={<a href="/team/notifications">Open the outbox</a>}>
          {outbox === null ? <p className="small" style={{ margin: 0 }}>Couldn't read the outbox.</p> : (
            <ShareBar label="Emails by status" parts={["sent", "queued", "failed", "not_configured", "skipped"].map((st) => ({ label: st.replace("_", " ").replace(/^./, (c) => c.toUpperCase()), n: box[st] || 0 }))} />
          )}
        </AsideCard>
        <AsideCard eyebrow="Backups" title="Point-in-time history">
          <p className="small" style={{ margin: 0 }}>Neon keeps point-in-time history; restore is done in the Neon console — not verified from here.</p>
        </AsideCard>
      </>}>
        <Section id="jobs" title="Scheduled jobs" sub="Runs from Vercel Cron (vercel.json). A gold edge means the job failed last time or hasn't run in over a day.">
          {runs === null ? <InlineState kind="error" label="Couldn't read the job history.">The database may still be updating.</InlineState> : (
            <Tiles label="Scheduled jobs" cols={2} compact items={JOB_NAMES.map((j) => {
              const r = runBy[j];
              const failed = String(r?.last_result || "").startsWith("error");
              const late = stale(r?.last_run_at);
              return { key: j, label: JOB_LABEL[j], value: r ? when(r.last_run_at) : "Never run", state: failed || late ? "warn" : "ok", stateText: failed ? "Failed" : !r ? "Not run" : late ? "Late" : "On time",
                note: r ? r.last_result : process.env.CRON_SECRET ? "Waiting for the first cron call." : "CRON_SECRET is not set, so cron calls are refused." };
            })} />
          )}
        </Section>

        <Section id="wh" title="Webhook deliveries" sub={hookRows === null ? undefined : `${hooks.delivered || 0} delivered · ${hooks.pending || 0} waiting to retry · ${hooks.failed || 0} failed`} actions={<a className="btn sm" href="/team/integrations">Integrations</a>}>
          {hookRows === null ? <InlineState kind="error" label="Couldn't read webhook deliveries." /> : (
            <DataTable caption="Webhook deliveries waiting or failed" rows={stuck || []} columns={[
              { key: "event", label: "Event", render: (d) => <Cell eyebrow={when(d.created_at)} title={<code className="adm-mono">{d.event}</code>} sub={hostOf(d.url)} /> },
              { key: "status", label: "Status", primary: true, render: (d) => <span><Pill tone={d.status === "pending" ? "wait" : "mine"}>{d.status === "pending" ? "Retrying" : "Failed"}</Pill><span className="adm-dim" style={{ display: "block", marginTop: 4 }}>{d.attempts} attempts</span></span> },
              { key: "err", label: "Last error", render: (d) => <span className="adm-dim">{d.last_error || "—"}</span> },
            ]} empty={{ title: "No deliveries waiting or failed.", body: "Every webhook event so far was delivered." }} />
          )}
        </Section>

        <Section id="cfg" title="Settings" sub="The sign-in session secret is generated and stored in the database on first use, so it is not listed here.">
          <DataTable caption="Settings" rows={cfg} rowKey={(c) => c.k} columns={[
            { key: "k", label: "Setting", render: (c) => <Cell title={<code className="adm-mono">{c.k}</code>} sub={<>{c.label}{c.required ? "" : " · optional"}</>} /> },
            { key: "on", label: "Status", primary: true, num: true, render: (c) => <Pill tone={c.on ? "done" : c.required ? "mine" : "off"}>{c.on ? "Set" : "Not set"}</Pill> },
          ]} />
        </Section>

        <Section id="err" title="Recent errors" sub={errors === null ? undefined : `${errors.length} logged`}>
          {errors === null ? <InlineState kind="error" label="Couldn't read the error log." /> : (
            <DataTable caption="Recent errors" rows={errors} columns={[
              { key: "msg", label: "Message", render: (e) => <Cell eyebrow={when(e.at)} title={<code className="adm-mono">{e.source}</code>} sub={String(e.message || "").slice(0, 300)} /> },
              { key: "ref", label: "Ref", num: true, render: (e) => <span className="adm-dim">{e.digest || e.id}</span> },
            ]} empty={{ title: "No errors logged.", body: "Server errors show up here with a reference people can quote." }} />
          )}
        </Section>
      </Grid>
    </TeamShell>
  );
}
