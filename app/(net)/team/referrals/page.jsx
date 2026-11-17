import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import { flashUrl } from "../../_ui/flash";
import { AutoSelect } from "../_client";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { inr } from "@/lib/net/creators";
import { REF, BRAND_TIERS, brandTierFor } from "@/lib/net/referral";
import { audit } from "@/lib/net/security";
import { refStatusLabel, sentence } from "@/components/team/labels";

// Allowed status moves. "paid" is final and only reached through the Record payout form (with a UTR).
const MOVES = { pending: ["approved", "void"], approved: ["pending", "void"], void: ["pending"], paid: [] };

export const metadata = { title: "Affiliate program", robots: { index: false, follow: false } };

async function setStatus(fd) {
  "use server";
  // Approving or voiding money owed is a finance decision.
  const me = await requireTeam("finance", "/team/referrals");
  const id = String(fd.get("id") ?? ""), st = String(fd.get("status") ?? "");
  const cur = await env.DB.prepare("SELECT status FROM referral_earnings WHERE id=?").bind(id).first();
  if (!cur) redirect(flashUrl("/team/referrals", "err", "That earning does not exist."));
  if (cur.status === st) redirect("/team/referrals");
  if (!(MOVES[cur.status] || []).includes(st)) redirect(flashUrl("/team/referrals", "err", st === "paid" ? "Use Record payout, with the bank reference." : `Can't move from ${cur.status} to ${st}.`));
  const r = await env.DB.prepare("UPDATE referral_earnings SET status=? WHERE id=? AND status=?").bind(st, id, cur.status).run();
  if (!r.meta?.changes) redirect(flashUrl("/team/referrals", "err", "It changed while you were looking. Reload and try again."));
  await audit({ kind: "team", id: me.email }, "referral_earning.status", "referral_earning", id, { from: cur.status, to: st });
  redirect(flashUrl("/team/referrals", "ok", "Updated."));
}

/** Records a referral payout that was actually sent (cash) or applied (brand credit). Once only. */
async function recordPaid(fd) {
  "use server";
  const me = await requireTeam("finance", "/team/referrals");
  const id = String(fd.get("id") ?? "");
  const utr = String(fd.get("utr") ?? "").trim().toUpperCase();
  let err = "";
  try {
    await env.DB.tx(async (t) => {
      const e = await t.prepare("UPDATE referral_earnings SET status='paid' WHERE id=? AND status='approved' RETURNING *").bind(id).first();
      if (!e) throw Object.assign(new Error("Only an approved earning can be paid, and only once."), { user: true });
      if (e.kind === "cash") {
        if (!/^[A-Z0-9]{6,30}$/.test(utr)) throw Object.assign(new Error("Enter the bank reference (UTR): 6 to 30 letters and numbers."), { user: true });
        const deal = e.deal_id && !["first", "none"].includes(e.deal_id) ? e.deal_id : null;
        await t.prepare("INSERT INTO finance_ledger (kind, deal_id, amount_paise, utr, method, note, actor_id, idempotency_key) VALUES ('referral_payout_sent',?,?,?,?,?,?,?)")
          .bind(deal, Math.round(Number(e.amount) * 100), utr, "bank_transfer", `${e.reason} to ${e.owner_type} ${e.owner_id}`, me.email, `refpay:${e.id}`).run();
      }
      await audit({ kind: "team", id: me.email }, "referral_earning.paid", "referral_earning", id, { amount: e.amount, kind: e.kind, utr: e.kind === "cash" ? utr : null }, t);
    });
  } catch (e) {
    if (e?.user) err = e.message;
    else if (e?.code === "23505") err = /utr/i.test(String(e?.constraint || e?.detail)) ? "That bank reference (UTR) is already recorded on another payment." : "This payout is already recorded.";
    else { console.error("[team/referrals] pay", e); err = "Something went wrong, nothing was recorded."; }
  }
  redirect(flashUrl("/team/referrals", err ? "err" : "ok", err || "Payout recorded."));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const money = me.role === "owner" || me.role === "admin" || me.role === "finance";
  const rows = (await env.DB.prepare(
    `SELECT e.*, c.owner_name, c.code, r.referred_type, r.referred_id,
            (SELECT name FROM creators WHERE id = r.referred_id) AS referred_name
     FROM referral_earnings e LEFT JOIN referrals r ON r.id = e.referral_id LEFT JOIN referral_codes c ON c.code = r.code
     ORDER BY CASE e.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, e.created_at DESC LIMIT 300`
  ).all().catch(() => ({ results: [] }))).results ?? [];
  // Postgres: HAVING cannot use the select alias, and every selected column must be grouped.
  const top = (await env.DB.prepare(
    `SELECT c.code, c.owner_type, c.owner_name, COUNT(r.id) n,
            SUM(CASE WHEN r.referred_type='brand' THEN 1 ELSE 0 END) brands
     FROM referral_codes c LEFT JOIN referrals r ON r.code = c.code GROUP BY c.code, c.owner_type, c.owner_name HAVING COUNT(r.id) > 0 ORDER BY COUNT(r.id) DESC LIMIT 20`
  ).all().catch(() => ({ results: [] }))).results ?? [];
  const owed = rows.filter((r) => r.status === "approved" && r.kind === "cash").reduce((s, r) => s + r.amount, 0);
  const credit = rows.filter((r) => ["approved", "pending"].includes(r.status) && r.kind === "credit").reduce((s, r) => s + r.amount, 0);
  const pendingN = rows.filter((r) => r.status === "pending").length;
  const reasonLabel = { creator_first_deal: `Creator's first paid deal (₹${REF.creatorBonus})`, brand_fee_share: "Share of Colatch fee (tiered 10/12/15%)", bypass_report: "Confirmed off-platform report" };
  const ownerName = new Map(((await env.DB.prepare("SELECT id, name, handle FROM creators WHERE id IN (SELECT owner_id FROM referral_earnings WHERE owner_type='creator')").all().catch(() => ({ results: [] }))).results ?? []).map((c) => [c.id, c.name || c.handle]));
  // Brand earners are keyed by email: show the company or contact name from their brand account when there is one.
  const brandName = new Map(((await env.DB.prepare("SELECT lower(email) AS email, company, name FROM brand_accounts WHERE lower(email) IN (SELECT lower(owner_id) FROM referral_earnings WHERE owner_type='brand')").all().catch(() => ({ results: [] }))).results ?? []).map((b) => [b.email, b.company || b.name]).filter(([, n]) => n));
  // The earner's own referral code carries the name they signed up with.
  const codeName = new Map(((await env.DB.prepare("SELECT owner_type, owner_id, owner_name FROM referral_codes WHERE owner_name IS NOT NULL AND owner_id IN (SELECT owner_id FROM referral_earnings)").all().catch(() => ({ results: [] }))).results ?? []).map((c) => [c.owner_type + ":" + c.owner_id, c.owner_name]));
  const earner = (r) => r.owner_name || (r.owner_type === "creator" ? ownerName.get(r.owner_id) : brandName.get(String(r.owner_id).toLowerCase())) || codeName.get(r.owner_type + ":" + r.owner_id) || r.owner_id;

  return (
    <TeamShell active="referrals" eyebrow="Creator tools" title="Creators bring brands. <b>Brands bring brands.</b>" email={me.email}>
      <p className="lead">Every creator and brand has a referral code. Creators earn ₹{REF.creatorBonus} for each creator whose first paid deal clears, and a share of Colatch's fee for {REF.months} months on any brand they bring: {[...BRAND_TIERS].reverse().map((t) => `${t.pct}% at ${t.label}`).join(", ")}. Brands earn the same share as credit off their invoices. Everything is paid from Colatch's fee and booked automatically, in the same step, when a creator payout is recorded.</p>
      {searchParams?.ok && <div className="note good" style={{ marginBottom: 16 }}>{searchParams.ok}</div>}
      {searchParams?.err && <div className="note bad" style={{ marginBottom: 16 }}>{searchParams.err}</div>}
      <div className="grid3">
        <div className="panel kpi"><div className="k">Waiting for review</div><div className="v">{pendingN}</div><div className="s">check before approving</div></div>
        <div className="panel kpi"><div className="k">Cash owed to creators</div><div className="v">{inr(owed)}</div><div className="s">approved, not yet paid</div></div>
        <div className="panel kpi"><div className="k">Brand credit outstanding</div><div className="v">{inr(credit)}</div><div className="s">deduct on their next invoice</div></div>
      </div>

      <div className="grid2 sec" style={{ alignItems: "start" }}>
        <div className="panel">
          <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Earnings ledger</h2></div>
          {rows.length ? <div className="scroll-x"><table className="tbl"><thead><tr><th>Earner</th><th>For</th><th className="num">Amount</th><th>Status</th></tr></thead><tbody>
            {rows.map((r) => <tr key={r.id}><td><b>{earner(r)}</b><div className="hint">{sentence(r.owner_type)}{r.code ? ` · ${r.code}` : ""}</div></td><td>{reasonLabel[r.reason] || r.reason}{r.referred_type && <div className="hint">{sentence(r.referred_type)}: {r.referred_name || r.referred_id}</div>}</td><td className="num">{inr(r.amount)}<div className="hint">{sentence(r.kind)}</div></td>
              <td>{r.status === "paid" ? <span className="pill good">Paid</span> : !money ? <span className="pill">{refStatusLabel(r.status)}</span> : <>
                <form action={setStatus}><input type="hidden" name="id" value={r.id} /><AutoSelect className="in" name="status" defaultValue={r.status} style={{ width: "auto", padding: "5px 8px", fontSize: 12.5 }}>{[r.status, ...(MOVES[r.status] || [])].map((s) => <option key={s} value={s}>{refStatusLabel(s)}</option>)}</AutoSelect></form>
                {r.status === "approved" && <form action={recordPaid} className="row" style={{ gap: 6, marginTop: 6, flexWrap: "nowrap" }}><input type="hidden" name="id" value={r.id} />
                  {r.kind === "cash" && <input className="in" name="utr" required pattern="[A-Za-z0-9]{6,30}" placeholder="UTR" style={{ padding: "5px 8px", fontSize: 12.5, width: 130 }} />}
                  <button className="btn sm">{r.kind === "cash" ? "Record payout" : "Mark credit applied"}</button></form>}</>}</td></tr>)}
          </tbody></table></div> : <p className="hint" style={{ padding: "0 20px 18px" }}>No referral earnings yet. They appear when a referred creator or brand completes a paid deal.</p>}
        </div>
        <div className="panel">
          <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Top referrers</h2></div>
          {top.length ? <table className="tbl"><tbody>{top.map((t) => <tr key={t.code}><td><b>{t.owner_name || t.code}</b><div className="hint">{t.owner_type} · {t.code}</div></td><td className="num">{t.n} referred<div className="hint">{t.brands} {Number(t.brands) === 1 ? "brand" : "brands"} · tier {brandTierFor(Number(t.brands)).pct}%</div></td></tr>)}</tbody></table> : <p className="hint" style={{ padding: "0 20px 18px" }}>Nobody has referred anyone yet.</p>}
          <p className="hint" style={{ padding: "0 20px 18px" }}>Watch for self-referrals: the same phone, email domain or UPI on both sides. Void those before approving.</p>
        </div>
      </div>
    </TeamShell>
  );
}
