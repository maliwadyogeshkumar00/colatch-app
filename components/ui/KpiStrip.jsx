// 2–4 stat tiles in a row (2-up on phones). Figures in Diodrum light; the featured tile's figure is gold foil.
// Pure: pass values already formatted (e.g. inrShort(n)) or plain numbers (shown with Indian digit grouping).
import { Spark } from "@/components/dash/Charts";
import { cx } from "./rich";

const ARROW = { up: "↑", down: "↓", flat: "→" };

/** A trend chip. dir: 'up' | 'down' | 'flat'. Plum, never red/green; the arrow and words carry the meaning. */
export function Trend({ dir = "flat", text }) {
  return <span className={cx("ui-trend", dir === "flat" && "ui-trend--flat")}><span aria-hidden="true">{ARROW[dir] || ""}</span> {text}</span>;
}

/**
 * KpiStrip({ items, label })
 * items: [{ label, value, unit?, foot?, trend?: {dir, text}, spark?: number[], sparkLabel?, href?, featured?, title?, empty? }]
 * empty: a short phrase ("No views yet") shown in place of the figure when there is no number to show yet,
 *        instead of a bare "—". The foot then says what fills it in.
 */
export default function KpiStrip({ items = [], label = "Key figures" }) {
  const list = items.filter(Boolean).slice(0, 4);
  return (
    <ul className="ui-kpis" aria-label={label} style={{ "--n": list.length || 1 }}>
      {list.map((k, i) => {
        const value = typeof k.value === "number" ? k.value.toLocaleString("en-IN") : (k.value ?? "—");
        const body = (
          <>
            <p className="ui-kpi__label">{k.label}</p>
            {k.empty ? <p className="ui-kpi__value ui-kpi__value--empty">{k.empty}</p>
              : <p className="ui-kpi__value" title={k.title}><span className="ui-kpi__num">{value}</span>{k.unit && <span className="ui-kpi__unit">{k.unit}</span>}</p>}
            {k.spark?.length > 1 && <div className="ui-kpi__spark"><Spark values={k.spark} label={k.sparkLabel || k.label} /></div>}
            {(k.trend || k.foot) && <div className="ui-kpi__foot">{k.trend && <Trend {...k.trend} />}{k.foot && <span>{k.foot}</span>}</div>}
          </>
        );
        const cls = cx("ui-kpi", k.featured && !k.empty && "ui-kpi--featured", k.empty && "ui-kpi--empty");
        return <li key={k.key || i}>{k.href ? <a className={cls} href={k.href}>{body}</a> : <div className={cls}>{body}</div>}</li>;
      })}
    </ul>
  );
}
