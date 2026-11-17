// Server-rendered inline SVG charts for the dashboards. Every mark is drawn to scale from the numbers
// passed in, carries a <title> and an aria-label, and uses Pantone 669 plum shades with one gold accent.

/** Monthly bars, oldest to newest. The newest (current) month is gold, the rest plum. */
export function Bars({ months, label, fmt = (v) => String(v) }) {
  const W = 240, H = 64, gap = 4, n = months.length || 1;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...months.map((m) => m.total));
  const desc = `${label}: ` + months.map((m) => `${m.label} ${m.year} ${fmt(m.total)}`).join(", ");
  return (
    <div className="dsh-bars">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={desc} className="dsh-bars__svg">
        <title>{desc}</title>
        <defs>
          <linearGradient id="dsh-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F4D88A" /><stop offset=".6" stopColor="#C58B2E" /><stop offset="1" stopColor="#8C5E18" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="dsh-bars__base" />
        {months.map((m, i) => {
          const h = m.total > 0 ? Math.max(2, (m.total / max) * (H - 2)) : 0;
          const last = i === n - 1;
          return (
            <rect key={m.key} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx="2" className={last ? "dsh-bars__now" : "dsh-bars__bar"} fill={last ? "url(#dsh-gold)" : undefined}>
              <title>{`${m.label} ${m.year}: ${fmt(m.total)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="dsh-bars__axis" aria-hidden="true">
        {months.map((m, i) => <span key={m.key} className={i === n - 1 ? "now" : ""}>{m.label}</span>)}
      </div>
    </div>
  );
}

const RING = ["var(--p200)", "var(--gold-soft)", "var(--p400)", "var(--p700)", "var(--gold)"];

/** Donut of parts that add up to the whole; the total sits in the middle. */
export function Donut({ parts, label, size = 76 }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  const r = 28, c = 2 * Math.PI * r;
  let off = 0;
  const desc = `${label}: ` + parts.map((p) => `${p.label} ${p.n}`).join(", ") + `, ${total} in all`;
  return (
    <svg className="dsh-donut" width={size} height={size} viewBox="0 0 72 72" role="img" aria-label={desc}>
      <title>{desc}</title>
      <circle cx="36" cy="36" r={r} fill="none" className="dsh-donut__track" strokeWidth="9" />
      {total > 0 && parts.map((p, i) => {
        if (!p.n) return null;
        const len = (p.n / total) * c;
        const el = <circle key={p.key} cx="36" cy="36" r={r} fill="none" style={{ stroke: RING[i % RING.length] }} strokeWidth="9"
          strokeDasharray={`${Math.max(0, len - (parts.filter((x) => x.n).length > 1 ? 1.5 : 0))} ${c}`} strokeDashoffset={-off} transform="rotate(-90 36 36)"><title>{`${p.label}: ${p.n}`}</title></circle>;
        off += len;
        return el;
      })}
      <text x="36" y="40" textAnchor="middle" className="dsh-donut__n">{total}</text>
    </svg>
  );
}
export const ringColor = (i) => RING[i % RING.length];

/** A small line of counts over time; the last point is marked in gold. */
export function Spark({ values, label }) {
  const W = 240, H = 40, n = values.length;
  const max = Math.max(1, ...values);
  const x = (i) => (n <= 1 ? W : (i / (n - 1)) * W);
  const y = (v) => H - 3 - (v / max) * (H - 8);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const desc = `${label}: ${values.join(", ")} (oldest week first)`;
  return (
    <svg className="dsh-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={desc}>
      <title>{desc}</title>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} className="dsh-spark__area" />
      <path d={line} className="dsh-spark__line" vectorEffect="non-scaling-stroke" />
      <circle cx={x(n - 1)} cy={y(values[n - 1] || 0)} r="3" className="dsh-spark__dot" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A thin bar split into parts, to scale, with a two-column legend. */
export function Split({ parts, label }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  const desc = `${label}: ` + parts.map((p) => `${p.label} ${p.n}`).join(", ");
  return (
    <div>
      <div className="dsh-split" role="img" aria-label={desc}>
        {total > 0 && parts.map((p, i) => p.n ? <i key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: ringColor(i + 1) }} title={`${p.label}: ${p.n}`} /> : null)}
      </div>
      <ul className="dsh-legend">
        {parts.map((p, i) => <li key={p.label}><i style={{ background: ringColor(i + 1) }} />{p.href ? <a href={p.href}>{p.label}</a> : p.label} <b>{p.n}</b></li>)}
      </ul>
    </div>
  );
}
