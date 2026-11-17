// The editorial page header from the Colatch Workspace / Roster design: gold-rule eyebrow, Diodrum light
// title with one emphasised phrase, a short sub line, optional breadcrumbs, actions and head stats.
//   variant "plain" (default): ivory, used inside TeamShell. Hides TeamShell's own title bar.
//   variant "hero": the dark 669 band with jali and gold glow. On public / creator / brand pages pass it
//   to PublicShell's `hero` prop so it runs full width: <PublicShell hero={<PageHeader variant="hero" … />}>.
import { rich, cx } from "./rich";

/** Breadcrumb trail. crumbs: [{ label, href? }] or strings; the last one is the current page. */
export function Crumbs({ crumbs }) {
  if (!crumbs?.length) return null;
  const list = crumbs.map((c) => (typeof c === "string" ? { label: c } : c));
  return (
    <nav className="ui-crumbs" aria-label="Breadcrumb">
      <ol>
        {list.map((c, i) => {
          const last = i === list.length - 1;
          return <li key={i}>{c.href && !last ? <a href={c.href}>{c.label}</a> : <span aria-current={last ? "page" : undefined}>{c.label}</span>}</li>;
        })}
      </ol>
    </nav>
  );
}

/** A row of 2–3 headline figures separated by hairlines. items: [{ label, value, unit?, gold?, title? }] */
export function HeadStats({ items, label = "At a glance" }) {
  if (!items?.length) return null;
  return (
    <dl className="ui-hstats" aria-label={label}>
      {items.map((s, i) => (
        <div className="ui-hs" key={i}>
          <dt className="ui-hs__l">{s.label}</dt>
          <dd className="ui-hs__v" title={s.title}>
            <span className={s.gold ? "ui-foil" : undefined}>{fmt(s.value)}</span>{s.unit && <small>{s.unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-IN") : v);

/**
 * PageHeader({ eyebrow, title, sub, crumbs, actions, meta, variant, id })
 * - title: string with optional <b>/<em> emphasis, or a node. Rendered as the page's <h1>.
 * - meta: a node, or an array for HeadStats ([{label, value, unit?, gold?}]).
 * - actions: node(s) for the right of the crumb row (plain) or under the sub line (hero).
 */
export default function PageHeader({ eyebrow, title, sub, crumbs, actions, meta, variant = "plain", id, children }) {
  const hero = variant === "hero";
  const metaNode = Array.isArray(meta) ? <HeadStats items={meta} /> : meta;
  const top = (crumbs?.length || (!hero && actions)) ? (
    <div className="ui-head__top">
      <Crumbs crumbs={crumbs} />
      {!hero && actions && <div className="ui-head__actions">{actions}</div>}
    </div>
  ) : null;
  return (
    <header className={cx("ui-head", hero ? "ui-head--hero" : "ui-head--plain")} id={id}>
      <div className="ui-head__in">
        {top}
        <div className="ui-head__main">
          <div className="ui-head__text">
            {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
            <h1 className="ui-title">{rich(title)}</h1>
            {sub && <p className="ui-sub">{rich(sub)}</p>}
            {hero && actions && <div className="ui-head__cta">{actions}</div>}
            {children}
          </div>
          {metaNode && <div className="ui-head__meta">{metaNode}</div>}
        </div>
      </div>
    </header>
  );
}
