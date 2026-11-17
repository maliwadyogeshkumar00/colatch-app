// The Login design: a dark 669 editorial panel on the left (eyebrow, big Diodrum headline with gold emphasis,
// lede, pull-quote, two stats, jali + gold glow) and an ivory form column on the right. On phones the panel
// shrinks to a compact band on top (eyebrow, headline, stats) and the form follows.
// Put it in PublicShell with `flush` so it runs edge to edge: <PublicShell flush><SplitAuth …>{form}</SplitAuth></PublicShell>.
// Any existing <form> (including `form.panel.pad`) works unchanged as children; the card chrome is dropped.
import { rich, cx } from "./rich";

/**
 * SplitAuth({ panel, intro, top, children })
 * panel: { eyebrow, title, lede?, quote?: { text, source }, stats?: [{ value, label, gold? }] }
 *        title supports <b>/<em> for the gold phrase.
 * intro: { eyebrow?, title, sub? } — the form column's heading; title is the page <h1> (<b> = purple).
 * top:   node for the form column's top-right ("New here? Join free").
 */
export default function SplitAuth({ panel = {}, intro, top, children, className }) {
  const stats = (panel.stats || []).slice(0, 2);
  return (
    <div className={cx("ui-auth", className)}>
      <aside className="ui-auth__panel" aria-label="About Colatch">
        <div className="ui-auth__pbody">
          {panel.eyebrow && <p className="ui-auth__eb">{panel.eyebrow}</p>}
          {panel.title && <p className="ui-auth__display">{rich(panel.title)}</p>}
          {panel.lede && <p className="ui-auth__lede">{panel.lede}</p>}
        </div>
        {(panel.quote || stats.length > 0) && (
          <div className="ui-auth__pfoot">
            {panel.quote && (
              <figure className="ui-auth__quote">
                <blockquote>{panel.quote.text}</blockquote>
                {panel.quote.source && <figcaption>{panel.quote.source}</figcaption>}
              </figure>
            )}
            {stats.length > 0 && (
              <dl className="ui-auth__stats">
                {stats.map((s, i) => (
                  <div className="ui-auth__stat" key={i}>
                    <dt>{s.label}</dt>
                    <dd className={s.gold ? "ui-foil" : undefined}>{typeof s.value === "number" ? s.value.toLocaleString("en-IN") : s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </aside>
      <section className="ui-auth__col" aria-labelledby={intro?.title ? "ui-auth-h" : undefined}>
        {top && <div className="ui-auth__top">{top}</div>}
        <div className="ui-auth__form">
          {intro && (
            <div className="ui-auth__intro">
              {intro.eyebrow && <p className="ui-auth__hi"><span className="ui-foil" aria-hidden="true">★</span>{intro.eyebrow}</p>}
              <h1 className="ui-auth__title" id="ui-auth-h">{rich(intro.title)}</h1>
              {intro.sub && <p className="ui-auth__sub">{intro.sub}</p>}
            </div>
          )}
          {children}
        </div>
      </section>
    </div>
  );
}
