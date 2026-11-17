// One name for where a deal is, taken from the same source as the deal progress rail (lib/net/moves.ts),
// so the rail, the Terms footer and deal lists on team screens never disagree.
import { RAIL, nextMove, stepsDone } from "@/lib/net/moves";

/** The rail's label for the step a deal is on ("Approve draft"), or "Complete" / "Cancelled" / "Dropped". */
export function dealStepName(d) {
  if (!d) return "";
  if (d.pay_status === "refunded") return "Cancelled and refunded";
  if (d.stage === "cancelled") return "Cancelled";
  if (d.stage === "dropped" && d.pay_status === "unfunded") return "Dropped";
  const m = nextMove(d);
  if (!m) return "Complete";
  const r = RAIL[Math.min(stepsDone(d), RAIL.length - 1)];
  // The team rail calls the last step "Creator paid" (DealRail does the same).
  return r.step === "record_payout" ? "Creator paid" : r.label;
}

/** "Step 4 of 8 · Approve draft", matching the rail's eyebrow and its highlighted step. */
export function dealStepLine(d) {
  const name = dealStepName(d);
  if (!d || !nextMove(d) || name === "Dropped") return name;
  return `Step ${Math.min(stepsDone(d) + 1, RAIL.length)} of ${RAIL.length} · ${name}`;
}
