// Empty and inline states. Shape + words, never red/green: a dashed outline for "nothing yet", a ring for
// loading (static when people ask for less motion), a diamond for a problem, a circle for a note.
import { cx } from "./rich";

/** EmptyState({ title, body, action }) — action: link(s)/button(s) node. */
export default function EmptyState({ title = "Nothing here yet.", body, action, className }) {
  return (
    <div className={cx("ui-empty", className)}>
      <span className="ui-empty__glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="4" y="5" width="16" height="14" rx="2.5" strokeDasharray="3 3" /><path d="M9 12h6" /></svg>
      </span>
      <p className="ui-empty__title">{title}</p>
      {body && <p className="ui-empty__body">{body}</p>}
      {action && <div className="ui-empty__act">{action}</div>}
    </div>
  );
}

const KIND = {
  loading: { label: "Loading", role: "status" },
  error: { label: "Couldn't finish", role: "alert" },
  info: { label: "Note", role: "note" },
};

/** InlineState({ kind: 'loading'|'error'|'info', label?, children }) — a one-line state inside a card or form. */
export function InlineState({ kind = "info", label, children, className }) {
  const k = KIND[kind] || KIND.info;
  return (
    <div className={cx("ui-state", `ui-state--${kind}`, className)} role={k.role} aria-live={kind === "loading" ? "polite" : undefined}>
      <span className="ui-state__g" aria-hidden="true" />
      <p className="ui-state__t"><b>{label || k.label}</b>{children ? <> · {children}</> : null}</p>
    </div>
  );
}
