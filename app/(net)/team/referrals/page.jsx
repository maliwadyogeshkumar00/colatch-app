import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import { flashUrl } from "../../_ui/flash";
import { AutoSelect } from "../_client";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { inr } from "@/lib/net/creators";
import { REF } from "@/lib/net/referral";

export const metadata = { title: "Affiliate program · Colatch Connect", robots: { index: false, follow: false } };

async function setStatus(fd) {
  "use server";
  await requireTeam();
  const id = String(fd.get("id") ?? ""), st = String(fd.get("status") ?? "");
  if (["approved", "paid", "void", "pending"].includes(st)) {
    await env.DB.prepare("UPDATE referral_earnings SET status=? WHERE id=?").bind(st, id).run();
    redirect(flashUrl("/team/referrals", "ok", "Updated."));
  }
  redirect("/team/referrals");
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const rows = (await env.DB.prepare(
    `SELECT e.*, c.owner_name, c.code, r.referred_type, r.referred_id,
            (SELECT name FROM creators WHERE id = r.referred_id) AS referred_name
     FROM referral_earnings e JOIN referrals r ON r.id = e.referral_id JOIN referral_codes c ON c.code = r.code
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
  const reasonLabel = { creator_first_deal: `Creator's first paid deal (₹${REF.creatorBonus})`, brand_fee_share: `${REF.brandSharePct}% of Colatch fee` };

  return (
    <TeamShell active="referrals" eyebrow="Creator tools" title="Creators bring brands. <b>Brands bring brands.</b>" email={me.email}>
      <p className="lead">Every creator and brand has a referral code. Creators earn ₹{REF.creatorBonus} for each creator whose first paid deal clears, and {REF.brandSharePct}% of Colatch's fee for {REF.months} months on any brand they bring. Brands earn the same share as credit off their invoices. Everything is paid from Colatch's fee and booked automatically when a deal is marked paid.</p>
      {searchParams?.ok && <div className="note good" style={{ marginBottom: 16 }}>{searchParams.ok}</div>}
      <div className="grid3">
        <div className="panel kpi"><div className="k">Waiting for review</div><div className="v">{pendingN}</div><div className="s">check before approving</div></div>
        <div className="panel kpi"><div className="k">Cash owed to creators</div><div className="v">{inr(owed)}</div><div className="s">approved, not yet paid</div></div>
        <div className="panel kpi"><div className="k">Brand credit outstanding</div><div className="v">{inr(credit)}</div><div className="s">deduct on their next invoice</div></div>
      </div>

      <div className="grid2 sec" style={{ alignItems: "start" }}>
        <div className="panel scroll-x">
          <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Earnings ledger</h2></div>
          {rows.length ? <table className="tbl"><thead><tr><th>Earner</th><th>For</th><th className="num">Amount</th><th>Status</th></tr></thead><tbody>
            {rows.map((r) => <tr key={r.id}><td><b>{r.owner_name || r.owner_id}</b><div className="hint">{r.owner_type} · {r.code}</div></td><td>{reasonLabel[r.reason] || r.reason}<div className="hint">{r.referred_type}: {r.referred_name || r.referred_id}</div></td><td className="num">{inr(r.amount)}<div className="hint">{r.kind}</div></td>
              <td><form action={setStatus}><input type="hidden" name="id" value={r.id} /><AutoSelect className="in" name="status" defaultValue={r.status} style={{ width: "auto", padding: "5px 8px", fontSize: 12.5 }}>{["pending", "approved", "paid", "void"].map((s) => <option key={s}>{s}</option>)}</AutoSelect></form></td></tr>)}
          </tbody></table> : <p className="hint" style={{ padding: "0 20px 18px" }}>No referral earnings yet. They appear when a referred creator or brand completes a paid deal.</p>}
        </div>
        <div className="panel">
          <div className="pad" style={{ padding: "18px 20px 6px" }}><h2>Top referrers</h2></div>
          {top.length ? <table className="tbl"><tbody>{top.map((t) => <tr key={t.code}><td><b>{t.owner_name || t.code}</b><div className="hint">{t.owner_type} · {t.code}</div></td><td className="num">{t.n} referred<div className="hint">{t.brands} brands</div></td></tr>)}</tbody></table> : <p className="hint" style={{ padding: "0 20px 18px" }}>Nobody has referred anyone yet.</p>}
          <p className="hint" style={{ padding: "0 20px 18px" }}>Watch for self-referrals: the same phone, email domain or UPI on both sides. Void those before approving.</p>
        </div>
      </div>
    </TeamShell>
  );
}
