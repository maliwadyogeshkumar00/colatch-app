// The deal progress rail. Steps and "whose move" come from lib/net/moves.ts, which asks the deal state
// machine itself, so the rail can never disagree with what the server will allow.
// Props: d (deal row), side ('creator' | 'brand' | 'team'), role (team member's role, for "your move").
// Renders through the shared StatusRail (components/ui), so every progress rail in the app looks the same.
import { RAIL, nextMove, stepsDone, isMine } from "@/lib/net/moves";
import StatusRail from "@/components/ui/StatusRail";

export default function DealRail({ d, side, role = null }) {
  const m = nextMove(d);
  const done = stepsDone(d);
  const closed = d?.stage === "cancelled" || d?.pay_status === "refunded";
  const mine = m && isMine(m, side === "team" ? { role: role || "viewer" } : side);
  const text = !m ? (closed ? "This deal was cancelled." : "Paid. This deal is complete.")
    : side === "creator" ? m.forCreator : side === "brand" ? m.forBrand : m.forTeam;
  const steps = RAIL.map((r, i) => ({
    key: r.step,
    label: side !== "creator" && r.step === "record_payout" ? "Creator paid" : r.label,
    state: closed ? "todo" : i < done ? "done" : i === done && m ? "now" : "todo",
  }));
  return (
    <StatusRail
      label="Deal progress"
      steps={steps}
      eyebrow={closed ? "Closed" : m ? `Step ${Math.min(done + 1, RAIL.length)} of ${RAIL.length}` : "Complete"}
      badge={m ? <span className={`pill ${mine ? "mine" : "ok"}`}>{mine ? "Your move" : "Waiting"}</span> : !closed ? <span className="pill good">Done</span> : null}
      note={mine ? <b style={{ color: "var(--head)" }}>Your move: {text}</b> : text}
    />
  );
}
