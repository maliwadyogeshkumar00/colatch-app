// One table for every list of records. Desktop: a paper card with a sticky header, numeric columns right-aligned
// in tabular figures, rows that open a record when rowHref is given. Phones (≤640px): the existing
// `.tbl.stack` card pattern from net.css (first cell = card title, `primary` cells next, then "label  value" lines
// from data-label). Tablets: the table scrolls sideways inside its card.
import EmptyState from "./EmptyState";
import { cx } from "./rich";

/**
 * DataTable({ columns, rows, rowHref?, rowKey?, empty?, caption?, label? })
 * columns: [{ key, label, align?: 'left'|'right'|'center', num?: bool, primary?: bool, hidePhone?: bool,
 *             width?: number|string, render?: (row, i) => node, className?: string }]
 *  - the FIRST column is the row's title (and its link when rowHref is set: keep other links out of it)
 *  - primary: on phones this cell sits right after the title (status, amount, the row's action)
 *  - num: right-aligned tabular figures (same as align:'right')
 * rowHref: (row) => href. The title cell becomes a link that covers the whole row; buttons, selects and links
 *          in other cells stay clickable on their own.
 * empty: a node, or { title, body, action } for EmptyState, shown when rows is empty.
 * scroll: for very wide tables (7+ columns): always scroll sideways inside the card. The header is then
 *         not sticky (a sticky header needs the card to not clip). Default: sticky header on desktop.
 */
export default function DataTable({ columns = [], rows = [], rowHref, rowKey, empty, caption, label, scroll = false, className }) {
  if (!rows.length) {
    const e = empty && typeof empty === "object" && !("$$typeof" in empty) && !Array.isArray(empty) ? <EmptyState {...empty} /> : empty || <EmptyState title="Nothing here yet." />;
    return <div className={cx("ui-table-wrap", "ui-table-wrap--empty", className)}>{e}</div>;
  }
  const alignOf = (c) => (c.num ? "right" : c.align || "left");
  return (
    <div className={cx("ui-table-wrap", "scroll-x", scroll && "ui-table-wrap--scroll", className)}>
      <table className="tbl stack ui-table" aria-label={caption ? undefined : label}>
        {caption && <caption className="ui-sr">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key || i} scope="col" style={c.width ? { width: c.width } : undefined}
                className={cx(alignOf(c) === "right" && "num", alignOf(c) === "center" && "ui-c", c.hidePhone && "ui-hide-sm", c.className)}>
                {c.labelHidden ? <span className="ui-sr">{c.label}</span> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const href = rowHref ? rowHref(r) : null;
            return (
              <tr key={rowKey ? rowKey(r, ri) : (r?.id ?? ri)} className={href ? "ui-linked" : undefined}>
                {columns.map((c, ci) => {
                  const v = c.render ? c.render(r, ri) : r?.[c.key];
                  const first = ci === 0;
                  const a = alignOf(c);
                  return (
                    <td key={c.key || ci}
                      data-label={first ? undefined : (c.labelHidden ? "" : (typeof c.label === "string" ? c.label : ""))}
                      className={cx(first && "first ui-td-title", c.primary && !first && "key", a === "right" && "num", a === "center" && "ui-c", c.hidePhone && "ui-hide-sm", c.className)}>
                      {first && href ? <a className="ui-rowlink" href={href}>{v}</a> : (v ?? <span className="ui-dim">—</span>)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cell({ eyebrow, title, sub }) — a record's title cell: small caps line, bold name, a line of tags or facts. */
export function Cell({ eyebrow, title, sub }) {
  return (
    <span className="ui-cell">
      {eyebrow && <span className="ui-cell__eb">{eyebrow}</span>}
      <span className="ui-cell__t">{title}</span>
      {sub && <span className="ui-cell__sub">{sub}</span>}
    </span>
  );
}

/** Figure({ value, note, title }) — a number for a numeric column (Diodrum, tabular) with an optional small note under it. */
export function Figure({ value, note, title }) {
  if (value == null || value === "") return null;
  return <span className="ui-fig" title={title}><b>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</b>{note && <small>{note}</small>}</span>;
}
