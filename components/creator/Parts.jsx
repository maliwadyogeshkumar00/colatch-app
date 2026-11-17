// Creator-side building blocks (Colatch Workspace look, 375px first). Server components, presentational only:
// pages pass in data they already loaded. Styles live in app/net.css between `/* === v2: creator pages === */`
// and `/* end v2 creator */`; every class starts with cr-.
import { TIERS } from "@/lib/net/score";
import { inrParts } from "@/lib/net/dashboard";
import { rich } from "@/components/ui";

/** "17 Nov 2026" in Indian time for a stored timestamp or a YYYY-MM-DD date. */
export function istDay(v) {
  if (v == null || v === "") return null;
  const s = String(v);
  const dateOnly = /^\d{4}-\d\d-\d\d$/.test(s);
  const t = v instanceof Date ? v.getTime() : Date.parse(s.replace(" ", "T") + (dateOnly || /[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z"));
  if (!Number.isFinite(t)) return s.slice(0, 10);
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: dateOnly ? "UTC" : "Asia/Kolkata" });
}

/** "17 Nov" in Indian time (no year), for tight KPI tiles. */
export function istShort(v) {
  const full = istDay(v);
  return full ? full.replace(/ \d{4}$/, "") : null;
}

/** A rupee figure split into number and unit (lakh/crore), for big Diodrum figures. */
export function Money({ value, className = "" }) {
  const p = inrParts(value);
  return <span className={`cr-money ${className}`} title={"₹" + Math.round(Number(value) || 0).toLocaleString("en-IN")}><span className="cr-money__r" aria-hidden="true">₹</span><span className="ui-sr">₹</span>{p.num}{p.unit && <small> {p.unit}</small>}</span>;
}

/** Where a score sits between its tier and the next one. */
export function tierProgress(s) {
  const i = Math.max(0, TIERS.findIndex((t) => t.tier === s.tier));
  const cur = TIERS[i], nxt = TIERS[i + 1] || null;
  if (!nxt) return { cur, nxt: null, pct: 100, gap: 0 };
  const pct = Math.max(0, Math.min(100, Math.round(((s.score - cur.min) / Math.max(1, nxt.min - cur.min)) * 100)));
  return { cur, nxt, pct, gap: Math.max(0, nxt.min - s.score) };
}

/** Colatch Score ring: plum track, gold arc, Diodrum number. Decorative arc; the number and label carry it. */
export function ScoreRing({ score = 0, size = 112, label = "Colatch Score" }) {
  const r = 44, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="cr-ring" style={{ width: size, height: size }} role="img" aria-label={`${label} ${v} of 100`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id="cr-ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F4D88A" /><stop offset=".55" stopColor="#C58B2E" /><stop offset="1" stopColor="#8C5E18" /></linearGradient></defs>
        <circle cx="50" cy="50" r={r} className="cr-ring__track" />
        {v > 0 && <circle cx="50" cy="50" r={r} className="cr-ring__arc" stroke="url(#cr-ring-g)" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 50 50)" />}
      </svg>
      <span className="cr-ring__n" aria-hidden="true">{v}<small>/100</small></span>
    </div>
  );
}

/** Tier mark + name, plum shades only (Icon gets the gold foil). */
export function TierMark({ tier }) {
  const mark = { Rising: "◆", Trusted: "✦", Gold: "★", Icon: "♛" }[tier] || "◆";
  return <span className={`cr-tier cr-tier--${String(tier || "Rising").toLowerCase()}`}><span aria-hidden="true">{mark}</span>{tier}</span>;
}

/** Progress from this tier to the next, as a bar with both ends named. */
export function TierBar({ s }) {
  const p = tierProgress(s);
  if (!p.nxt) return <p className="cr-tierbar__top">Top tier. Every brand sees you first.</p>;
  return (
    <div className="cr-tierbar">
      <div className="cr-tierbar__ends"><span>{p.cur.tier} · {p.cur.min}</span><span>{p.nxt.tier} · {p.nxt.min}</span></div>
      <div className="cr-tierbar__track" role="progressbar" aria-valuemin={p.cur.min} aria-valuemax={p.nxt.min} aria-valuenow={s.score} aria-label={`Progress to ${p.nxt.tier}`}><i style={{ width: `${p.pct}%` }} /></div>
      <p className="cr-tierbar__gap"><b>{p.gap} {p.gap === 1 ? "point" : "points"}</b> to {p.nxt.tier}</p>
    </div>
  );
}

/** Score summary card for asides: ring, tier, next tier bar, one link. */
export function ScoreCard({ s, href = "/creator/score", linkText = "How the score works" }) {
  return (
    <section className="ui-card ui-card--paper ui-aside cr-scorecard" aria-labelledby="cr-score-h">
      <div className="ui-aside__head"><p className="ui-aside__eb">Colatch Score</p><h2 className="ui-aside__title" id="cr-score-h">You're <b>{s.tier}</b></h2></div>
      <div className="ui-aside__body">
        <div className="cr-scorecard__row"><ScoreRing score={s.score} size={96} /><div style={{ minWidth: 0 }}><TierMark tier={s.tier} /><p className="cr-scorecard__next">{s.next ? s.next.need : "That's the top. Brands see you first."}</p></div></div>
        {s.next && <TierBar s={s} />}
      </div>
      {href && <div className="ui-aside__foot"><a className="link" href={href}>{linkText} →</a></div>}
    </section>
  );
}

/** A big hero figure (Diodrum, gold foil) with a label above and a note below. */
export function HeroFigure({ label, value, note }) {
  return (
    <div className="cr-fig">
      <p className="cr-fig__l">{label}</p>
      <p className="cr-fig__v"><Money value={value} className="ui-foil" /></p>
      {note && <p className="cr-fig__n">{rich(note)}</p>}
    </div>
  );
}

/** Label/value rows for asides and the dark media-kit cards. rows: [{ label, value }] */
export function Facts({ rows, className = "" }) {
  const list = rows.filter((r) => r && r.value != null && r.value !== "");
  if (!list.length) return null;
  return <dl className={`cr-facts ${className}`}>{list.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>;
}
