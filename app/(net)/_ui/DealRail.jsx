// The six-step deal progress rail (ported from DealRail.astro). Props: d (deal row), side ('creator' | 'team' | 'brand').
// The list uses .deal-rail, not .rail, so it never picks up the team sidebar's .rail styles.
import { RAIL, railIndex, nextStep } from "@/lib/net/deal";

const CSS = `
.rail-wrap{background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh-2);padding:18px 20px}
.rail-wrap .deal-rail{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.rail-wrap .deal-rail li{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;font-size:12px;color:var(--ink-4)}
.rail-wrap .deal-rail li::before{content:"";position:absolute;top:14px;left:-50%;right:50%;height:2px;background:var(--line-3);z-index:0}
.rail-wrap .deal-rail li:first-child::before{display:none}
.rail-wrap .deal-rail li.done::before,.rail-wrap .deal-rail li.now::before{background:var(--p700)}
.rail-wrap .deal-rail i{position:relative;z-index:1;font-style:normal;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;background:var(--ivory-2);color:var(--ink-4);border:2px solid var(--line-3)}
.rail-wrap .deal-rail li.done i{background:var(--p900);color:#fff;border-color:var(--p900)}
.rail-wrap .deal-rail li.done span{color:var(--ink-2)}
.rail-wrap .deal-rail li.now i{border-color:var(--gold);color:var(--gold-deep);box-shadow:0 0 0 4px rgba(232,184,75,.18)}
.rail-wrap .deal-rail li.now span{color:var(--p900);font-weight:600}
.rail-wrap .next{margin-top:16px;padding:10px 14px;border-radius:10px;background:var(--ivory-2);font-size:13.5px;color:var(--ink-2)}
.rail-wrap .next.mine{background:rgba(232,184,75,.14);color:#5b3c0a;font-weight:600}
@media(max-width:640px){.rail-wrap .deal-rail{grid-template-columns:repeat(3,1fr);row-gap:16px}.rail-wrap .deal-rail li:nth-child(4)::before{display:none}}
`;

export default function DealRail({ d, side }) {
  const at = railIndex(d);
  const n = nextStep(d);
  const mine = n.who === side;
  const cls = (i) => (i > at ? (i === at + 1 ? "now" : "") : "done");
  const mark = (i) => (i > at ? String(i + 1) : "✓");
  const labels = RAIL.map((r) => (side !== "creator" && r.key === "paid" ? "Creator paid" : r.label));
  return (
    <div className="rail-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <ol className="deal-rail">
        {RAIL.map((r, i) => <li key={r.key} className={cls(i)}><i>{mark(i)}</i><span>{labels[i]}</span></li>)}
      </ol>
      <div className={`next ${mine ? "mine" : ""}`}>{mine ? "Your move: " : "Next: "}{n.text}</div>
    </div>
  );
}
