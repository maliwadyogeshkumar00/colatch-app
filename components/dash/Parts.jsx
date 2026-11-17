// Building blocks of the team home dashboard. Server components only; all numbers are passed in.
import { inrParts, inrShort, ageText, clockText, shortDay, istDayStart, EVENT_TAG, LEDGER_LABEL, parseWhen } from "@/lib/net/dashboard";

const Arrow = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>;

/** Breadcrumb, search (to the influencer finder) and the one solid purple action. */
export function TopBar({ crumb, day, action }) {
  return (
    <div className="dsh-top">
      <nav className="dsh-crumb" aria-label="Breadcrumb"><span>Today</span><span className="sep" aria-hidden="true">/</span><b>{crumb}</b><span className="sep" aria-hidden="true">·</span><span>{day}</span></nav>
      <form className="dsh-search" action="/team/creators" method="get" role="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <label className="dsh-sr" htmlFor="dsh-q">Search creators</label>
        <input id="dsh-q" name="q" type="search" placeholder="Search creators by name, handle, city…" autoComplete="off" />
      </form>
      {action}
    </div>
  );
}

/** ₹ figure in Diodrum light: ₹ as a superscript, the number, then Cr / L. */
export function BigFigure({ value }) {
  const p = inrParts(value);
  return <span className="dsh-big" title={"₹" + Math.round(value).toLocaleString("en-IN")}><span className="dsh-big__n"><sup>₹</sup>{p.num}</span>{p.unit && <span className="dsh-big__u">{p.unit}</span>}</span>;
}

/** The dark 669 card on the right of the hero. */
export function DealCard({ deal, move, goLive }) {
  if (!deal) {
    return (
      <aside className="dsh-focus dsh-focus--empty" aria-label="Deal of the day">
        <div className="dsh-focus__art"><span className="dsh-focus__chip"><span aria-hidden="true">★</span> Deal of the day</span><span className="dsh-focus__num" aria-hidden="true">№ 00</span></div>
        <div className="dsh-focus__body">
          <div className="dsh-focus__sub">No open deals yet</div>
          <div className="dsh-focus__title">The first deal lands here.</div>
          <p className="dsh-focus__loc">Approve a shortlist and create a deal from a campaign; the biggest one going live this week shows up here.</p>
          <div className="dsh-focus__row"><a className="dsh-focus__open" href="/team/campaigns">Open campaigns <Arrow /></a></div>
        </div>
      </aside>
    );
  }
  const who = deal.name || (deal.handle ? "@" + deal.handle : "Creator");
  const initials = who.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <aside className="dsh-focus" aria-label="Deal of the day">
      <div className="dsh-focus__art">
        <span className="dsh-focus__chip"><span aria-hidden="true">★</span> Deal of the day</span>
        <span className="dsh-focus__num" aria-hidden="true">{initials || "№"}</span>
      </div>
      <div className="dsh-focus__body">
        <div className="dsh-focus__sub">{move?.label || "Open deal"}{deal.deliverable ? ` · ${deal.deliverable}` : ""}</div>
        <div className="dsh-focus__title">{deal.brand || "Brand"} <span className="x">×</span> {who}</div>
        <p className="dsh-focus__loc">{move ? move.forTeam : "Deal open"}</p>
        <div className="dsh-focus__row">
          <div className="dsh-focus__stat"><span className="lbl">Creator fee</span><span className="val gold" title={"₹" + Number(deal.fee).toLocaleString("en-IN")}>{inrShort(Number(deal.fee))}</span></div>
          <div className="dsh-focus__stat"><span className="lbl">Go-live</span><span className="val">{goLive || "Not set"}</span></div>
          <a className="dsh-focus__open" href={`/team/deals/${deal.id}`} aria-label={`Open deal: ${deal.brand || "brand"} × ${who}`}>Open <Arrow /></a>
        </div>
      </div>
    </aside>
  );
}

/** A KPI card shell. */
export function Stat({ label, period, children, foot, featured }) {
  return (
    <section className={`dsh-stat${featured ? " dsh-stat--featured" : ""}`} aria-label={label}>
      <div className="dsh-stat__head"><h3 className="dsh-stat__label">{label}</h3>{period && <span className="dsh-stat__period">{period}</span>}</div>
      {children}
      {foot && <div className="dsh-stat__foot">{foot}</div>}
    </section>
  );
}

/** Dark band with the latest ledger rows. */
export function MoneyStrip({ rows, now, paidMonth }) {
  return (
    <section className="dsh-ticker" aria-labelledby="dsh-ticker-h">
      <h2 id="dsh-ticker-h" className="dsh-ticker__label"><i aria-hidden="true" />Money in motion</h2>
      {rows.length === 0 ? <p className="dsh-ticker__empty">No money recorded yet. Brand payments and creator payouts appear here as finance records them.</p> : (
        <div className="dsh-ticker__items">
          {[0, 1].map((copy) => (
            <ol key={copy} className={`dsh-ticker__track${copy ? " dup" : ""}`} aria-hidden={copy ? "true" : undefined}>
              {rows.map((r, i) => {
                const who = r.deal_id ? `${r.name || (r.handle ? "@" + r.handle : "Creator")}${r.brand ? ` × ${r.brand}` : ""}` : (r.ctitle || r.client_company || "General");
                const t = parseWhen(r.at)?.t ?? null;
                const minus = r.kind === "brand_refund_sent" || r.kind === "creator_payout_sent" || r.kind === "referral_payout_sent";
                return (
                  <li key={i} className="dsh-tk">
                    <span className={`dsh-tk__tag k-${r.kind}`}>{LEDGER_LABEL[r.kind] || r.kind}</span>
                    {r.deal_id ? <a href={`/team/deals/${r.deal_id}`} tabIndex={copy ? -1 : undefined}>{who}</a> : <b>{who}</b>}
                    <span className="amt">{r.kind === "adjustment" ? "" : minus ? "−" : "+"}₹{(Number(r.amount_paise) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    <span className="ago">{t ? `${ageText(t, now)} ago` : ""}</span>
                  </li>
                );
              })}
            </ol>
          ))}
        </div>
      )}
      <a className="dsh-ticker__all" href="/team/finance">Ledger{paidMonth != null ? ` · ${inrShort(paidMonth)} paid out this month` : ""} <Arrow /></a>
    </section>
  );
}

const TYPE_CLASS = { payout: "pay", verify: "verify", unpaid: "unpaid", draft: "draft", applicants: "apps", late: "late", owed: "owed", pitch: "pitch" };

/** One table of everything waiting on the team, most urgent first. Becomes cards on phones. */
export const NEED_FILTERS = [
  { key: "", label: "All", types: null },
  { key: "money", label: "Money", types: ["payout", "unpaid", "verify"] },
  { key: "drafts", label: "Drafts", types: ["draft"] },
  { key: "briefs", label: "Briefs", types: ["applicants", "late", "owed", "pitch"] },
];

export function NeedsTable({ needs: all, now, limit = 12, links, filter = "" }) {
  const f = NEED_FILTERS.find((x) => x.key === filter) || NEED_FILTERS[0];
  const needs = f.types ? all.filter((n) => f.types.includes(n.type)) : all;
  const shown = needs.slice(0, limit);
  return (
    <section className="dsh-card" id="needs" aria-labelledby="dsh-needs-h">
      <div className="dsh-card__head">
        <div>
          <h2 id="dsh-needs-h" className="dsh-card__title"><span className="dsh-dot" aria-hidden="true" />Needs you</h2>
          <p className="dsh-card__sub">{needs.length ? `${needs.length} ${needs.length === 1 ? "thing" : "things"} waiting, most urgent first: late shortlists, money, drafts, then applicants.` : "Nothing waiting."}</p>
        </div>
        <nav className="dsh-seg" aria-label="Filter what needs you">
          {NEED_FILTERS.map((x) => {
            const n = x.types ? all.filter((r) => x.types.includes(r.type)).length : all.length;
            return <a key={x.key} href={x.key ? `/team?need=${x.key}#needs` : "/team#needs"} className={x.key === f.key ? "on" : ""} aria-current={x.key === f.key ? "true" : undefined}>{x.label} <span>{n}</span></a>;
          })}
        </nav>
      </div>
      {needs.length === 0 ? f.types ? <div className="dsh-empty"><b>Nothing here.</b> <a className="link" href="/team#needs">See everything that needs you</a>.</div> : <div className="dsh-empty"><b>Nothing waiting.</b> Share the brief link with brands and the join link with creators to get things moving.</div> : (
        <table className="tbl stack dsh-needs">
          <thead><tr><th scope="col">Type</th><th scope="col">Deal or campaign</th><th scope="col">Next step</th><th scope="col" className="num">Amount</th><th scope="col" className="num">Age</th><th scope="col"><span className="dsh-sr">Action</span></th></tr></thead>
          <tbody>
            {shown.map((n) => (
              <tr key={n.key}>
                <td className="first"><span className={`dsh-type dsh-type--${TYPE_CLASS[n.type]}`}>{n.label}</span></td>
                <td className="dsh-needs__what"><a className="dsh-needs__name" href={n.whatHref}>{n.what}</a>{n.sub && <div className="hint">{n.sub}</div>}</td>
                <td className="dsh-needs__next" data-label="Next">{n.next}</td>
                <td className="num" data-label="Amount">{n.amount ? <span className="dsh-amt" title={"₹" + n.amount.toLocaleString("en-IN")}>{inrShort(n.amount)}</span> : <span className="hint">—</span>}</td>
                <td className="num" data-label="Waiting"><span className="dsh-age">{ageText(n.since, now)}</span></td>
                <td className="key dsh-needs__act"><a className="dsh-act" href={n.whatHref}><span className="dsh-act__l">{n.action}</span><span className="dsh-sr dsh-act__for">: {n.what}</span> <Arrow /></a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(needs.length > 0 || links.length > 0) && <div className="dsh-card__foot">
        <span>{needs.length > shown.length ? `Showing ${shown.length} of ${needs.length}` : needs.length ? "That's everything" : ""}</span>
        <span className="dsh-card__links">{links.map((l) => <a key={l.href + l.label} href={l.href}>{l.label} <Arrow /></a>)}</span>
      </div>}
    </section>
  );
}

/** The week's dated work, grouped by day. */
export function WeekList({ events, now }) {
  const start = istDayStart(now);
  const groups = [];
  for (const e of events) {
    const i = Math.floor((e.t - start) / 864e5);
    (groups[i] ||= []).push(e);
  }
  return (
    <section className="dsh-card" aria-labelledby="dsh-week-h">
      <div className="dsh-card__head">
        <div>
          <h2 id="dsh-week-h" className="dsh-card__title"><span className="dsh-dot" aria-hidden="true" />This week</h2>
          <p className="dsh-card__sub">{events.length ? `${events.length} dated ${events.length === 1 ? "item" : "items"} in the next 7 days, Indian time` : "Nothing dated in the next 7 days"}</p>
        </div>
      </div>
      {events.length === 0 ? <div className="dsh-empty">Go-live dates, draft deadlines, shoots and shortlist deadlines appear here as deals and briefs get dates.</div> : (
        <div className="dsh-sched">
          {groups.map((g, i) => g && (
            <div key={i} className="dsh-sched__day">
              <h3 className="dsh-sched__dh">{i === 0 ? "Today" : i === 1 ? "Tomorrow" : shortDay(start + i * 864e5)}</h3>
              <ul>
                {g.slice(0, 6).map((e, j) => (
                  <li key={j} className={`dsh-sch${i === 0 && !e.allDay && e.t <= now && now - e.t < 36e5 ? " now" : ""}`}>
                    <div className="dsh-sch__time">{e.allDay ? <>All<small>day</small></> : <>{clockText(e.t).replace(/ (AM|PM)$/, "")}<small>{clockText(e.t).slice(-2)}</small></>}</div>
                    <div><a className="dsh-sch__title" href={e.href}>{e.title}</a><div className="dsh-sch__sub">{e.sub}</div></div>
                    <span className={`dsh-sch__tag t-${e.kind}`}>{EVENT_TAG[e.kind]}</span>
                  </li>
                ))}
                {g.length > 6 && <li className="dsh-sch__more">+{g.length - 6} more that day</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
