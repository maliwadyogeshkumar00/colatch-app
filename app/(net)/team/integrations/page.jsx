import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { dayTime } from "@/components/team/labels";
import { env } from "@/lib/net/env";
import { audit, logError } from "@/lib/net/security";
import { EVENTS, EVENT_LABEL, MAX_ATTEMPTS, checkUrl, newSecret, parseEvents, sendTest } from "@/lib/net/webhooks";
import { requireTeam } from "../_guard";

export const metadata = { title: "Integrations", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const BACK = "/team/integrations";
const SECRET_COOKIE = "wh_secret";
const go = (key, msg) => redirect(flashUrl(BACK, key, msg));

async function createHook(fd) {
  "use server";
  // Checked inside the action too: Server Actions can be called without loading the page.
  const me = await requireTeam("team", BACK);
  const events = parseEvents(fd.getAll("events").join(","));
  if (!events.length) go("err", "Pick at least one event to send.");
  let url;
  try { url = await checkUrl(fd.get("url")); } catch (e) { go("err", e instanceof Error ? e.message : "That address can't be used."); }
  const n = Number((await env.DB.prepare("SELECT COUNT(*) n FROM webhooks").first())?.n || 0);
  if (n >= 20) go("err", "20 webhooks is the limit. Delete one you no longer use.");
  const id = "wh_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const secret = newSecret();
  await env.DB.prepare("INSERT INTO webhooks (id, url, secret, events, created_by) VALUES (?,?,?,?,?)").bind(id, url, secret, events.join(","), me.email).run();
  await audit({ kind: "team", id: me.id }, "webhook.created", "webhook", id, { host: new URL(url).hostname, events });
  // The signing secret is shown once, from a short-lived cookie only this browser can read, then never again.
  cookies().set(SECRET_COOKIE, JSON.stringify({ id, secret }), { httpOnly: true, secure: true, sameSite: "strict", path: BACK, maxAge: 600 });
  go("ok", "Webhook added. Copy the signing secret now: it won't be shown again.");
}

async function dismissSecret() {
  "use server";
  await requireTeam("team", BACK);
  cookies().delete({ name: SECRET_COOKIE, path: BACK });
  redirect(BACK);
}

async function setActive(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const id = String(fd.get("id") ?? "");
  const on = String(fd.get("on") ?? "") === "1";
  const r = await env.DB.prepare("UPDATE webhooks SET active=? WHERE id=?").bind(on, id).run();
  if (!r.meta?.changes) go("err", "That webhook no longer exists.");
  if (!on) await env.DB.prepare("UPDATE webhook_deliveries SET status='failed', last_error='Webhook was disabled' WHERE webhook_id=? AND status='pending'").bind(id).run();
  await audit({ kind: "team", id: me.id }, on ? "webhook.enabled" : "webhook.disabled", "webhook", id);
  go("ok", on ? "Webhook switched on. New events will be sent." : "Webhook switched off. Waiting deliveries were stopped.");
}

async function removeHook(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const id = String(fd.get("id") ?? "");
  if (String(fd.get("confirm") ?? "") !== "yes") go("err", "Tick the box to confirm deleting the webhook.");
  const r = await env.DB.prepare("DELETE FROM webhooks WHERE id=?").bind(id).run();
  if (!r.meta?.changes) go("err", "That webhook no longer exists.");
  await env.DB.prepare("DELETE FROM webhook_deliveries WHERE webhook_id=?").bind(id).run();
  await audit({ kind: "team", id: me.id }, "webhook.deleted", "webhook", id);
  go("ok", "Webhook deleted, with its delivery log.");
}

async function testHook(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const id = String(fd.get("id") ?? "");
  const h = await env.DB.prepare("SELECT id FROM webhooks WHERE id=?").bind(id).first();
  if (!h) go("err", "That webhook no longer exists.");
  let res;
  try { res = await sendTest(id); } catch (e) { await logError("team/integrations", e, { id }); go("err", "The test could not be sent. Check System health for the error."); }
  await audit({ kind: "team", id: me.id }, "webhook.tested", "webhook", id, { status: res.status });
  if (res.status === "delivered") go("ok", "Test event delivered. Your endpoint answered with a 2xx status.");
  go("err", `Test not delivered: ${res.error || "no answer"}.`);
}

const STATUS = { delivered: ["Delivered", "good"], pending: ["Retrying", "ok"], failed: ["Failed", "low"] };

export default async function Page({ searchParams }) {
  const me = await requireTeam("team");
  let hooks = [], log = [], dbErr = false;
  try {
    hooks = (await env.DB.prepare(
      `SELECT w.id, w.url, w.events, w.active, w.created_by, w.created_at, w.last_status, w.last_at,
        (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.webhook_id=w.id AND d.status='pending') pending_n,
        (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.webhook_id=w.id AND d.status='failed') failed_n
       FROM webhooks w ORDER BY w.created_at`
    ).all()).results ?? [];
    log = (await env.DB.prepare(
      "SELECT d.id, d.webhook_id, d.event, d.status, d.attempts, d.last_error, d.created_at, d.delivered_at, w.url FROM webhook_deliveries d LEFT JOIN webhooks w ON w.id=d.webhook_id ORDER BY d.created_at DESC LIMIT 50"
    ).all()).results ?? [];
  } catch (e) {
    dbErr = true;
    await logError("team/integrations", e);
  }
  let shown = null;
  try { shown = JSON.parse(cookies().get(SECRET_COOKIE)?.value || "null"); } catch { shown = null; }
  const host = (u) => { try { return new URL(u).hostname; } catch { return u || "deleted webhook"; } };

  return (
    <TeamShell active="integrations" eyebrow="Owners and admins" title="Integrations and <b>webhooks</b>" email={me.email} role={me.role}>
      <div className="pf-int">
        <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
        <p className="lead">Send deal and campaign events to Zapier, Make, Slack, your CRM or any HTTPS endpoint. Each request is signed, carries ids, stages and amounts in paise, and never a name, email or phone number.</p>
        {dbErr && <div className="note" style={{ marginBottom: 14 }}>Couldn't read the webhooks. The database may still be updating; reload in a minute.</div>}

        {shown?.secret && (
          <div className="panel pad pf-secret" style={{ marginBottom: 18 }}>
            <h2>Signing secret</h2>
            <p className="muted" style={{ margin: "-4px 0 10px" }}>Copy it into your tool now. It is shown once and can't be read again; to change it, delete the webhook and add it again.</p>
            <input readOnly value={shown.secret} aria-label="Signing secret" className="pf-mono" data-testid="webhook-secret" />
            <form action={dismissSecret} style={{ marginTop: 10 }}><button className="btn sm">I've copied it, hide the secret</button></form>
          </div>
        )}

        <section className="sheet" aria-labelledby="wh-h" style={{ marginBottom: 28 }}>
          <div className="sheet__h"><h2 id="wh-h">Webhooks</h2><span className="n">{hooks.length}</span></div>
          {hooks.length === 0 ? <div className="panel pad empty"><b>No webhooks yet.</b> Add one below to start sending events.</div> : (
            <div className="pf-hooks">
              {hooks.map((h) => (
                <article key={h.id} className="panel pad pf-hook">
                  <div className="spread">
                    <div className="pf-hook__url"><b>{host(h.url)}</b><div className="hint pf-break">{h.url}</div></div>
                    <span className={`pill ${h.active ? "good" : "low"}`}>{h.active ? "On" : "Off"}</span>
                  </div>
                  <div className="chips pf-events">{parseEvents(h.events).map((e) => <span key={e} className="pill">{e}</span>)}</div>
                  <p className="hint" style={{ margin: "8px 0 12px" }}>
                    Added {dayTime(h.created_at)}{h.created_by ? ` by ${h.created_by}` : ""} · {h.last_at ? `last answer ${h.last_status ? `HTTP ${h.last_status}` : "none"} ${dayTime(h.last_at)}` : "nothing sent yet"} · {Number(h.pending_n) || 0} retrying · {Number(h.failed_n) || 0} failed
                  </p>
                  <div className="row pf-actions">
                    <form action={testHook}><input type="hidden" name="id" value={h.id} /><button className="btn sm" disabled={!h.active}>Send test event</button></form>
                    <form action={setActive}><input type="hidden" name="id" value={h.id} /><input type="hidden" name="on" value={h.active ? "0" : "1"} /><button className="btn sm">{h.active ? "Switch off" : "Switch on"}</button></form>
                    <form action={removeHook} className="row pf-del"><input type="hidden" name="id" value={h.id} />
                      <label className="hint"><input type="checkbox" name="confirm" value="yes" required /> Delete for good</label>
                      <button className="btn sm">Delete</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <form className="panel pad" action={createHook} style={{ marginBottom: 28, maxWidth: 760 }}>
          <h2>Add a webhook</h2>
          <p className="muted" style={{ margin: "-4px 0 14px" }}>We POST JSON to this address when the events you pick happen. Failed deliveries are retried for about a day ({MAX_ATTEMPTS} attempts).</p>
          <div className="fld"><label htmlFor="f-wh-url">Endpoint address</label><input id="f-wh-url" name="url" type="url" inputMode="url" placeholder="https://hooks.zapier.com/hooks/catch/…" required pattern="https://.+" /></div>
          <fieldset className="pf-fieldset">
            <legend className="lbl">Events to send</legend>
            <div className="pf-checks">
              {EVENTS.map((e) => (
                <label key={e} className="pf-check"><input type="checkbox" name="events" value={e} defaultChecked={e.startsWith("deal.")} /><span><code>{e}</code><span className="hint">{EVENT_LABEL[e]}</span></span></label>
              ))}
            </div>
          </fieldset>
          <button className="btn-foil" style={{ marginTop: 16 }}>Add webhook</button>
        </form>

        <section className="sheet" aria-labelledby="sig-h" style={{ marginBottom: 28 }}>
          <div className="sheet__h"><h2 id="sig-h">Checking the signature</h2></div>
          <div className="panel pad">
            <p style={{ marginTop: 0 }}>Every request has <code>X-Colatch-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>. Compute HMAC-SHA256 of <code>{"`${t}.${raw body}`"}</code> with your signing secret and compare it with <code>v1</code>. Reject requests older than 5 minutes. <code>X-Colatch-Delivery</code> is the same on every retry, so use it to ignore duplicates.</p>
            <pre className="pf-code">{`{ "id": "wd_…", "event": "deal.stage_changed", "created_at": "2026-11-17T09:30:00.000Z",
  "data": { "deal_id": "…", "campaign_id": "…", "from_stage": "confirmed", "to_stage": "live",
            "fee_paise": 3500000, "pay_status": "funded" } }`}</pre>
          </div>
        </section>

        <section aria-labelledby="log-h">
          <div className="sheet__h"><h2 id="log-h">Delivery log</h2><span className="n">{log.length}</span></div>
          {log.length === 0 ? <div className="allclear"><b>Nothing sent yet.</b></div> : (
            <div className="panel scroll-x"><table className="tbl stack">
              <thead><tr><th>When</th><th>Event</th><th>Endpoint</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>{log.map((d) => {
                const [label, cls] = STATUS[d.status] || [d.status, ""];
                return (
                  <tr key={d.id}>
                    <td className="hint" style={{ whiteSpace: "nowrap" }}>{dayTime(d.created_at)}</td>
                    <td data-label="Event"><code>{d.event}</code></td>
                    <td data-label="Endpoint">{host(d.url)}</td>
                    <td data-label="Status"><span className={`pill ${cls}`}>{label}</span><div className="hint">{d.attempts} of {MAX_ATTEMPTS} attempts</div></td>
                    <td data-label="Detail" className="pf-break">{d.status === "delivered" ? `Delivered ${dayTime(d.delivered_at)}` : d.last_error || "Waiting for the first attempt"}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </TeamShell>
  );
}
