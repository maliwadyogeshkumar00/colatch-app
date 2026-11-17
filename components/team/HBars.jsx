// Horizontal bars for comparing a few values (CPV per creator, CPV per tier). Pure and hook-free, so it renders in
// server and client components alike. Bars are drawn to scale from 0; `best` marks one row in gold.
// rows: [{ key, label, value, text, note? }]  (text = the formatted value shown at the end of the bar)
export default function HBars({ rows = [], label, best }) {
  const max = Math.max(0, ...rows.map((r) => Number(r.value) || 0));
  const desc = `${label}: ` + rows.map((r) => `${r.label} ${r.text}`).join(", ");
  return (
    <ol className="tr-hbars" role="img" aria-label={desc}>
      {rows.map((r) => {
        const pct = max > 0 ? Math.max(2, ((Number(r.value) || 0) / max) * 100) : 0;
        return (
          <li key={r.key ?? r.label} className={r.key === best ? "tr-hbars__best" : undefined}>
            <span className="tr-hbars__l">{r.label}{r.note && <small>{r.note}</small>}</span>
            <span className="tr-hbars__track" aria-hidden="true"><span className="tr-hbars__bar" style={{ width: `${pct}%` }} /></span>
            <span className="tr-hbars__v">{r.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
