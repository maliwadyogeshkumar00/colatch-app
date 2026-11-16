import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { audit, can } from "@/lib/net/security";
import { attempt, emailConfig } from "@/lib/net/notify";
import { requireTeam } from "../_guard";

export const metadata = { title: "Notifications", robots: { index: false, follow: false } };

const BACK = "/team/notifications";
const NO_RETRY = new Set(["password_reset", "team_invite"]);
const TONE = { sent: "ok", failed: "bad", not_configured: "", queued: "", skipped: "" };
const LABEL = { sent: "Sent", failed: "Failed", not_configured: "Not sent: not set up", queued: "Queued", skipped: "Skipped (no address)" };

async function retry(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect(flashUrl(BACK, "err", "Unknown notification."));
  const status = await attempt(id);
  await audit({ kind: "team", id: me.id }, "notification.retry", "notification", String(id), { status });
  redirect(flashUrl(BACK, status === "sent" ? "ok" : "err", status === "sent" ? "Sent." : `Still not sent (${LABEL[status] || status}). See the error column.`));
}

async function retryAll() {
  "use server";
  const me = await requireTeam("team", BACK);
  const rows = (await env.DB.prepare("SELECT id FROM notifications WHERE status IN ('failed','not_configured','queued') AND template NOT IN ('password_reset','team_invite') AND created_at > now() - interval '7 days' ORDER BY id LIMIT 100").all()).results || [];
  let sent = 0;
  for (const r of rows) if ((await attempt(Number(r.id))) === "sent") sent++;
  await audit({ kind: "team", id: me.id }, "notification.retry_all", "notification", null, { tried: rows.length, sent });
  redirect(flashUrl(BACK, sent === rows.length ? "ok" : "err", `Tried ${rows.length}, sent ${sent}.`));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam("view");
  const status = String(searchParams?.status || "");
  const where = ["sent", "failed", "not_configured", "queued", "skipped"].includes(status) ? "WHERE status = ?" : "";
  const q = env.DB.prepare(`SELECT id, channel, to_kind, to_address, template, status, attempts, last_error, created_at, sent_at FROM notifications ${where} ORDER BY id DESC LIMIT 200`);
  const rows = ((where ? await q.bind(status).all() : await q.all()).results) || [];
  const counts = Object.fromEntries((((await env.DB.prepare("SELECT status, COUNT(*) n FROM notifications GROUP BY status").all()).results) || []).map((r) => [r.status, Number(r.n)]));
  const mail = emailConfig();
  const mayRetry = can(me.role, "team");
  const when = (v) => (v ? new Date(v).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "");
  return (
    <TeamShell active="notifications" title="Email <b>outbox</b>" email={me.email} role={me.role}
      actions={mayRetry && mail.ready ? <form action={retryAll}><button className="btn">Retry unsent (last 7 days)</button></form> : null}>
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
      {mail.ready ? (
        <div className="note good" style={{ marginBottom: 14 }}>Email is set up. Messages go out through Resend as things happen.</div>
      ) : (
        <div className="note warn" role="status" style={{ marginBottom: 14 }}>
          <b>Email is not set up, so nothing is being emailed.</b> Missing in Vercel: {mail.missing.join(", ")}. Every message is still recorded below as "Not sent: not set up". Once the keys are added, use "Retry unsent".
        </div>
      )}
      <div className="note" style={{ marginBottom: 14 }}>WhatsApp messages are not sent yet: an approved WhatsApp Business provider and message templates are needed first.</div>
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <a className={`btn sm${!where ? " on" : ""}`} href={BACK}>All</a>
        {Object.keys(LABEL).map((s) => <a key={s} className={`btn sm${status === s ? " on" : ""}`} href={`${BACK}?status=${s}`}>{LABEL[s]} ({counts[s] || 0})</a>)}
      </div>
      <div className="panel" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="pad hint">Nothing here yet.</p> : (
          <table className="tbl">
            <thead><tr><th>When</th><th>Message</th><th>To</th><th>Status</th><th>Error</th><th></th></tr></thead>
            <tbody>{rows.map((n) => (
              <tr key={n.id}>
                <td className="hint">{when(n.created_at)}</td>
                <td>{n.template.replace(/_/g, " ")}<div className="hint">{n.channel}</div></td>
                <td>{n.to_address}<div className="hint">{n.to_kind}</div></td>
                <td><span className={`pill ${TONE[n.status] ?? ""}`}>{LABEL[n.status] || n.status}</span><div className="hint">{n.attempts} {Number(n.attempts) === 1 ? "try" : "tries"}{n.sent_at ? ` · sent ${when(n.sent_at)}` : ""}</div></td>
                <td className="hint" style={{ maxWidth: 280 }}>{n.last_error || ""}</td>
                <td className="num">
                  {mayRetry && n.status !== "sent" && n.status !== "skipped" && (NO_RETRY.has(n.template)
                    ? <span className="hint">Make a new link</span>
                    : <form action={retry}><input type="hidden" name="id" value={n.id} /><button className="btn sm">Retry</button></form>)}
                </td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </TeamShell>
  );
}
