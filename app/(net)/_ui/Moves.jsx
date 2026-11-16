// One row of a call sheet: whose move it is, shown by shape and fill (never red/green).
const GLYPH = {
  mine: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  wait: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" /><path d="M8 5v3l2 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  done: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 8.4 2.6 2.6L12 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};
const WORD = { mine: "Your move", wait: "Waiting", done: "Done" };

export function MoveRow({ kind = "wait", href, title, sub, cta, right = null }) {
  const body = (
    <>
      <span className="move__glyph" title={WORD[kind]}>{GLYPH[kind]}</span>
      <span style={{ minWidth: 0 }}>
        <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{WORD[kind]}: </span>
        <span className="move__t" style={{ display: "block" }}>{title}</span>
        {sub && <span className="move__s" style={{ display: "block" }}>{sub}</span>}
      </span>
      {right ?? (cta && <span className="move__cta">{cta} →</span>)}
    </>
  );
  return href ? <a className={`move move--${kind}`} href={href}>{body}</a> : <div className={`move move--${kind}`}>{body}</div>;
}

export function AllClear({ children }) {
  return <div className="allclear">{children}</div>;
}
