// Page through a long list with plain links (no JS), like the "Showing 12 of 51" foot on team home.
// paginate() slices rows the page already loaded; Pager renders "Showing 26–50 of 62" and Previous / Next links.
import { cx } from "./rich";

/** Read ?page= safely and slice. Returns { rows, page, pages, from, to, total, size }. page is 1-based. */
export function paginate(rows = [], pageParam, size = 25) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const n = parseInt(String(Array.isArray(pageParam) ? pageParam[0] : pageParam ?? "1"), 10);
  const page = Number.isFinite(n) ? Math.min(Math.max(1, n), pages) : 1;
  const start = (page - 1) * size;
  const slice = rows.slice(start, start + size);
  return { rows: slice, page, pages, size, total, from: total ? start + 1 : 0, to: start + slice.length };
}

/**
 * Keep every current query param except the ones in `drop`, then set page. hash: optional "#anchor" to land on.
 * pageHref(searchParams, 2, { path: "/team/creators", hash: "#finder" })
 */
export function pageHref(sp, page, { path = "", hash = "", drop = ["ok", "err"] } = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp || {})) {
    if (k === "page" || drop.includes(k)) continue;
    [].concat(v).forEach((x) => x !== "" && x != null && q.append(k, String(x)));
  }
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return `${path}${qs ? `?${qs}` : path ? "" : "?"}${hash}`;
}

/**
 * Pager({ p, hrefFor, noun, label })
 * p: the object from paginate(). hrefFor(page) builds each link (use pageHref to keep the filters).
 * noun: ["campaign", "campaigns"] for "Showing 26–50 of 62 campaigns". Renders nothing for an empty list.
 */
export default function Pager({ p, hrefFor, noun, label = "Pages", className }) {
  if (!p || !p.total) return null;
  const word = noun ? ` ${p.total === 1 ? noun[0] : noun[1]}` : "";
  const text = p.pages > 1 ? `Showing ${p.from.toLocaleString("en-IN")}–${p.to.toLocaleString("en-IN")} of ${p.total.toLocaleString("en-IN")}${word}` : `Showing all ${p.total.toLocaleString("en-IN")}${word}`;
  return (
    <nav className={cx("ui-pager", className)} aria-label={label}>
      <p className="ui-pager__text" aria-live="polite">{text}{p.pages > 1 && <span className="ui-dim"> · page {p.page} of {p.pages}</span>}</p>
      {p.pages > 1 && (
        <div className="ui-pager__links">
          {p.page > 1 ? <a className="btn sm" href={hrefFor(p.page - 1)} rel="prev"><span aria-hidden="true">←</span> Previous</a>
            : <span className="btn sm ui-pager__off" aria-disabled="true"><span aria-hidden="true">←</span> Previous</span>}
          {p.page < p.pages ? <a className="btn sm" href={hrefFor(p.page + 1)} rel="next">Next <span aria-hidden="true">→</span></a>
            : <span className="btn sm ui-pager__off" aria-disabled="true">Next <span aria-hidden="true">→</span></span>}
        </div>
      )}
    </nav>
  );
}
