import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import { sentence } from "@/components/team/labels";
import { PageHeader, KpiStrip, ChartCard, FilterBar, FilterChips, DataTable, Grid, Section, AsideCard, InlineState, EmptyState, Pill, Cell } from "@/components/ui";
import { ShareBar, DualBars, HBars, stamp } from "@/components/admin/Charts";
import Pager, { PER_PAGE, pageOf } from "@/components/admin/Pager";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { audit, can } from "@/lib/net/security";
import { attempt, emailConfig } from "@/lib/net/notify";
import { requireTeam } from "../_guard";

export const metadata = { title: "Notifications", robots: { index: false, follow: false } };

const BACK = "/team/notifications";
const NO_RETRY = new Set(["password_reset", "team_invite"]);
const LABEL = { sent: "Sent", failed: "Failed", not_configured: "Not sent (email not set up)", queued: "Queued", skipped: "Skipped (no address)" };
// Short pill words for the table rows; the filter chips and the banner keep the long labels.
const SHORT = { sent: "Sent", failed: "Failed", not_configured: "Not sent", queued: "Queued", skipped: "Skipped" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  const many = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results ?? [];
  const status = String(searchParams?.status || "");
  const where = ["sent", "failed", "not_configured", "queued", "skipped"].includes(status) ? "WHERE status = ?" : "";
  const counts = Object.fromEntries((((await env.DB.prepare("SELECT status, COUNT(*) n FROM notifications GROUP BY status").all()).results) || []).map((r) => [r.status, Number(r.n)]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // 25 per page, newest first; the status filter is kept on every page link.
  const matching = where ? counts[status] || 0 : total;
  const pages = Math.max(1, Math.ceil(matching / PER_PAGE));
  const page = Math.min(pageOf(searchParams), pages);
  const q = env.DB.prepare(`SELECT id, channel, to_kind, to_address, template, status, attempts, last_error, created_at, sent_at FROM notifications ${where} ORDER BY id DESC LIMIT ${PER_PAGE} OFFSET ${(page - 1) * PER_PAGE}`);
  const rows = ((where ? await q.bind(status).all() : await q.all()).results) || [];
  const mail = emailConfig();
  const mayRetry = can(me.role, "team");
  const when = stamp;
  const TONE_UI = { sent: "done", failed: "mine", not_configured: "off", queued: "wait", skipped: "quiet" };
  const unsent = (counts.failed || 0) + (counts.not_configured || 0) + (counts.queued || 0);
  const rate = total ? Math.round(((counts.sent || 0) / total) * 100) : null;

  // Read-only charts: delivered vs not delivered per IST day (14 days), and messages by template.
  const daily = await many(`SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d, SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN status IN ('failed','not_configured','queued') THEN 1 ELSE 0 END) AS bad
    FROM notifications WHERE created_at > now() - interval '14 days' GROUP BY 1`);
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + 5.5 * 36e5 - (13 - i) * 864e5).toISOString().slice(0, 10));
  const series = days.map((d) => { const r = daily.find((x) => x.d === d) || {}; return { key: d, label: String(Number(d.slice(8))), year: MON[Number(d.slice(5, 7)) - 1], a: Number(r.ok || 0), b: Number(r.bad || 0) }; });
  const recent = series.reduce((s, m) => s + m.a + m.b, 0);
  const byTpl = (await many(`SELECT template, SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN status IN ('failed','not_configured','queued') THEN 1 ELSE 0 END) AS bad, COUNT(*) AS n
    FROM notifications GROUP BY template ORDER BY COUNT(*) DESC LIMIT 6`));
  // The not-set-up error is the same on every row; it is said once in the banner, not repeated per row.
  const sameErr = (n) => n.status === "not_configured" || /not set up|missing RESEND|EMAIL_FROM/i.test(String(n.last_error || ""));

  return (
    <TeamShell active="notifications" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Team" }, { label: "Notifications" }]}
        eyebrow="Team · Email outbox"
        title="Email <b>outbox</b>"
        sub="Every email Colatch Connect sends or tries to send: deal steps, payouts, invites and resets. Failed ones can be retried from here."
        actions={mayRetry && mail.ready ? <form action={retryAll}><button className="btn plum">Retry unsent (last 7 days)</button></form> : null}
        meta={[{ label: "Delivered", value: rate == null ? "—" : `${rate}%`, gold: rate != null && rate >= 90 }, { label: "Not delivered", value: unsent.toLocaleString("en-IN") }]}
      />
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
      <div className="adm-stack" style={{ marginBottom: 16 }}>
        {mail.ready ? (
          <InlineState kind="info" label="Email is set up.">Messages go out through Resend as things happen.</InlineState>
        ) : (
          <InlineState kind="error" label="Email is not set up, so nothing is being emailed.">Missing in Vercel: {mail.missing.join(", ")}. {(counts.not_configured || 0).toLocaleString("en-IN")} messages are recorded below as "Not sent" with this reason; it isn't repeated on each row. Once the keys are added, use "Retry unsent".</InlineState>
        )}
      </div>

      <KpiStrip label="Delivery status" items={[
        { featured: true, label: "Delivered", value: counts.sent || 0, foot: rate == null ? "nothing sent yet" : `${rate}% of ${total.toLocaleString("en-IN")} messages`, href: `${BACK}?status=sent` },
        { label: "Failed", value: counts.failed || 0, foot: "the provider refused or timed out", href: `${BACK}?status=failed` },
        { label: "Not sent", value: counts.not_configured || 0, foot: mail.ready ? "from before email was set up" : "email not set up", href: `${BACK}?status=not_configured` },
        { label: "Waiting", value: (counts.queued || 0) + (counts.skipped || 0), foot: `${counts.queued || 0} queued · ${counts.skipped || 0} skipped (no address)`, href: `${BACK}?status=queued` },
      ]} />

      {total > 0 && (
        <Grid cols={2}>
          <ChartCard level={2} title="Delivered and not, per day" period="Last 14 days" figure={recent.toLocaleString("en-IN")} figureTitle="Messages in the last 14 days" foot="By the day each message was created, Indian time. Not delivered: failed, not sent or still queued.">
            <DualBars months={series} aLabel="Delivered" bLabel="Not delivered" label="Messages per day, last 14 days" />
          </ChartCard>
          <ChartCard level={2} title="By message type" period="All time" foot="The six most frequent templates. Both bars share one scale.">
            {byTpl.length ? <HBars label="Messages by template" aLabel="Not delivered" bLabel="Delivered" rows={byTpl.map((t) => ({ label: sentence(String(t.template).replace(/_/g, " ")), a: Number(t.bad), b: Number(t.ok) }))} />
              : <EmptyState title="No messages yet." body="Templates show up once messages are recorded." />}
          </ChartCard>
        </Grid>
      )}

      <Grid aside={<>
        {total > 0 && (
          <AsideCard eyebrow="Insight" title="Where messages end up" foot={<span className="small">{unsent ? `${unsent.toLocaleString("en-IN")} not delivered yet. Invite and reset links can't be retried: make a new link from Team members.` : "Nothing waiting to be retried."}</span>}>
            <ShareBar label="Messages by status" parts={Object.keys(LABEL).map((k) => ({ label: LABEL[k], n: counts[k] || 0, href: `${BACK}?status=${k}` }))} />
          </AsideCard>
        )}
        <AsideCard eyebrow="Channels" title="WhatsApp">
          <p className="small" style={{ margin: 0 }}>WhatsApp messages are not sent yet: an approved WhatsApp Business provider and message templates are needed first.</p>
        </AsideCard>
      </>}>
        <Section id="messages" title="Messages" sub={`${matching.toLocaleString("en-IN")} ${matching === 1 ? "message" : "messages"}${where ? ` · ${LABEL[status]}` : ""}, newest first.`}>
          <FilterBar label="Filter messages">
            <FilterChips name="status" label="Filter by status" current={where ? status : ""} hrefFor={(v) => (v ? `${BACK}?status=${v}` : BACK)}
              options={[{ value: "", label: "All", count: total }, ...Object.keys(LABEL).map((s) => ({ value: s, label: LABEL[s], count: counts[s] || 0 }))]} />
          </FilterBar>
          <DataTable caption="Email outbox" rows={rows} columns={[
            { key: "msg", label: "Message", render: (n) => <Cell title={sentence(n.template.replace(/_/g, " "))} sub={<span className="adm-dim">{n.to_address || "no address"} · {n.to_kind} · {n.channel}</span>} /> },
            { key: "at", label: "Created", render: (n) => <span className="adm-dim adm-nowrap">{when(n.created_at)}</span> },
            { key: "status", label: "Status", primary: true, render: (n) => (
              <span className="adm-nstat adm-nstat--row">
                <Pill tone={TONE_UI[n.status] || "quiet"} title={LABEL[n.status] || n.status}>{SHORT[n.status] || n.status}</Pill>
                <span className="adm-dim">{n.attempts} {Number(n.attempts) === 1 ? "try" : "tries"}{n.sent_at ? ` · sent ${when(n.sent_at, { year: false })}` : ""}</span>
                {n.last_error && !sameErr(n) && <span className="adm-nstat__err">{n.last_error}</span>}
              </span>
            ) },
            { key: "act", label: "Retry", labelHidden: true, num: true, primary: true, render: (n) => (mayRetry && n.status !== "sent" && n.status !== "skipped" ? (NO_RETRY.has(n.template)
              ? <span className="adm-dim">Make a new link</span>
              : n.status === "not_configured" && !mail.ready ? ""
              : <form action={retry}><input type="hidden" name="id" value={n.id} /><button className="btn sm">Retry</button></form>) : "") },
          ]} empty={where ? { title: "Nothing with this status.", body: "Try another filter.", action: <a className="btn sm" href={BACK}>See all messages</a> } : { title: "Nothing here yet.", body: "Emails appear here as deals move, payouts are recorded and people are invited." }} />
          <Pager page={page} total={matching} keep={where ? { status } : {}} hash="messages" noun="messages" prev="Newer" next="Older" />
        </Section>
      </Grid>
    </TeamShell>
  );
}
