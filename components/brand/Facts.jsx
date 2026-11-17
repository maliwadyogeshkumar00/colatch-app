// Brand and public pages: small presentational pieces shared by the shortlist, receipt, roster and pitch screens.
// Server components, tokens only. Styles: app/net.css block "v2: brand and public pages" (classes v2b-*).

/** Facts({ items, label }) — a label/value list for aside cards. items: [{ label, value }]; empty values are skipped. */
export function Facts({ items = [], label }) {
  const list = items.filter((x) => x && x.value != null && x.value !== "" && x.value !== false);
  if (!list.length) return null;
  return (
    <dl className="v2b-facts" aria-label={label}>
      {list.map((x, i) => <div key={x.label || i}><dt>{x.label}</dt><dd>{x.value}</dd></div>)}
    </dl>
  );
}

/** MiniStats({ items, label }) — a wrapping row of small figures (label above, Diodrum number, note under). */
export function MiniStats({ items = [], label }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <dl className="v2b-mini" aria-label={label}>
      {list.map((x, i) => (
        <div key={x.label || i}>
          <dt>{x.label}</dt>
          <dd><span className="v2b-mini__v" title={x.title}>{x.value}</span>{x.note && <small>{x.note}</small>}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * ShareBar({ parts, label }) — one stacked bar with a legend whose values are already formatted.
 * parts: [{ label, n (number for the width), text (shown value) }]. Plum and gold shades only.
 */
export function ShareBar({ parts = [], label }) {
  const total = parts.reduce((a, p) => a + Math.max(0, Number(p.n) || 0), 0);
  const desc = `${label}: ` + parts.map((p) => `${p.label} ${p.text}`).join(", ");
  return (
    <div className="v2b-share">
      <div className="v2b-share__bar" role="img" aria-label={desc}>
        {total > 0 && parts.map((p, i) => (p.n > 0 ? <i key={p.label} className={`v2b-share__s${i % 4}`} style={{ width: `${(p.n / total) * 100}%` }} /> : null))}
      </div>
      <ul className="v2b-share__legend">
        {parts.map((p, i) => <li key={p.label}><i className={`v2b-share__s${i % 4}`} aria-hidden="true" /><span>{p.label}</span><b>{p.text}</b></li>)}
      </ul>
    </div>
  );
}
