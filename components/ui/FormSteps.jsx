// Long forms: a progress header (FormSteps) and a sticky live-summary rail (SummaryRail).
// Both are presentational; the page decides the current step and the summary values (from searchParams,
// saved draft rows, or a small 'use client' leaf that mirrors form fields if live updates are essential).
import { cx } from "./rich";

/**
 * FormSteps({ steps, current, label })
 * steps: ['Brief', 'Creators', 'Budget'] or [{ label, href? }]. current: 0-based index of the step in progress.
 * Steps before `current` read as done; steps with an href are links (use for going back).
 */
export function FormSteps({ steps = [], current = 0, label = "Form progress" }) {
  const list = steps.map((s) => (typeof s === "string" ? { label: s } : s));
  const now = list[current];
  return (
    <nav className="ui-steps" aria-label={label}>
      <p className="ui-steps__cap">Step {Math.min(current + 1, list.length)} of {list.length}{now ? <> · <b>{now.label}</b></> : null}</p>
      <ol style={{ "--n": list.length || 1 }}>
        {list.map((s, i) => {
          const st = i < current ? "done" : i === current ? "now" : "";
          const inner = <><span className="ui-steps__n">{String(i + 1).padStart(2, "0")}</span><span className="ui-steps__l">{s.label}</span></>;
          return (
            <li key={i} className={st} aria-current={st === "now" ? "step" : undefined}>
              {s.href && i !== current ? <a href={s.href}>{inner}</a> : <span>{inner}</span>}
              <span className="ui-sr"> ({st === "done" ? "done" : st === "now" ? "current step" : "to do"})</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * SummaryRail({ title, items, total, children })
 * items: [{ label, value }] (value '' or null shows "Not set"). total: { label, value } shown large.
 * children: extra content under the list (a note, the submit button: keep one gold CTA per view).
 * Sticky beside the form on wide screens; an ordinary card when the layout stacks.
 */
export function SummaryRail({ title = "Summary", items = [], total, children, className }) {
  return (
    <aside className={cx("ui-summary", className)} aria-label={title}>
      <h2 className="ui-summary__title">{title}</h2>
      <dl className="ui-summary__list">
        {items.map((it, i) => (
          <div key={i} className="ui-summary__row">
            <dt>{it.label}</dt>
            <dd>{it.value === "" || it.value == null ? <span className="ui-dim">Not set</span> : it.value}</dd>
          </div>
        ))}
      </dl>
      {total && <div className="ui-summary__total"><span>{total.label}</span><b>{total.value}</b></div>}
      {children && <div className="ui-summary__foot">{children}</div>}
    </aside>
  );
}
