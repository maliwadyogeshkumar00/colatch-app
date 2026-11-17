import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { sentence, dayTime } from "@/components/team/labels";
import { env } from "@/lib/net/env";
import { logEvent } from "@/lib/net/deal";
import { audit } from "@/lib/net/security";

export const metadata = { title: "Off-platform reports", robots: { index: false, follow: false } };

const BOUNTY = 500;

async function confirm(fd) {
  "use server";
  // Confirming creates money owed, so it needs the finance permission.
  const me = await requireTeam("finance", "/team/reports");
  const id = String(fd.get("id") ?? "");
  let bounty = false;
  // Atomic and idempotent: the report flips from open once, and the credit has a unique key, so a refresh or double click adds nothing.
  const r = await env.DB.tx(async (t) => {
    const r = await t.prepare("UPDATE bypass_reports SET status='confirmed' WHERE id=? AND status='open' RETURNING *").bind(id).first();
    if (!r) return null;
    // The thank-you credit rides the referral earnings ledger so it shows on the creator's Earnings page and pays out the same way.
    if (r.reporter_side === "creator" && r.reporter_id) {
      const e = await t.prepare("INSERT INTO referral_earnings (id, referral_id, deal_id, owner_type, owner_id, amount, kind, reason, status) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
        .bind(crypto.randomUUID(), "bypass:" + id, r.deal_id || "none", "creator", r.reporter_id, BOUNTY, "cash", "bypass_report", "approved").run();
      bounty = Boolean(e.meta?.changes);
    }
    await audit({ kind: "team", id: me.email }, "bypass.confirm", "bypass_report", id, { bounty }, t);
    return r;
  });
  if (!r) redirect(flashUrl("/team/reports", "err", "This report was already handled."));
  if (r.deal_id) await logEvent(env, r.deal_id, "team", "note", "Off-platform report confirmed by the Colatch team");
  redirect(flashUrl("/team/reports", "ok", bounty ? `Confirmed. ₹${BOUNTY} added to the reporter's earnings (approved, waiting for payout).` : "Confirmed."));
}

async function dismiss(fd) {
  "use server";
  const me = await requireTeam("shortlist", "/team/reports");
  const id = String(fd.get("id") ?? "");
  const r = await env.DB.prepare("UPDATE bypass_reports SET status='dismissed' WHERE id=? AND status='open'").bind(id).run();
  if (!r.meta?.changes) redirect(flashUrl("/team/reports", "err", "This report was already handled."));
  await audit({ kind: "team", id: me.email }, "bypass.dismiss", "bypass_report", id, null);
  redirect(flashUrl("/team/reports", "ok", "Dismissed."));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const rows = (await env.DB.prepare(
    `SELECT b.*, d.brand, d.deliverable, c.name AS creator_name, c.handle, k.title AS campaign_title, k.client_company
     FROM bypass_reports b
     LEFT JOIN creator_deals d ON d.id = b.deal_id
     LEFT JOIN creators c ON c.id = b.reporter_id
     LEFT JOIN campaigns k ON k.id = COALESCE(b.campaign_id, d.campaign_id)
     ORDER BY CASE b.status WHEN 'open' THEN 0 ELSE 1 END, b.created_at DESC LIMIT 200`
  ).all().catch(() => ({ results: [] }))).results ?? [];
  const open = rows.filter((r) => r.status === "open");

  return (
    <TeamShell active="reports" eyebrow="Trust and safety" title="Off-platform <b>reports</b>" email={me.email}>
      <p className="lead">Creators report when someone asks to move a deal outside Colatch. Confirm it if it checks out (the creator gets ₹{BOUNTY}), or dismiss it. Talk to the brand before confirming.</p>
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>
      <div className="panel">
        {rows.length ? (
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>Reported</th><th>Deal</th><th>What happened</th><th>Status</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.creator_name || (r.handle ? "@" + r.handle : r.reporter_side)}</b><div className="hint">{dayTime(r.created_at)} · by {r.reporter_side}</div></td>
                <td>{r.deal_id ? <a className="link" href={`/team/deals/${r.deal_id}`}>{r.brand || r.client_company || "Deal"}</a> : r.campaign_title || "—"}<div className="hint">{r.deliverable || r.campaign_title || ""}</div></td>
                <td style={{ maxWidth: 380, whiteSpace: "pre-line" }}>{r.note}</td>
                <td><span className={`pill ${r.status === "confirmed" ? "good" : r.status === "open" ? "ok" : ""}`}>{sentence(r.status)}</span></td>
                <td>{r.status === "open" && (
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <form action={confirm}><input type="hidden" name="id" value={r.id} /><button className="btn sm plum">Confirm</button></form>
                    <form action={dismiss}><input type="hidden" name="id" value={r.id} /><button className="btn sm">Dismiss</button></form>
                  </div>
                )}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty" style={{ padding: 24 }}><b>No reports yet.</b> When a creator reports an off-platform request from their deal room, it shows up here.</div>}
      </div>
      {open.length > 0 && <p className="hint" style={{ marginTop: 12 }}>{open.length} open {open.length === 1 ? "report" : "reports"}. Aim to decide within 72 hours: that's the promise creators see.</p>}
    </TeamShell>
  );
}
