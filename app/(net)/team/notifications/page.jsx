import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import { sentence } from "@/components/team/labels";
import { PageHeader, KpiStrip, FilterBar, FilterChips, DataTable, Grid, Section, AsideCard, InlineState, Pill, Cell } from "@/components/ui";
import { ShareBar, stamp } from "@/components/admin/Charts";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { audit, can } from "@/lib/net/security";
import { attempt, emailConfig } from "@/lib/net/notify";
import { requireTeam } from "../_guard";

export const metadata = { title: "Notifications", robots: { index: false, follow: false } };

const BACK = "/team/notifications";
const NO_RETRY = new Set(["password_reset", "team_invite"]);
const LABEL = { sent: "Sent", failed: "Failed", not_configured: "Not sent (email not set up)", queued: "Queued", skipped: "Skipped (no address)" };

async function retry(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect(flashUrl(BACK, "err", "Unknown notification."));
  const status = await attempt(id);
  await audit({ kind: "team", id: me.id }, "notification.retry", "notification", String(id), { status });
  redirect(flashUrl(BACK, status === "sent" ? "ok" : "err", status === "sent" ? "Sent." : `Still not sent. Status: ${LABEL[status] || status}. See the error column.`));
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
  const when = stamp;
  const TONE_UI = { sent: "done", failed: "mine", not_configured: "off", queued: "wait", skipped: "quiet" };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const unsent = (counts.failed || 0) + (counts.not_configured || 0) + (counts.queued || 0);
  const rate = total ? Math.round(((counts.sent || 0) / total) * 100) : null;
  return (
    <TeamShell active="notifications" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Team" }, { label: "Notifications" }]}
        eyebrow="Team · Email outbox"
        title="Email <b>outbox</b>"
        sub="Every email Colatch Connect sends or tries to send: deal steps, payouts, invites and resets. Failed ones can be retried from here."
        actions={mayRetry && mail.ready ? <form action={retryAll}><button className="btn plum">Retry unsent (last 7 days)</button></form> : null}
      />
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
      <div className="adm-stack" style={{ marginBottom: 16 }}>
        {mail.ready ? (
          <InlineState kind="info" label="Email is set up.">Messages go out through Resend as things happen.</InlineState>
        ) : (
          <InlineState kind="error" label="Email is not set up, so nothing is being emailed.">Missing in Vercel: {mail.missing.join(", ")}. Every message is still recorded below as "Not sent (email not set up)". Once the keys are added, use "Retry unsent".</InlineState>
        )}
        <InlineState kind="info" label="WhatsApp">WhatsApp messages are not sent yet: an approved WhatsApp Business provider and message templates are needed first.</InlineState>
      </div>

      <KpiStrip label="Delivery status" items={[
        { featured: true, label: "Delivered", value: counts.sent || 0, foot: rate == null ? "nothing sent yet" : `${rate}% of ${total.toLocaleString("en-IN")} messages`, href: `${BACK}?status=sent` },
        { label: "Failed", value: counts.failed || 0, foot: "the provider refused or timed out", href: `${BACK}?status=failed` },
        { label: "Not sent", value: counts.not_configured || 0, foot: mail.ready ? "from before email was set up" : "email not set up", href: `${BACK}?status=not_configured` },
        { label: "Waiting", value: (counts.queued || 0) + (counts.skipped || 0), foot: `${counts.queued || 0} queued · ${counts.skipped || 0} skipped (no address)`, href: `${BACK}?status=queued` },
      ]} />

      <Grid aside={total > 0 ? (
        <AsideCard eyebrow="Insight" title="Where messages end up" foot={unsent ? <span className="small">{unsent} not delivered yet. Invite and reset links can't be retried: make a new link from Team members.</span> : <span className="small">Nothing waiting to be retried.</span>}>
          <ShareBar label="Messages by status" parts={Object.keys(LABEL).map((k) => ({ label: LABEL[k], n: counts[k] || 0, href: `${BACK}?status=${k}` }))} />
        </AsideCard>
      ) : null}>
        <Section title="Messages" sub={`The latest ${rows.length === 200 ? "200" : rows.length} ${rows.length === 1 ? "message" : "messages"}${where ? ` · ${LABEL[status]}` : ""}, newest first.`}>
          <FilterBar label="Filter messages">
            <FilterChips name="status" label="Filter by status" current={where ? status : ""} hrefFor={(v) => (v ? `${BACK}?status=${v}` : BACK)}
              options={[{ value: "", label: "All", count: total }, ...Object.keys(LABEL).map((s) => ({ value: s, label: LABEL[s], count: counts[s] || 0 }))]} />
          </FilterBar>
          <DataTable caption="Email outbox" rows={rows} columns={[
            { key: "msg", label: "Message", render: (n) => <Cell eyebrow={`${when(n.created_at)} · ${n.channel}`} title={sentence(n.template.replace(/_/g, " "))} sub={<span className="adm-dim">{n.to_address || "no address"} · {n.to_kind}</span>} /> },
            { key: "status", label: "Status", primary: true, render: (n) => <span><Pill tone={TONE_UI[n.status] || "quiet"}>{LABEL[n.status] || n.status}</Pill><span className="adm-dim" style={{ display: "block", marginTop: 4 }}>{n.attempts} {Number(n.attempts) === 1 ? "try" : "tries"}{n.sent_at ? ` · sent ${when(n.sent_at)}` : ""}</span></span> },
            { key: "err", label: "Error", render: (n) => (n.last_error ? <span className="adm-dim">{n.last_error}</span> : null) },
            { key: "act", label: "Retry", labelHidden: true, num: true, primary: true, render: (n) => (mayRetry && n.status !== "sent" && n.status !== "skipped" ? (NO_RETRY.has(n.template)
              ? <span className="adm-dim">Make a new link</span>
              : n.status === "not_configured" && !mail.ready ? <span className="adm-dim">Set up email first</span>
              : <form action={retry}><input type="hidden" name="id" value={n.id} /><button className="btn sm">Retry</button></form>) : null) },
          ]} empty={where ? { title: "Nothing with this status.", body: "Try another filter.", action: <a className="btn sm" href={BACK}>See all messages</a> } : { title: "Nothing here yet.", body: "Emails appear here as deals move, payouts are recorded and people are invited." }} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
