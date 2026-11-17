import { nextMove } from "@/lib/net/moves";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import TeamShell from "../_ui/TeamShell";
import Flash, { flashUrl } from "../_ui/flash";
import { requireTeam } from "./_guard";
import { env } from "@/lib/net/env";
import { newToken } from "@/lib/net/tokens";
import { audit } from "@/lib/net/security";
import { inr } from "@/lib/net/creators";
import { formatIST } from "@/lib/net/brief";
import { DEMO_INSERTS, DEMO_DELETES } from "./demo";
import { inrKpi, inrFull } from "@/components/team/labels";
import { loadDashboard, monthSeries, weekSeries, stageGroups, buildEvents, buildNeeds, moneyMoving, dealOfDay, greeting, longDay, shortDay, parseWhen, inrShort, istDayStart } from "@/lib/net/dashboard";
import { reminderCfg } from "@/lib/net/jobs";
import { TopBar, BigFigure, DealCard, Stat, MoneyStrip, NeedsTable, WeekList } from "@/components/dash/Parts";
import { Bars, Donut, Spark, Split, ringColor } from "@/components/dash/Charts";
import Clock from "@/components/dash/Clock";

export const metadata = { title: "Network overview", robots: { index: false, follow: false } };

async function loadDemo() {
  "use server";
  // Demo rows live in the same database as real data, so only an owner can load or remove them.
  const me = await requireTeam("owner");
  // A fresh shortlist token each time, so no demo link is guessable from the source code.
  const token = newToken() + newToken();
  for (const s of DEMO_DELETES) await env.DB.prepare(s).run();
  for (const s of DEMO_INSERTS) await env.DB.prepare(s.replaceAll("__DEMO_TOKEN__", token)).run();
  await audit({ kind: "team", id: me.email }, "demo.load", null, null, null);
  redirect(flashUrl("/team", "ok", "Demo data loaded: one campaign, four creators, three deals. Everything is named DEMO."));
}

async function removeDemo() {
  "use server";
  const me = await requireTeam("owner");
  for (const s of DEMO_DELETES) await env.DB.prepare(s).run();
  await audit({ kind: "team", id: me.email }, "demo.remove", null, null, null);
  redirect(flashUrl("/team", "ok", "Demo data removed."));
}

export default async function Page({ searchParams }) {
  const me = await requireTeam();
  const one = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first().catch(() => null)) ?? {};
  const many = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results ?? [];
  // Start of this calendar month in Indian time, as a UTC instant (1 Nov 00:00 IST = 31 Oct 18:30 UTC).
  const ist = new Date(Date.now() + 5.5 * 36e5);
  const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 36e5).toISOString();

  const k = await one(`SELECT
      (SELECT COUNT(*) FROM campaigns WHERE status='open') open_n,
      (SELECT COUNT(*) FROM campaigns WHERE status='pending') pending_n,
      (SELECT COUNT(*) FROM campaign_applications WHERE created_at >= datetime('now','-7 days')) apps_week,
      (SELECT COUNT(*) FROM creator_deals WHERE stage='live') live_n,
      (SELECT COUNT(*) FROM creators WHERE status <> 'blacklisted') creators_n,
      (SELECT COUNT(*) FROM creator_accounts) accounts_n,
      (SELECT COALESCE(SUM(amount_paise),0) FROM finance_ledger WHERE kind='creator_payout_sent' AND at >= ?::timestamptz) paid_month_paise,
      (SELECT COUNT(*) FROM creators WHERE id LIKE 'demo-%') demo_n,
      (SELECT COUNT(*) FROM bypass_reports WHERE status='open') reports_n`, monthStart);

  // Briefs that still owe the client a shortlist (oldest promise first).
  const waiting = await many(`SELECT k.id, k.title, k.brand, k.client_company, k.shortlist_due, k.status, k.created_at,
      (SELECT COUNT(*) FROM campaign_applications a WHERE a.campaign_id=k.id AND a.status IN ('shortlisted','accepted')) sl
    FROM campaigns k WHERE k.status IN ('pending','open') ORDER BY COALESCE(k.shortlist_due, k.created_at) ASC LIMIT 40`);
  const owed = waiting.filter((w) => !w.sl);
  const now = Date.now();

  const newApps = await many(`SELECT k.id, k.title, COUNT(*) n, MIN(a.created_at) oldest FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id
    WHERE a.status='new' GROUP BY k.id, k.title ORDER BY COUNT(*) DESC LIMIT 10`);
  // Deal lists come from the deal state machine (lib/net/moves.ts): each open deal sits under its next step.
  const openDeals = await many(`SELECT d.*, c.name, c.handle FROM creator_deals d JOIN creators c ON c.id=d.creator_id
    WHERE d.stage NOT IN ('cancelled','dropped') AND d.pay_status NOT IN ('paid','refunded') ORDER BY d.updated_at ASC LIMIT 300`);
  const byStep = (...steps) => openDeals.filter((d) => { const m = nextMove(d); return m && steps.includes(m.step); });
  const toPay = byStep("approve_payout", "record_payout");
  const toVerify = byStep("verify_live");
  const drafts = byStep("approve_draft");
  const unfunded = byStep("record_funding").filter((d) => d.sow_accepted_at);
  const team = await many("SELECT name, email, role FROM team_users ORDER BY created_at");
  const pitchReqs = await many(`SELECT k.id, k.title, k.client_company, k.budget_total, k.shortlist_due, p.requests FROM campaigns k
    LEFT JOIN creator_pitches p ON p.id=k.pitch_id WHERE k.source='pitch' AND k.status='pending' ORDER BY k.created_at DESC LIMIT 10`);

  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;

  // Dashboard aggregates (read-only) and the pure shapes built from them.
  const dash = await loadDashboard(env.DB, now);
  const fees = monthSeries(dash.booked, now, 12);
  const feeChange = fees.priorTotal > 0 ? ((fees.total - fees.priorTotal) / fees.priorTotal) * 100 : null;
  const moves = openDeals.map((d) => nextMove(d));
  const groups = stageGroups(moves);
  const signups = weekSeries(dash.signups.map((r) => r.created_at), now, 12);
  const signups12 = signups.reduce((a, b) => a + b, 0);
  const appsWaiting = newApps.reduce((a, x) => a + Number(x.n || 0), 0);
  const dayStart = istDayStart(now);
  const week = buildEvents({ openDeals, toPay, drafts, owed, shoots: dash.shoots, from: dayStart, to: dayStart + 7 * 864e5, now, draftDueDays: reminderCfg().draftDueDays });
  const today = week.filter((e) => e.t < dayStart + 864e5);
  const needs = buildNeeds({ toPay, toVerify, unfunded, drafts, newApps, owed, pitchReqs, now, fmt: formatIST });
  const money = moneyMoving({ toPay, openDeals, now });
  const deal = dealOfDay(openDeals, now);
  const dealMove = deal ? nextMove(deal) : null;
  const dealLive = deal ? parseWhen(deal.go_live_date) : null;
  const first = String(me.name || "").trim().split(/\s+/)[0] || String(me.email || "").split(/[@._-]/)[0].replace(/^./, (c) => c.toUpperCase()) || "there";
  const paidMonth = Number(k.paid_month_paise ?? 0) / 100;

  const nPay = toPay.length, nDraft = drafts.length, nChase = unfunded.length;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  return (
    <TeamShell active="home" title="Network <b>overview</b>" email={me.email} role={me.role}>
      <div className="dsh">
        <TopBar crumb="Network overview" day={longDay(now)} action={<a className="dsh-new" href="/team/campaigns#new"><span aria-hidden="true">+</span> New opportunity</a>} />
        <div className="dsh-flash"><Flash sp={searchParams} /></div>
        {Number(k.reports_n) > 0 && (
          <div className="note bad dsh-flash">
            <b>{k.reports_n} open off-platform {Number(k.reports_n) === 1 ? "report" : "reports"}.</b> Someone says they were asked to deal outside Colatch. <a className="link" href="/team/reports">Review reports →</a>
          </div>
        )}

        <div className="dsh-hero">
          <div className="dsh-greet">
            <p className="dsh-eye"><i aria-hidden="true" />{shortDay(now)}<span className="sep" aria-hidden="true" /><span className="ist">{greeting(now) === "Good morning" ? "Morning" : greeting(now) === "Good afternoon" ? "Afternoon" : "Evening"} desk · Indian time</span></p>
            <h1 className="dsh-greet__h">{greeting(now)}, <span className="nm">{first}</span>.</h1>
            {money.span === "none" ? (
              <div className="dsh-figure"><span className="dsh-figure__lead">Today is looking like a quiet day.</span></div>
            ) : (
              <div className="dsh-figure">
                <span className="dsh-figure__lead">{money.span === "day" ? "Today" : "This week"} is looking like a</span>
                <BigFigure value={money.total} />
                <span className="dsh-figure__lead">{money.span}.</span>
              </div>
            )}
            <p className="dsh-figure__note">
              {money.span === "day" && <>Creator fees on {plural(money.payN, "payout", "payouts")} ready to send or approve{money.liveN ? <> and {plural(money.liveN, "post", "posts")} going live today</> : null}.</>}
              {money.span === "week" && <>Nothing moves today. Creator fees on {plural(money.liveN, "post", "posts")} going live in the next 7 days.</>}
              {money.span === "none" && <>No payouts are ready and no posts go live in the next 7 days.</>}
            </p>
            <p className="dsh-greet__sub">
              {nPay + nDraft + nChase === 0 ? <>Nothing urgent: no payouts, drafts or unpaid brands. </> : <>
                <a className="hl" href="/team?need=money#needs">{plural(nPay, "payout", "payouts")}</a> to send, <a className="hl" href="/team?need=drafts#needs">{plural(nDraft, "draft", "drafts")}</a> waiting, <a className="hl" href="/team?need=money#needs">{plural(nChase, "brand", "brands")}</a> to chase. </>}
              {appsWaiting + owed.length > 0 && <><a className="hl" href="/team?need=briefs#needs">{appsWaiting ? plural(appsWaiting, "applicant", "applicants") + " to review" : plural(owed.length, "shortlist", "shortlists") + " owed"}</a>{appsWaiting && owed.length ? <> and {plural(owed.length, "shortlist", "shortlists")} owed</> : null}. </>}
              Everything else can wait.
            </p>
            <div className="dsh-greet__cta">
              <a className="btn-foil" href="/team/crm">Open the money queue <span aria-hidden="true">→</span></a>
              <a className="dsh-ghost" href="/team/creators">See the network <span aria-hidden="true">→</span></a>
            </div>
          </div>
          <DealCard deal={deal} move={dealMove} goLive={dealLive ? shortDay(dealLive.t) : null} />
        </div>

        <Clock today={today} week={week} now={now} />

        <div className="dsh-stats">
          <Stat featured label="Fees booked · last 12 months" period={fees.months[11].label + " ’" + String(fees.months[11].year).slice(2)}
            foot={<span title={inrFull(paidMonth)}>{inrKpi(paidMonth)} paid to creators this month, from the ledger</span>}>
            <div className="dsh-stat__row">
              <div className="dsh-stat__value gold" title={inrFull(fees.total)}>{inrShort(fees.total)}</div>
              {feeChange != null ? <span className="dsh-delta">{feeChange >= 0 ? "↑" : "↓"} {Math.abs(feeChange).toFixed(1)}%<small>vs prior 12 months</small></span> : <span className="dsh-delta quiet">First 12 months</span>}
            </div>
            <Bars months={fees.months} label="Creator fees booked per month, terms accepted" fmt={inrFull} />
          </Stat>
          <Stat label="Open deals" foot={<><span className="dsh-chip">{k.live_n ?? 0} live</span> posts up, payout pending</>}>
            <div className="dsh-stat__split">
              <div className="dsh-stat__value">{openDeals.length}</div>
              <Donut parts={groups} label="Open deals by stage" />
            </div>
            <ul className="dsh-legend">{groups.map((g, i) => <li key={g.key}><i style={{ background: ringColor(i) }} />{g.label} <b>{g.n}</b></li>)}</ul>
          </Stat>
          <Stat label="Applicants this week" period={`${k.open_n ?? 0} open`}>
            <div className="dsh-stat__value">{k.apps_week ?? 0}</div>
            <Split label="Briefs and applicants" parts={[
              { label: "New to review", n: appsWaiting, href: "/team/campaigns" },
              { label: "Shortlists owed", n: owed.length, href: "/team/campaigns" },
              { label: "Open briefs", n: Number(k.open_n ?? 0), href: "/team/campaigns" },
              { label: "To approve", n: Number(k.pending_n ?? 0), href: "/team/campaigns" },
            ]} />
          </Stat>
          <Stat label="Creators" period={`${k.accounts_n ?? 0} with login`} foot={<><span className="dsh-chip">+{signups12}</span> joined in 12 weeks</>}>
            <div className="dsh-stat__value">{k.creators_n ?? 0}</div>
            <Spark values={signups} label="Creators joined per week, last 12 weeks" />
          </Stat>
        </div>

        <MoneyStrip rows={dash.ledger} now={now} paidMonth={paidMonth} />

        <div className="dsh-cols">
          <NeedsTable needs={needs} now={now} filter={String(searchParams?.need ?? "")} links={[
            ...(toPay.length + toVerify.length + unfunded.length + drafts.length > 0 ? [{ href: "/team/crm", label: "All deals in the CRM" }] : []),
            ...(newApps.length + owed.length + pitchReqs.length > 0 ? [{ href: "/team/campaigns", label: "All briefs" }] : []),
          ]} />
          <div className="dsh-side">
            <WeekList events={week} now={now} />
            <section className="dsh-card" aria-labelledby="dsh-team-h">
              <div className="dsh-card__head"><div><h2 id="dsh-team-h" className="dsh-card__title"><span className="dsh-dot" aria-hidden="true" />Team</h2><p className="dsh-card__sub">{plural(team.length, "member", "members")}</p></div><a className="dsh-more" href="/team/members">Manage</a></div>
              <div className="dsh-team">
                <ul className="dsh-team__list">{team.map((t) => <li key={t.email}><span className="dsh-av" aria-hidden="true">{String(t.name || t.email || "?").trim()[0]?.toUpperCase()}</span><span className="who"><b>{t.name || t.email}</b><span>{t.role}</span></span></li>)}</ul>
                <a className="btn sm" href="/team/members">Manage members and roles</a>
                <div className="lbl dsh-team__lbl">Share links</div>
                <p className="small dsh-team__p">Brands post a brief: <code className="k">{origin}/brief</code></p>
                <p className="small dsh-team__p">Creators join free: <code className="k">{origin}/join</code></p>
                {me.role === "owner" && <><div className="lbl dsh-team__lbl">Demo data</div>
                <p className="hint dsh-team__p">One festive Bhangra campaign with four creators and three deals (paid, live, draft in review), so you can click through every screen. All rows are named DEMO and ids start with demo-.</p>
                <div className="row">
                  <form action={loadDemo}><button className="btn sm">{k.demo_n ? "Reload demo data" : "Load demo data"}</button></form>
                  {k.demo_n > 0 && <form action={removeDemo}><button className="btn sm danger">Remove demo data</button></form>}
                  {k.demo_n > 0 && <a className="btn sm" href="/team/campaigns/demo-camp-1">Open demo campaign</a>}
                </div></>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </TeamShell>
  );
}
