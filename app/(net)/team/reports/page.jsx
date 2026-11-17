import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { sentence, dayTime } from "@/components/team/labels";
import { env } from "@/lib/net/env";
import { logEvent } from "@/lib/net/deal";
import { audit } from "@/lib/net/security";
import { parseWhen, weekSeries } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, FilterBar, FilterChips, DataTable, Grid, Section, Card, AsideCard, Pill, Cell } from "@/components/ui";
import { ShareBar, HBars } from "@/components/admin/Charts";

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
  const status = ["open", "confirmed", "dismissed"].includes(searchParams?.status) ? String(searchParams.status) : "all";
  const shown = status === "all" ? rows : rows.filter((r) => r.status === status);
  const by = (st) => rows.filter((r) => r.status === st).length;
  const now = Date.now();
  const age = (r) => { const w = parseWhen(r.created_at); return w ? (now - w.t) / 36e5 : 0; };
  const late = open.filter((r) => age(r) > 72).length;
  const bounties = rows.filter((r) => r.status === "confirmed" && r.reporter_side === "creator").length;
  const TONE = { open: "mine", confirmed: "done", dismissed: "off" };
  const weekly = weekSeries(rows.map((r) => r.created_at), now, 8);
  // The next decision: the oldest open report (the one closest to, or past, the 72-hour promise).
  const next = [...open].sort((a, b) => age(b) - age(a))[0] || null;
  const hrs = (h) => (h < 48 ? `${Math.max(1, Math.round(h))} ${Math.round(h) === 1 ? "hour" : "hours"}` : `${Math.round(h / 24)} days`);
  const latest = rows.length ? Math.min(...rows.map(age)) : null;
  // Brands named most, from the rows already loaded (repeat names are worth a call).
  const named = new Map();
  for (const r of rows) { const b = String(r.brand || r.client_company || "").trim(); if (b) named.set(b, (named.get(b) || 0) + 1); }
  const topBrands = [...named.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const bySide = ["creator", "brand"].map((side) => ({ label: side === "creator" ? "Reported by creators" : "Reported by brands", n: rows.filter((r) => r.reporter_side === side).length }));

  return (
    <TeamShell active="reports" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Trust and safety" }, { label: "Off-platform reports" }]}
        eyebrow="Trust and safety"
        title="Off-platform <b>reports</b>"
        sub={`Creators report when someone asks to move a deal outside Colatch. Confirm it if it checks out (the creator gets ₹${BOUNTY}), or dismiss it. Talk to the brand before confirming.`}
      />
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>

      <KpiStrip label="Reports at a glance" items={[
        { featured: open.length > 0, label: "Open to decide", value: open.length, foot: late ? `${late} past the 72-hour promise` : "decide within 72 hours", href: "?status=open" },
        { label: "Confirmed", value: by("confirmed"), foot: bounties ? `${bounties} with a ₹${BOUNTY} thank-you credit` : "no credits yet", href: "?status=confirmed" },
        { label: "Dismissed", value: by("dismissed"), foot: "no credit, nothing changes on the deal", href: "?status=dismissed" },
        { label: "Reports · 8 weeks", value: weekly.reduce((a, b) => a + b, 0), spark: weekly, sparkLabel: "Reports per week, last 8 weeks", foot: "per week, oldest first" },
      ]} />

      <Grid aside={<>
        <AsideCard eyebrow="How to decide" title="Check before you confirm">
          <p className="small" style={{ marginTop: 0 }}>Read the deal room, then call the brand. Confirming adds ₹{BOUNTY} to a creator reporter's earnings (approved, waiting for payout) and notes it on the deal. Confirming needs a finance role.</p>
          <p className="small" style={{ marginBottom: 0 }}>Aim to decide within 72 hours: that's the promise creators see.</p>
        </AsideCard>
        {rows.length > 0 && <AsideCard eyebrow="Insight" title="Where reports end up">
          <ShareBar label="Reports by status" parts={[{ label: "Open", n: open.length, href: "?status=open" }, { label: "Confirmed", n: by("confirmed"), href: "?status=confirmed" }, { label: "Dismissed", n: by("dismissed"), href: "?status=dismissed" }]} />
          <div style={{ marginTop: 16 }}><ShareBar label="Reports by who raised them" parts={bySide} /></div>
        </AsideCard>}
        {topBrands.length > 0 && <AsideCard eyebrow="Pattern" title="Brands named most" foot={<span className="small">A brand named in more than one report is worth a call from the account owner.</span>}>
          <HBars label="Reports per brand" aLabel="Reports" rows={topBrands.map(([b, n]) => ({ label: b, a: n }))} />
        </AsideCard>}
      </>}>
        <Section id="next" title="Decide next" sub={next ? "The oldest open report. Read the deal room and call the brand first." : "Nothing open to decide."}>
          {next ? (
            <Card tone="gold" pad="lg" label="Oldest open report">
              <div className="adm-next">
                <div className="adm-next__body">
                  <p className="adm-next__eb">{age(next) > 72 ? `Past the 72-hour promise · open ${hrs(age(next))}` : `Open ${hrs(age(next))} · ${hrs(72 - age(next))} left of the 72-hour promise`}</p>
                  <h3 className="adm-next__t">{next.creator_name || (next.handle ? "@" + next.handle : sentence(next.reporter_side))} <span className="adm-dim">reported {next.brand || next.client_company || next.campaign_title || "a brand"}</span></h3>
                  {next.note && <p className="adm-next__q">“{next.note}”</p>}
                  {next.deal_id && <a className="link" href={`/team/deals/${next.deal_id}`}>Open the deal room{next.deliverable ? ` · ${next.deliverable}` : ""}</a>}
                </div>
                <div className="adm-acts adm-next__acts">
                  <form action={confirm}><input type="hidden" name="id" value={next.id} /><button className="btn plum">Confirm</button></form>
                  <form action={dismiss}><input type="hidden" name="id" value={next.id} /><button className="btn">Dismiss</button></form>
                </div>
              </div>
            </Card>
          ) : (
            <Card><p className="small" style={{ margin: 0 }}>{latest == null ? "No reports yet. When a creator reports an off-platform request from their deal room, it shows up here." : `All reports are decided. The latest came in ${hrs(latest)} ago.`}</p></Card>
          )}
        </Section>

        <Section id="all" title="Reports" sub={`${shown.length} ${shown.length === 1 ? "report" : "reports"}. Open first, newest first.`}>
          <FilterBar label="Filter reports">
            <FilterChips name="status" label="Filter by status" current={status} hrefFor={(v) => (v === "all" ? "?" : `?status=${v}`)}
              options={[{ value: "all", label: "All", count: rows.length }, { value: "open", label: "Open", count: open.length }, { value: "confirmed", label: "Confirmed", count: by("confirmed") }, { value: "dismissed", label: "Dismissed", count: by("dismissed") }]} />
          </FilterBar>
          <DataTable caption="Off-platform reports" rows={shown} columns={[
            { key: "who", label: "Reported", render: (r) => <Cell eyebrow={`${dayTime(r.created_at)} · by ${r.reporter_side}`} title={r.creator_name || (r.handle ? "@" + r.handle : r.reporter_side)} sub={<span className="adm-pre">{r.note}</span>} /> },
            { key: "status", label: "Status", primary: true, render: (r) => <span className="ui-pills"><Pill tone={TONE[r.status] || "quiet"}>{sentence(r.status)}</Pill>{r.status === "open" && age(r) > 72 && <Pill tone="gold">Past 72h</Pill>}</span> },
            { key: "deal", label: "Deal", render: (r) => <span className="adm-dealcell">{r.deal_id ? <a className="link" href={`/team/deals/${r.deal_id}`}>{r.brand || r.client_company || "Deal"}</a> : r.campaign_title || "—"}{(r.deliverable || r.campaign_title) && <span className="adm-dim" style={{ display: "block" }}>{r.deliverable || r.campaign_title}</span>}</span> },
            { key: "act", label: "Decision", labelHidden: true, primary: true, num: true, render: (r) => (r.status === "open" ? (
              <div className="adm-acts">
                <form action={confirm}><input type="hidden" name="id" value={r.id} /><button className="btn sm plum">Confirm</button></form>
                <form action={dismiss}><input type="hidden" name="id" value={r.id} /><button className="btn sm">Dismiss</button></form>
              </div>
            ) : "") },
          ]} empty={status === "all"
            ? { title: "No reports yet.", body: "When a creator reports an off-platform request from their deal room, it shows up here." }
            : { title: "Nothing with this status.", body: "Try another filter.", action: <a className="btn sm" href="?">See all reports</a> }} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
