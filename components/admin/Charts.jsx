// Charts and tiles for the team money, analytics and admin screens. Server components: pure, no data
// fetching, no client JS. Every mark is drawn to scale from the numbers passed in and carries words
// (a <title>, a visible number or an aria-label). Colours: Pantone 669 plum shades and one gold series;
// status is shape + words, never red or green. Styles: app/net.css `/* === v2: team money and admin === */`.

import { parseWhen } from "@/lib/net/dashboard";

/** "17 Nov 2026, 9:43 am" in Indian time from any stored time (Date, ISO, Postgres text, 'YYYY-MM-DD HH:MM:SS' UTC). */
export function stamp(t, { seconds = false, year = true } = {}) {
  const w = parseWhen(t);
  if (!w) return "";
  if (w.allDay) return new Date(w.t + 6 * 36e5).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  return new Date(w.t).toLocaleString("en-IN", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), timeZone: "Asia/Kolkata" });
}

const cx = (...a) => a.filter(Boolean).join(" ");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST = 5.5 * 36e5;

/**
 * monthKeys(now, n): the last n IST calendar months, oldest first, ending with the current one.
 * Each item: { key: "2026-11", label: "Nov", year: 2026 }.
 */
export function monthKeys(now = Date.now(), n = 12) {
  const d = new Date(now + IST);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  return Array.from({ length: n }, (_, i) => {
    const k = m - (n - 1 - i);
    const yy = y + Math.floor(k / 12), mm = ((k % 12) + 12) % 12;
    return { key: `${yy}-${String(mm + 1).padStart(2, "0")}`, label: MON[mm], year: yy };
  });
}

/** Trend chip data for "this period vs last period". Returns null when there is nothing to compare. */
export function versus(cur, prev, what = "last month") {
  cur = Number(cur) || 0; prev = Number(prev) || 0;
  if (!cur && !prev) return null;
  if (!prev) return { dir: "up", text: `new vs ${what}` };
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return { dir: "flat", text: `same as ${what}` };
  return { dir: p > 0 ? "up" : "down", text: `${Math.abs(p)}% vs ${what}` };
}

/**
 * DualBars({ months: [{ key, label, year, a, b }], aLabel, bLabel, fmt, label })
 * Paired monthly bars: series a (plum) and series b (gold) side by side, one shared scale.
 */
export function DualBars({ months = [], aLabel, bLabel, fmt = (v) => String(v), label }) {
  const W = 480, H = 132, n = months.length || 1, slot = W / n, bw = Math.max(3, Math.min(14, slot * 0.32)), gap = 2;
  const max = Math.max(1, ...months.map((m) => Math.max(m.a || 0, m.b || 0)));
  const hOf = (v) => (v > 0 ? Math.max(2, (v / max) * (H - 4)) : 0);
  const sumA = months.reduce((s, m) => s + (m.a || 0), 0), sumB = months.reduce((s, m) => s + (m.b || 0), 0);
  const desc = `${label}: ` + months.map((m) => `${m.label} ${m.year} ${aLabel} ${fmt(m.a || 0)}, ${bLabel} ${fmt(m.b || 0)}`).join("; ");
  return (
    <div className="adm-dbars">
      <ul className="adm-legend" aria-hidden="true">
        <li><i className="adm-key adm-key--a" />{aLabel} <b>{fmt(sumA)}</b></li>
        <li><i className="adm-key adm-key--b" />{bLabel} <b>{fmt(sumB)}</b></li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={desc} className="adm-dbars__svg">
        <title>{desc}</title>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H - f * (H - 4)} y2={H - f * (H - 4)} className="adm-grid" />)}
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="adm-base" />
        {months.map((m, i) => {
          const cx0 = i * slot + slot / 2;
          const ha = hOf(m.a || 0), hb = hOf(m.b || 0);
          return (
            <g key={m.key}>
              {ha > 0 && <rect x={cx0 - bw - gap / 2} y={H - ha} width={bw} height={ha} rx="2" className="adm-bar--a"><title>{`${m.label} ${m.year} · ${aLabel}: ${fmt(m.a)}`}</title></rect>}
              {hb > 0 && <rect x={cx0 + gap / 2} y={H - hb} width={bw} height={hb} rx="2" className="adm-bar--b"><title>{`${m.label} ${m.year} · ${bLabel}: ${fmt(m.b)}`}</title></rect>}
            </g>
          );
        })}
      </svg>
      <div className="adm-axis" aria-hidden="true" style={{ "--n": n }}>
        {months.map((m, i) => <span key={m.key} className={i === n - 1 ? "now" : ""}>{m.label}</span>)}
      </div>
    </div>
  );
}

/**
 * Funnel({ steps: [{ label, n, note?, href? }], label })
 * Horizontal steps scaled to the first step, with the share kept from the step before.
 */
export function Funnel({ steps = [], label }) {
  const top = Math.max(1, Number(steps[0]?.n) || 0);
  return (
    <ol className="adm-funnel" aria-label={label}>
      {steps.map((s, i) => {
        const n = Number(s.n) || 0;
        const prev = i ? Number(steps[i - 1].n) || 0 : null;
        const keep = prev ? Math.round((n / prev) * 100) : null;
        const w = n > 0 ? Math.max(2, (n / top) * 100) : 0;
        const name = s.href ? <a href={s.href}>{s.label}</a> : s.label;
        return (
          <li key={s.label} className={cx("adm-funnel__step", i === steps.length - 1 && "is-last")}>
            <div className="adm-funnel__row">
              <span className="adm-funnel__name">{name}</span>
              <b className="adm-funnel__n">{n.toLocaleString("en-IN")}</b>
            </div>
            <div className="adm-funnel__track" aria-hidden="true"><i style={{ width: `${w}%` }} /></div>
            <p className="adm-funnel__note">{i === 0 ? s.note || "Everyone who started" : prev ? `${keep}% of ${steps[i - 1].label.toLowerCase()}` : `None yet: no ${steps[i - 1].label.toLowerCase()} to convert`}{i > 0 && s.note ? ` · ${s.note}` : ""}</p>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * HBars({ rows: [{ label, a, b?, tag? }], aLabel, bLabel?, label, fmt })
 * A ranked list of horizontal bars. With b, each row draws two thin bars on ONE shared scale (the
 * largest value of either series), so a pair can be compared honestly: 1 brief beside 4 creators
 * draws as a short bar beside a bar four times longer.
 */
export function HBars({ rows = [], aLabel, bLabel, label, fmt = (v) => Number(v || 0).toLocaleString("en-IN") }) {
  const two = bLabel != null;
  const maxA = Math.max(1, ...rows.map((r) => Number(r.a) || 0), ...(two ? rows.map((r) => Number(r.b) || 0) : []));
  const maxB = maxA;
  return (
    <div className="adm-hbars">
      {two && (
        <ul className="adm-legend" aria-hidden="true">
          <li><i className="adm-key adm-key--b" />{aLabel}</li>
          <li><i className="adm-key adm-key--a" />{bLabel}</li>
          <li className="adm-legend__note">both bars on one scale</li>
        </ul>
      )}
      <ul className="adm-hbars__list" aria-label={label}>
        {rows.map((r) => (
          <li key={r.label} className="adm-hbar">
            <div className="adm-hbar__head">
              <span className="adm-hbar__label">{r.label}</span>
              <span className="adm-hbar__vals">
                {two ? <><span><span className="ui-sr">{aLabel}: </span>{fmt(r.a)}</span><span className="adm-hbar__sep" aria-hidden="true">/</span><span><span className="ui-sr">{bLabel}: </span>{fmt(r.b)}</span></> : <b>{fmt(r.a)}</b>}
                {r.tag}
              </span>
            </div>
            <div className="adm-hbar__tracks" aria-hidden="true">
              <i className={two ? "adm-hbar__fill--b" : "adm-hbar__fill--a"} style={{ width: `${(Number(r.a) || 0) > 0 ? Math.max(2, ((Number(r.a) || 0) / maxA) * 100) : 0}%` }} />
              {two && <i className="adm-hbar__fill--a" style={{ width: `${(Number(r.b) || 0) > 0 ? Math.max(2, ((Number(r.b) || 0) / maxB) * 100) : 0}%` }} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SHARE = ["var(--gold)", "var(--p600)", "var(--p300)", "var(--p400)", "var(--p200)"];
/** ShareBar({ parts: [{ label, n, href? }], label, fmt }) — one bar split to scale, with a legend that shows formatted values. */
export function ShareBar({ parts = [], label, fmt = (v) => Number(v || 0).toLocaleString("en-IN") }) {
  const total = parts.reduce((a, p) => a + (Number(p.n) || 0), 0);
  const desc = `${label}: ` + parts.map((p) => `${p.label} ${fmt(p.n)}`).join(", ");
  return (
    <div className="adm-share">
      <div className="adm-share__bar" role="img" aria-label={desc}>
        {total > 0 && parts.map((p, i) => (Number(p.n) > 0 ? <i key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: SHARE[i % SHARE.length] }} title={`${p.label}: ${fmt(p.n)}`} /> : null))}
      </div>
      <ul className="adm-share__legend">
        {parts.map((p, i) => (
          <li key={p.label}><i style={{ background: SHARE[i % SHARE.length] }} aria-hidden="true" />{p.href ? <a href={p.href}>{p.label}</a> : <span>{p.label}</span>}<b>{fmt(p.n)}</b>{total > 0 && <small>{Math.round(((Number(p.n) || 0) / total) * 100)}%</small>}</li>
        ))}
      </ul>
    </div>
  );
}

/** A small check / diamond / dash glyph that carries status by shape. state: 'ok' | 'warn' | 'off'. */
export function StateMark({ state = "ok" }) {
  return (
    <span className={cx("adm-mark", `adm-mark--${state}`)} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="16" height="16">
        {state === "ok" && <path d="M4 8.5 7 11l5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
        {state === "warn" && <path d="M8 2.5 13.5 8 8 13.5 2.5 8Z" fill="currentColor" />}
        {state === "off" && <path d="M4 8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
      </svg>
    </span>
  );
}

const STATE_WORD = { ok: "Working", warn: "Needs a look", off: "Off" };

/**
 * Tiles({ items: [{ label, value?, note?, state: 'ok'|'warn'|'off', stateText?, href? }], label, cols? })
 * Health tiles: a status word with a shape, an optional figure and a line of detail. Phones: one column;
 * tablets: two; desktop: `cols` (default 3).
 */
export function Tiles({ items = [], label, cols = 3, compact = false }) {
  return (
    <ul className={cx("adm-tiles", compact && "adm-tiles--compact")} aria-label={label} style={{ "--cols": cols }}>
      {items.map((t) => {
        const body = (
          <>
            <div className="adm-tile__top">
              <p className="adm-tile__label">{t.label}</p>
              <span className={cx("adm-tile__state", `is-${t.state || "ok"}`)}><StateMark state={t.state || "ok"} />{t.stateText || STATE_WORD[t.state || "ok"]}</span>
            </div>
            {t.value != null && <p className="adm-tile__value">{t.value}</p>}
            {t.note && <p className="adm-tile__note">{t.note}</p>}
          </>
        );
        return (
          <li key={t.key || t.label}>
            {t.href ? <a className={cx("adm-tile", `adm-tile--${t.state || "ok"}`)} href={t.href}>{body}</a> : <div className={cx("adm-tile", `adm-tile--${t.state || "ok"}`)}>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Feed({ items: [{ key, when, title, sub?, meta?, href? }], label }) — a vertical activity feed with a plum spine. */
export function Feed({ items = [], label }) {
  return (
    <ol className="adm-feed" aria-label={label}>
      {items.map((it) => (
        <li key={it.key} className="adm-feed__item">
          <span className="adm-feed__dot" aria-hidden="true" />
          <div className="adm-feed__body">
            <p className="adm-feed__when">{it.when}</p>
            <p className="adm-feed__title">{it.title}</p>
            {it.sub && <div className="adm-feed__sub">{it.sub}</div>}
          </div>
          {it.meta && <div className="adm-feed__meta">{it.meta}</div>}
        </li>
      ))}
    </ol>
  );
}

/** DefList({ items: [{ label, value }] }) — a two-column label/value list for aside cards. */
export function DefList({ items = [] }) {
  return (
    <dl className="adm-dl">
      {items.filter(Boolean).map((it) => (
        <div key={typeof it.label === "string" ? it.label : it.key}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
