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
import { inrShort, monthSeries } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, ChartCard, FilterBar, FilterChips, DataTable, Grid, Section, AsideCard, Pill, Cell, Figure, Bars } from "@/components/ui";
import { HBars } from "@/components/admin/Charts";

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

  const paidOut = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const approvedN = rows.filter((r) => r.status === "approved").length;
  const earners = new Set(rows.filter((r) => r.status !== "void").map((r) => r.owner_type + ":" + r.owner_id)).size;
  const st = ["pending", "approved", "paid", "void"].includes(searchParams?.status) ? String(searchParams.status) : "all";
  const shown = st === "all" ? rows : rows.filter((r) => r.status === st);
  const count = (x) => rows.filter((r) => r.status === x).length;
  const now = Date.now();
  // Earnings booked per month (not void), from the rows already loaded.
  const booked = monthSeries(rows.filter((r) => r.status !== "void").map((r) => ({ at: r.created_at, amount: Number(r.amount) || 0 })), now, 6);
  const TONE = { pending: "wait", approved: "mine", paid: "done", void: "off" };
  const flash = { ok: searchParams?.ok, err: searchParams?.err };

  return (
    <TeamShell active="referrals" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator tools" }, { label: "Affiliate program" }]}
        eyebrow="Creator tools · Affiliate program"
        title="Creators bring brands. <b>Brands bring brands.</b>"
        sub={`Every creator and brand has a referral code. Creators earn ₹${REF.creatorBonus} for each creator whose first paid deal clears, and a share of Colatch's fee for ${REF.months} months on any brand they bring: ${[...BRAND_TIERS].reverse().map((t) => `${t.pct}% at ${t.label}`).join(", ")}. Brands earn the same share as credit off their invoices. Everything is paid from Colatch's fee and booked automatically, in the same step, when a creator payout is recorded.`}
      />
      {flash.ok && <div className="note good" style={{ marginBottom: 16 }}>{flash.ok}</div>}
      {flash.err && <div className="note bad" style={{ marginBottom: 16 }}>{flash.err}</div>}

      <KpiStrip label="Referral earnings at a glance" items={[
        { label: "Earners", value: earners, foot: `${top.length} ${top.length === 1 ? "code has" : "codes have"} referred someone` },
        { label: "Waiting for review", value: pendingN, foot: "check before approving", href: "?status=pending" },
        { featured: owed > 0, label: "Cash owed to creators", value: inrShort(owed), title: inr(owed), foot: `${approvedN} approved, not yet paid${credit ? ` · ${inr(credit)} brand credit outstanding` : ""}`, href: "?status=approved" },
        { label: "Paid out", value: inrShort(paidOut), title: inr(paidOut), foot: "cash sent and credit applied", href: "?status=paid", spark: booked.months.map((m) => m.total), sparkLabel: "Referral earnings booked per month, last 6 months" },
      ]} />

      <Grid aside={<>
        <ChartCard title="Earnings booked" period="Last 6 months" figure={inrShort(booked.total)} figureTitle={inr(booked.total)} foot="Every referral earning that isn't void, by the month it was booked.">
          <Bars months={booked.months} label="Referral earnings booked per month" fmt={inr} />
        </ChartCard>
        <AsideCard eyebrow="Leaderboard" title="Top referrers" foot={<span className="small">Watch for self-referrals: the same phone, email domain or UPI on both sides. Void those before approving.</span>}>
          {top.length ? <HBars label="People referred per code" aLabel="Referred" rows={top.slice(0, 8).map((t) => ({ label: `${t.owner_name || t.code} · ${t.owner_type}`, a: Number(t.n), tag: <span className="adm-dim">{t.brands} {Number(t.brands) === 1 ? "brand" : "brands"} · tier {brandTierFor(Number(t.brands)).pct}%</span> }))} />
            : <p className="small" style={{ margin: 0 }}>Nobody has referred anyone yet.</p>}
        </AsideCard>
      </>}>
        <Section title="Earnings ledger" sub={`${shown.length} ${shown.length === 1 ? "earning" : "earnings"}. Waiting first, then approved, newest first.${money ? "" : " Your role can see these but not change them."}`}>
          <FilterBar label="Filter earnings">
            <FilterChips name="status" label="Filter by status" current={st} hrefFor={(v) => (v === "all" ? "?" : `?status=${v}`)}
              options={[{ value: "all", label: "All", count: rows.length }, ...["pending", "approved", "paid", "void"].map((x) => ({ value: x, label: refStatusLabel(x), count: count(x) }))]} />
          </FilterBar>
          <DataTable caption="Referral earnings" rows={shown} columns={[
            { key: "earner", label: "Earner", render: (r) => <Cell eyebrow={`${sentence(r.owner_type)}${r.code ? ` · ${r.code}` : ""}`} title={earner(r)} sub={<span>{reasonLabel[r.reason] || r.reason}{r.referred_type && <span className="adm-dim" style={{ display: "block" }}>{sentence(r.referred_type)}: {r.referred_name || r.referred_id}</span>}</span>} /> },
            { key: "status", label: "Status", primary: true, render: (r) => <Pill tone={TONE[r.status] || "quiet"}>{refStatusLabel(r.status)}</Pill> },
            { key: "amount", label: "Amount", num: true, primary: true, render: (r) => <Figure value={inr(r.amount)} note={sentence(r.kind)} /> },
            { key: "act", label: "Action", labelHidden: true, primary: true, render: (r) => (r.status === "paid" || !money ? null : (
              <div className="adm-acts adm-acts--col">
                <form action={setStatus}><input type="hidden" name="id" value={r.id} /><AutoSelect className="in" name="status" defaultValue={r.status} aria-label={`Status for ${earner(r)}`}>{[r.status, ...(MOVES[r.status] || [])].map((s) => <option key={s} value={s}>{refStatusLabel(s)}</option>)}</AutoSelect></form>
                {r.status === "approved" && <form action={recordPaid} className="adm-acts"><input type="hidden" name="id" value={r.id} />
                  {r.kind === "cash" && <input className="in" name="utr" required pattern="[A-Za-z0-9]{6,30}" placeholder="UTR" aria-label="Bank reference (UTR)" style={{ width: 130 }} />}
                  <button className="btn sm">{r.kind === "cash" ? "Record payout" : "Mark credit applied"}</button></form>}
              </div>
            )) },
          ]} empty={st === "all"
            ? { title: "No referral earnings yet.", body: "They appear when a referred creator or brand completes a paid deal." }
            : { title: "Nothing with this status.", body: "Try another filter.", action: <a className="btn sm" href="?">See all earnings</a> }} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
