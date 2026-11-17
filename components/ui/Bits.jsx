// Small pieces: Pill (status), Tag (a fact or requirement), Avatar (initials with the design's gold ring).
// Status is shape + plum/gold shade + words, never red or green.
import { cx } from "./rich";

// tone → existing .pill modifiers in net.css (shape + fill) plus two kit tones.
const PILL = {
  done: "good",      // check mark, soft plum
  wait: "ok",        // dotted ring, outline
  off: "low",        // dash, quiet outline (closed, rejected, paused)
  mine: "mine",      // triangle, solid plum ("your move")
  plum: "plum",      // solid plum
  gold: "ui-pill--gold",   // diamond, gold wash (featured, money)
  quiet: "ui-pill--quiet", // dot, ivory
};

/** Pill({ tone, title, children }) — tone: 'done'|'wait'|'off'|'mine'|'plum'|'gold'|'quiet' (default 'quiet'). */
export function Pill({ tone = "quiet", title, children, className }) {
  return <span className={cx("pill", "ui-pill", PILL[tone] || PILL.quiet, className)} title={title}>{children}</span>;
}

/** Tag({ children }) — a small ivory label for facts and requirements (city, language, follower range). */
export function Tag({ children, className }) {
  return <span className={cx("tag", "ui-tag", className)}>{children}</span>;
}

/** A row of Tags from an array of strings. */
export function Tags({ items = [], max = 6, className }) {
  if (!items.length) return null;
  const shown = items.slice(0, max);
  return <span className={cx("ui-tags", className)}>{shown.map((t) => <Tag key={t}>{t}</Tag>)}{items.length > max && <span className="ui-dim ui-tags__more">+{items.length - max}</span>}</span>;
}

const initialsOf = (s) => String(s || "").replace(/^@/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";

/**
 * Avatar({ name, initials?, src?, size?, ring?, label? })
 * Initials on a plum gradient (three shades chosen from the name, so a list reads as varied) with a gold ring.
 * Decorative by default (aria-hidden); pass label when the avatar is the only place the name appears.
 */
export function Avatar({ name = "", initials, src, size = 40, ring = true, label, className }) {
  const ini = initials || initialsOf(name);
  const shade = [...String(name || ini)].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
  return (
    <span className={cx("ui-ava", `ui-ava--${shade}`, ring && "ui-ava--ring", className)} style={{ "--s": `${size}px` }}
      role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"}>
      {src ? <img src={src} alt="" loading="lazy" /> : ini}
    </span>
  );
}
