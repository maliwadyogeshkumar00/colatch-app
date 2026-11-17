// Display helpers shared by the creator pages, so one deal reads the same everywhere.

/** Where a creator's deal stands, as [label, pill tone]. Display only; the deal machine lives in lib/net/dealflow. */
export const dealState = (d) => d.stage === "cancelled" || d.pay_status === "refunded" ? ["Cancelled", "low"] : d.pay_status === "paid" ? ["Paid", "good"] : d.pay_status === "released" ? ["Payout approved", "good"] : !d.sow_accepted_at ? ["Accept terms", "ok"] : d.pay_status === "unfunded" ? ["Waiting for brand payment", ""] : d.draft_status === "changes" ? ["Changes asked", "ok"] : d.draft_status === "none" ? ["Send draft", "ok"] : d.draft_status === "submitted" ? ["In review", ""] : !d.live_at ? (d.post_url ? ["Checking your post", ""] : ["Post it", "ok"]) : ["Payment pending", ""];

/** Application status labels, as [label, pill tone]. */
export const APP_LABEL = { new: ["Under review", ""], shortlisted: ["Shortlisted", "ok"], accepted: ["Selected", "good"], rejected: ["Not selected", "low"], withdrawn: ["Withdrawn", ""] };

/** "2026-11-16 09:12:00" (stored as UTC) or "2026-12-12" -> "16 Nov 2026". Anything unparseable is shown as stored. */
export function dayText(v) {
  if (v == null || v === "") return "—";
  const dateOnly = /^\d{4}-\d\d-\d\d$/.test(String(v));
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v).replace(" ", "T") + (dateOnly || /[zZ]$|[+-]\d\d:?\d\d$/.test(String(v)) ? "" : "Z"));
  if (!Number.isFinite(t)) return String(v).slice(0, 10);
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: dateOnly ? "UTC" : "Asia/Kolkata" });
}
