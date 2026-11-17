// Page-number pagination for long team lists (ledger, outbox, audit log). Plain links, so it works without
// JS, and every other search param (filters) is kept. Server component. Styles: `.adm-pager` in the
// `/* === v2: team money and admin === */` block of app/net.css.

export const PER_PAGE = 25;

/** Reads ?page= safely: a whole number from 1 up, else 1. */
export function pageOf(sp) {
  const n = Number.parseInt(String(sp?.page ?? "1"), 10);
  return Number.isFinite(n) && n >= 1 && n <= 100000 ? n : 1;
}

/** Builds "?a=1&page=2#hash" from the params to keep. page 1 is left out so page one has a clean URL. */
export function pageHref(keep = {}, page = 1, hash = "") {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(keep)) if (v != null && v !== "") q.set(k, String(v));
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return (s ? "?" + s : "?") + (hash ? "#" + hash : "");
}

/**
 * Pager({ page, per, total, keep, hash, noun })
 * "Showing 26–50 of 111 messages" with Newer/Older (or Previous/Next) links and "Page 2 of 5".
 * Renders nothing when everything fits on one page.
 */
export default function Pager({ page = 1, per = PER_PAGE, total = 0, keep = {}, hash = "", noun = "rows", prev = "Previous", next = "Next" }) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (total <= per) return total > 0 ? <p className="adm-pager adm-pager--all">{`All ${total.toLocaleString("en-IN")} ${noun} shown`}</p> : null;
  const p = Math.min(page, pages);
  const a = (p - 1) * per + 1, b = Math.min(total, p * per);
  return (
    <nav className="adm-pager" aria-label={`Pages of ${noun}`}>
      <p className="adm-pager__count">Showing <b>{a.toLocaleString("en-IN")}–{b.toLocaleString("en-IN")}</b> of {total.toLocaleString("en-IN")} {noun}</p>
      <div className="adm-pager__links">
        {p > 1 ? <a className="btn sm" href={pageHref(keep, p - 1, hash)} rel="prev"><span aria-hidden="true">←</span> {prev}</a> : <span className="btn sm" aria-disabled="true"><span aria-hidden="true">←</span> {prev}</span>}
        <span className="adm-pager__of">Page {p} of {pages}</span>
        {p < pages ? <a className="btn sm" href={pageHref(keep, p + 1, hash)} rel="next">{next} <span aria-hidden="true">→</span></a> : <span className="btn sm" aria-disabled="true">{next} <span aria-hidden="true">→</span></span>}
      </div>
    </nav>
  );
}
