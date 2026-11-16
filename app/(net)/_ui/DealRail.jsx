// The deal progress rail. Steps and "whose move" come from lib/net/moves.ts, which asks the deal state
// machine itself, so the rail can never disagree with what the server will allow.
// Props: d (deal row), side ('creator' | 'brand' | 'team'), role (team member's role, for "your move").
import { RAIL, nextMove, stepsDone, isMine } from "@/lib/net/moves";

export default function DealRail({ d, side, role = null }) {
  const m = nextMove(d);
  const done = stepsDone(d);
  const closed = d?.stage === "cancelled" || d?.pay_status === "refunded";
  const mine = m && isMine(m, side === "team" ? { role: role || "viewer" } : side);
  const text = !m ? (closed ? "This deal was cancelled." : "Paid. This deal is complete.")
    : side === "creator" ? m.forCreator : side === "brand" ? m.forBrand : m.forTeam;
  return (
    <section className="panel pad" aria-label="Deal progress">
      <div className="spread" style={{ marginBottom: 12 }}>
        <span className="eyebrow">{closed ? "Closed" : m ? `Step ${Math.min(done + 1, RAIL.length)} of ${RAIL.length}` : "Complete"}</span>
        {m && <span className={`pill ${mine ? "mine" : "ok"}`}>{mine ? "Your move" : "Waiting"}</span>}
        {!m && !closed && <span className="pill good">Done</span>}
      </div>
      <ol className="drail" style={{ "--n": RAIL.length }}>
        {RAIL.map((r, i) => {
          const state = closed ? "" : i < done ? "done" : i === done && m ? "now" : "";
          return (
            <li key={r.step} className={state} aria-current={state === "now" ? "step" : undefined}>
              <span>{side !== "creator" && r.step === "record_payout" ? "Creator paid" : r.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="drail-cap" style={{ margin: "12px 0 0" }}>
        {mine ? <b style={{ color: "var(--head)" }}>Your move: {text}</b> : text}
      </p>
    </section>
  );
}
