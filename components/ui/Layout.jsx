// Layout primitives. Grid: main column + 340px aside (stacks on phones and tablets), or N equal columns.
// Section: a titled block. Card: a surface in one of three tones. AsideCard: a compact card for the aside.
import { rich, cx } from "./rich";

/**
 * Grid({ aside, children, cols, asideFirst, gap })
 * - aside: node(s) for the 340px right column (≥1081px). On smaller screens it follows the main column,
 *   or comes first with asideFirst.
 * - cols: 2 | 3 | 4 equal columns instead (2-up on tablets, 1-up on phones; 4 stays 2-up on phones).
 */
export function Grid({ aside, children, cols, asideFirst = false, className }) {
  if (cols) return <div className={cx("ui-cols", `ui-cols--${cols}`, className)}>{children}</div>;
  if (!aside) return <div className={cx("ui-grid", className)}><div className="ui-grid__main">{children}</div></div>;
  return (
    <div className={cx("ui-grid", "ui-grid--aside", asideFirst && "ui-grid--aside-first", className)}>
      <div className="ui-grid__main">{children}</div>
      <aside className="ui-grid__aside">{aside}</aside>
    </div>
  );
}

/** Section({ title, sub, actions, id, level, children }) — a heading row (gold dot, title, sub, actions) and its body. */
export function Section({ title, sub, actions, id, level = 2, children, className }) {
  const H = `h${level}`;
  const hid = id ? `${id}-h` : undefined;
  return (
    <section className={cx("ui-sec", className)} id={id} aria-labelledby={hid}>
      {(title || actions) && (
        <div className="ui-sec__head">
          <div className="ui-sec__text">
            {title && <H className="ui-sec__title" id={hid}>{rich(title)}</H>}
            {sub && <p className="ui-sec__sub">{sub}</p>}
          </div>
          {actions && <div className="ui-sec__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Card({ tone, pad, as, label, children })
 * tone: 'paper' (white on ivory) | 'night' (dark 669 with jali, ivory text) | 'gold' (gold-washed paper).
 * pad: true (default) | false | 'lg'. as: element name (default 'div'; use 'section' with a label).
 */
export function Card({ tone = "paper", pad = true, as = "div", label, children, className, id }) {
  const El = as;
  return (
    <El id={id} className={cx("ui-card", `ui-card--${tone}`, pad && "ui-card--pad", pad === "lg" && "ui-card--lg", className)} aria-label={label}>
      {children}
    </El>
  );
}

/** AsideCard({ title, eyebrow, tone, foot, children }) — compact card for the aside column. */
export function AsideCard({ title, eyebrow, tone = "paper", foot, children, className, id, level = 2 }) {
  const H = `h${level}`;
  return (
    <section id={id} className={cx("ui-card", `ui-card--${tone}`, "ui-aside", className)} aria-label={typeof title === "string" ? title : undefined}>
      {(eyebrow || title) && (
        <div className="ui-aside__head">
          {eyebrow && <p className="ui-aside__eb">{eyebrow}</p>}
          {title && <H className="ui-aside__title">{rich(title)}</H>}
        </div>
      )}
      <div className="ui-aside__body">{children}</div>
      {foot && <div className="ui-aside__foot">{foot}</div>}
    </section>
  );
}
