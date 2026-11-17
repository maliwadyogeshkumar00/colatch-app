// "Today's clock": today's dated work on an 8 AM–11 PM IST rail with a NOW marker.
// Events without a time of day (most go-live and shoot dates are calendar days) sit in an "All day" row,
// so no time is invented for them. When today has nothing, the next 7 days are shown instead.
import { clockPct, clockText, shortDay, ist, istDayStart, EVENT_TAG, CLOCK_FROM, CLOCK_TO } from "@/lib/net/dashboard";

const KINDS = ["live", "draft", "pay", "shoot", "brief"];
const HOURS = [8, 11, 14, 17, 20, 23];
const hourText = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

function Legend() {
  return (
    <ul className="dsh-clock__legend" aria-label="Key">
      {KINDS.map((k) => <li key={k}><i className={`dsh-pin dsh-pin--${k}`} aria-hidden="true" />{EVENT_TAG[k]}</li>)}
    </ul>
  );
}

export default function Clock({ today, week, now }) {
  const timed = today.filter((e) => !e.allDay);
  const allDay = today.filter((e) => e.allDay);
  const p = ist(now);
  const nowH = p.h + p.min / 60;
  const showNow = nowH >= CLOCK_FROM && nowH <= CLOCK_TO;

  if (!today.length) {
    const start = istDayStart(now);
    const days = Array.from({ length: 7 }, (_, i) => {
      const from = start + i * 864e5;
      return { from, items: week.filter((e) => e.t >= from && e.t < from + 864e5) };
    });
    return (
      <section className="dsh-clock" aria-labelledby="dsh-clock-h">
        <div className="dsh-clock__head">
          <h2 id="dsh-clock-h" className="dsh-clock__title">Next 7 days <span className="dsh-now"><i aria-hidden="true" />Nothing on the clock today</span></h2>
          <Legend />
        </div>
        <ol className="dsh-week7">
          {days.map((d, i) => (
            <li key={d.from} className={d.items.length ? "has" : ""}>
              <div className="dsh-week7__day">{i === 0 ? "Today" : shortDay(d.from).split(" ").slice(0, 2).join(" ")}</div>
              {d.items.length === 0 ? <div className="dsh-week7__none">—</div> : <>
                {d.items.slice(0, 2).map((e, j) => <a key={j} href={e.href} className="dsh-week7__ev"><i className={`dsh-pin dsh-pin--${e.kind}`} aria-hidden="true" /><span>{e.title}</span></a>)}
                {d.items.length > 2 && <div className="dsh-week7__more">+{d.items.length - 2} more</div>}
              </>}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  // Labels that would collide on one line drop to a second row.
  let lastPct = [-100, -100];
  const placed = timed.map((e) => {
    const pct = clockPct(e.t);
    const row = pct - lastPct[0] >= 12.5 ? 0 : pct - lastPct[1] >= 12.5 ? 1 : 0;
    lastPct[row] = pct;
    return { e, pct, row };
  });
  return (
    <section className="dsh-clock" aria-labelledby="dsh-clock-h">
      <div className="dsh-clock__head">
        <h2 id="dsh-clock-h" className="dsh-clock__title">Today’s clock <span className="dsh-now"><i aria-hidden="true" />Now {clockText(now)} IST</span></h2>
        <Legend />
      </div>
      {timed.length > 0 && (
        <div className="dsh-rail" aria-hidden="true">
          <div className="dsh-rail__line" />
          {showNow && <div className="dsh-rail__now" style={{ left: `${clockPct(now)}%` }}><span>Now</span></div>}
          {placed.map(({ e, pct, row }, i) => (
            <a key={i} href={e.href} tabIndex={-1} className={`dsh-rail__ev${row ? " r2" : ""}`} style={{ left: `${pct}%` }}>
              <i className={`dsh-pin dsh-pin--${e.kind}`} />
              <span className="t">{clockText(e.t)}</span>
              <span className="l">{e.title}</span>
            </a>
          ))}
          <div className="dsh-rail__hours">{HOURS.map((h) => <span key={h} style={{ left: `${((h - CLOCK_FROM) / (CLOCK_TO - CLOCK_FROM)) * 100}%` }}>{hourText(h)}</span>)}</div>
        </div>
      )}
      {/* The same events as a list: read by screen readers, and the layout on phones. */}
      <ul className={`dsh-clock__list${timed.length ? " has-rail" : ""}`}>
        {timed.map((e, i) => <li key={`t${i}`}><span className="tm">{clockText(e.t)}</span><i className={`dsh-pin dsh-pin--${e.kind}`} aria-hidden="true" /><a href={e.href}>{e.title}</a></li>)}
      </ul>
      {allDay.length > 0 && (
        <div className="dsh-allday">
          <span className="dsh-allday__k">All day</span>
          {allDay.slice(0, 8).map((e, i) => <a key={i} href={e.href} className="dsh-allday__ev"><i className={`dsh-pin dsh-pin--${e.kind}`} aria-hidden="true" />{e.title}</a>)}
          {allDay.length > 8 && <span className="dsh-allday__more">+{allDay.length - 8} more in This week</span>}
        </div>
      )}
    </section>
  );
}
