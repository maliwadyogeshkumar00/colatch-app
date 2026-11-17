// Link-based filters: every option is a plain <a href>, so filtering works with no client JS and the
// server page reads the choice from searchParams. The current option carries aria-current="page".
import { cx } from "./rich";

/** A toolbar row that holds FilterChips, a search <form method="get">, sort links or a "Filter" button. */
export function FilterBar({ children, label = "Filters", end }) {
  return (
    <div className="ui-filters" role="group" aria-label={label}>
      <div className="ui-filters__main">{children}</div>
      {end && <div className="ui-filters__end">{end}</div>}
    </div>
  );
}

/**
 * FilterChips({ name, options, current, hrefFor, label })
 * options: [{ value, label, count? }]. current: the selected value (compared as strings).
 * hrefFor(value) builds each link; default is `?${name}=${value}` (and plain `?` for an empty value).
 */
export function FilterChips({ name, options = [], current, hrefFor, label }) {
  const href = hrefFor || ((v) => (v === "" || v == null ? "?" : `?${encodeURIComponent(name)}=${encodeURIComponent(v)}`));
  const cur = current == null ? "" : String(current);
  return (
    <nav className="ui-chips" aria-label={label || `Filter by ${name}`}>
      {options.map((o) => {
        const on = String(o.value ?? "") === cur;
        return (
          <a key={String(o.value)} href={href(o.value)} className={cx("ui-chip", on && "on")} aria-current={on ? "page" : undefined}>
            {o.label}
            {o.count != null && <span className="ui-chip__n"><span className="ui-sr">, </span>{Number(o.count).toLocaleString("en-IN")}</span>}
          </a>
        );
      })}
    </nav>
  );
}
