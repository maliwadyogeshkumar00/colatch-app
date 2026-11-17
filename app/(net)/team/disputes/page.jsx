import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { requireTeam } from "../_guard";
import { env } from "@/lib/net/env";
import { can, logError } from "@/lib/net/security";
import { REASONS, resolveDispute, DisputeError } from "@/lib/net/disputes";
import { PageHeader, KpiStrip, DataTable, Grid, Section, Card, AsideCard, Pill, Split, Cell, EmptyState } from "@/components/ui";

export const metadata = { title: "Disputes", robots: { index: false, follow: false } };

const BACK = "/team/disputes";
const SIDE = { creator: "Creator", brand: "Brand", team: "Colatch team" };
// Database times can arrive as Date objects or as "YYYY-MM-DD HH:MM:SS" strings in UTC; read both.
const toD = (t) => { if (!t) return null; const d = t instanceof Date ? t : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? String(t).replace(" ", "T") : String(t).replace(" ", "T") + "Z"); return isNaN(d) ? null : d; };
const when = (t) => { const d = toD(t); return d ? d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : ""; };

async function resolve(fd) {
  "use server";
  // Checked here as well as on the page: a Server Action can be called directly.
  const me = await requireTeam("shortlist", BACK);
  let err = "", ok = "";
  try {
    const outcome = String(fd.get("outcome") ?? "");
    await resolveDispute(String(fd.get("id") ?? ""), me, outcome, String(fd.get("resolution") ?? ""));
    ok = outcome === "resolved" ? "Dispute resolved. The person who raised it has been told." : "Dispute rejected. The person who raised it has been told.";
  } catch (e) {
    if (e instanceof DisputeError) err = e.message;
    else { await logError("team/disputes.resolve", e); err = "Something went wrong, nothing was changed. Try again."; }
  }
  redirect(flashUrl(BACK, err ? "err" : "ok", err || ok));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const canResolve = can(me.role, "shortlist");
  const rows = (await env.DB.prepare(
    `SELECT x.*, d.brand, d.deliverable, d.pay_status, c.name AS creator_name, c.handle, k.title
     FROM disputes x
     LEFT JOIN creator_deals d ON d.id = x.deal_id
     LEFT JOIN creators c ON c.id = d.creator_id
     LEFT JOIN campaigns k ON k.id = d.campaign_id
     ORDER BY CASE x.status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(x.resolved_at, x.created_at) DESC LIMIT 200`
  ).all().catch(() => ({ results: [] }))).results ?? [];
  const open = rows.filter((r) => r.status === "open");
  const closed = rows.filter((r) => r.status !== "open");

  // Everything below is worked out from the rows already loaded: no extra queries.
  const resolvedN = closed.filter((r) => r.status === "resolved").length;
  const rejectedN = closed.length - resolvedN;
  const ageDays = (t) => { const d = toD(t); return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5)) : null; };
  const oldest = open.reduce((m, r) => { const a = ageDays(r.created_at); return a != null && (m == null || a > m) ? a : m; }, null);
  const byReason = Object.entries(rows.reduce((acc, r) => { const k = REASONS[r.reason] || r.reason || "Other"; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const title = (x) => `${x.creator_name || x.handle || "Creator"} × ${x.brand || x.title || "Brand"}`;
  const closedCols = [
    { key: "deal", label: "Deal", render: (x) => <Cell eyebrow={SIDE[x.raised_by_kind]} title={title(x)} sub={REASONS[x.reason] || x.reason} /> },
    { key: "outcome", label: "Outcome", primary: true, render: (x) => <><Pill tone={x.status === "resolved" ? "done" : "off"}>{x.status === "resolved" ? "Resolved" : "Rejected"}</Pill><div className="hint tr-wrap" style={{ maxWidth: 360 }}>{x.resolution}</div></> },
    { key: "closed", label: "Closed", render: (x) => <span className="hint">{when(x.resolved_at)} · {x.resolved_by}</span> },
  ];

  return (
    <TeamShell active="disputes" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Trust and safety" }, { label: "Disputes" }]}
        eyebrow="Trust and safety"
        title="Deal <b>disputes</b>"
        sub="Raised by a creator, a brand or the team. A dispute never moves money: if money has to move, use Cancel or Refund in the deal room so it goes through the ledger."
      />
      <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>
      {!canResolve && <div className="note info" style={{ marginBottom: 16 }}>Your role ({me.role}) can read disputes but not resolve them. Ask an owner, admin or shortlister.</div>}

      <KpiStrip label="Disputes at a glance" items={[
        { featured: open.length > 0, label: "Open", value: open.length, foot: open.length ? "need a decision" : "nothing waiting", href: "#open" },
        { label: "Oldest open", value: oldest != null ? `${oldest} ${oldest === 1 ? "day" : "days"}` : "—", foot: oldest != null ? "since it was raised" : "no open disputes" },
        { label: "Resolved", value: resolvedN, foot: "closed in someone's favour", href: "#closed" },
        { label: "Rejected", value: rejectedN, foot: "closed with no change", href: "#closed" },
      ]} />

      <Grid aside={<>
        <AsideCard eyebrow="Insight" title="Why disputes are raised">
          {byReason.length ? <Split label="Disputes by reason" parts={byReason.slice(0, 5).map(([label, count]) => ({ label, n: count }))} /> : <p className="small">No disputes yet.</p>}
          <p className="small">{rows.length ? `${rows.length} in all, newest 200 shown.` : "When a creator or brand raises one from their deal, it lands here and the team inbox gets an email."}</p>
        </AsideCard>
        <AsideCard tone="night" eyebrow="Money rule" title="A dispute never moves money.">
          <p className="small">If money has to move, use Cancel or Refund in the deal room so it goes through the ledger. Then resolve the dispute and say what happened.</p>
        </AsideCard>
      </>}>
        <Section id="open" title={`Open <b>${open.length}</b>`} sub={open.length ? "The outcome you write is sent to the person who raised it." : null}>
          {open.length === 0 ? <EmptyState title="No open disputes." body="When a creator or brand raises one from their deal, it lands here and the team inbox gets an email." action={<a className="btn sm" href="/team/crm">Open the CRM</a>} />
            : <div className="tr-sections">{open.map((x) => (
              <Card key={x.id} className="tr-dispute">
                <div className="tr-dispute__head">
                  <Pill tone="mine">Needs a decision</Pill>
                  <span className="hint">{SIDE[x.raised_by_kind]} · {REASONS[x.reason] || x.reason} · raised {when(x.created_at)}</span>
                </div>
                <h3 className="tr-cardh" style={{ marginTop: 10 }}><a className="link" href={`/team/deals/${x.deal_id}`}>{title(x)}</a></h3>
                <p className="tr-dispute__detail">{x.detail}</p>
                {canResolve && (
                  <form action={resolve} className="stack" style={{ marginTop: 16 }}>
                    <input type="hidden" name="id" value={x.id} />
                    <div className="fld"><label htmlFor={`res-${x.id}`}>Outcome the parties will read</label>
                      <textarea id={`res-${x.id}`} name="resolution" required minLength={10} maxLength={2000} placeholder="What the team found and what happens next. If money must move, say so and record it in the deal room." /></div>
                    <div className="row">
                      <button className="btn plum" name="outcome" value="resolved">Resolve</button>
                      <button className="btn" name="outcome" value="rejected">Reject</button>
                      <a className="link small" href={`/team/deals/${x.deal_id}`}>Open the deal room</a>
                    </div>
                  </form>
                )}
              </Card>
            ))}</div>}
        </Section>

        <Section id="closed" title="Closed" sub={`${closed.length} ${closed.length === 1 ? "dispute" : "disputes"}`}>
          <DataTable caption="Closed disputes" columns={closedCols} rows={closed} rowHref={(x) => `/team/deals/${x.deal_id}`}
            empty={{ title: "No closed disputes yet.", body: "Resolved and rejected disputes are kept here with their outcome." }} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
