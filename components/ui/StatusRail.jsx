// A one-line progress rail: done steps plum, the current step gold, the rest hairline. Generalised from the
// deal rail (app/(net)/_ui/DealRail.jsx now renders through this), using the same `.drail` styles.
// On phones only the current step's label shows; screen readers always hear every step and its state.
import { cx } from "./rich";

const STATE_TEXT = { done: "done", now: "current step", todo: "to do" };

/**
 * StatusRail({ steps, note, eyebrow?, badge?, label?, bare? })
 * steps: [{ label, state: 'done' | 'now' | 'todo' }]
 * eyebrow: defaults to "Step 3 of 8" (or "Complete" when every step is done). Pass "" to hide it.
 * badge: a node for the right of the head, e.g. <Pill tone="mine">Your move</Pill>.
 * note: a line under the rail. bare: no card around it (to sit inside another card).
 */
export default function StatusRail({ steps = [], note, eyebrow, badge, label = "Progress", bare = false, className }) {
  const nowAt = steps.findIndex((s) => s.state === "now");
  const allDone = steps.length > 0 && steps.every((s) => s.state === "done");
  const eb = eyebrow !== undefined ? eyebrow : nowAt >= 0 ? `Step ${nowAt + 1} of ${steps.length}` : allDone ? "Complete" : "";
  return (
    <section className={cx(!bare && "panel pad", "ui-rail", className)} aria-label={label}>
      {(eb || badge) && <div className="spread ui-rail__head"><span className="eyebrow">{eb}</span>{badge}</div>}
      <ol className="drail" style={{ "--n": steps.length || 1 }}>
        {steps.map((s, i) => {
          const st = s.state === "done" || s.state === "now" ? s.state : "";
          return (
            <li key={s.key || i} className={st} aria-current={st === "now" ? "step" : undefined}>
              <span>{s.label}<span className="ui-sr"> ({STATE_TEXT[s.state] || STATE_TEXT.todo})</span></span>
            </li>
          );
        })}
      </ol>
      {note && <p className="drail-cap ui-rail__note">{note}</p>}
    </section>
  );
}
