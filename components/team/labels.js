// Display labels shared by the team desk, so one state has one name on every team screen.
// Display only: option values posted to the server stay the raw stored values.
import { NICHES, STAGE_LABEL } from "@/lib/net/creators";

/** "food_and_drink" → "Food and drink". */
export function sentence(s) {
  const t = String(s ?? "").trim().replace(/_/g, " ");
  return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : "";
}

/* ---------- campaign applications ---------- */
export const APP_STATUS_LABEL = { new: "New", shortlisted: "Shortlisted", accepted: "Selected", selected: "Selected", rejected: "Not selected", withdrawn: "Withdrawn" };
/** Statuses the team can set on an application, in the order the select shows them. Values are what the server accepts. */
export const APP_STATUS_OPTIONS = [["new", "New"], ["shortlisted", "Shortlisted"], ["accepted", "Selected"], ["rejected", "Not selected"]];
export const appStatusLabel = (s) => APP_STATUS_LABEL[s] || sentence(s) || "—";

/* ---------- creators ---------- */
/** Creator status in sentence case. Known statuses use the shared STAGE_LABEL; anything else stored (e.g. "active") is shown as is, capitalised. */
export const creatorStatusLabel = (s) => STAGE_LABEL[s] || sentence(s) || "—";
/** A stored niche matched to its canonical spelling ("food" → "Food"), or sentence case when it is not in the list. */
export function nicheLabel(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return NICHES.find((n) => n.toLowerCase() === t.toLowerCase()) || sentence(t);
}

/* ---------- referral earnings ---------- */
export const REF_STATUS_LABEL = { pending: "Pending", approved: "Approved", void: "Void", paid: "Paid" };
export const refStatusLabel = (s) => REF_STATUS_LABEL[s] || sentence(s);

/* ---------- money ---------- */
/** Full rupees with Indian grouping: ₹2,85,05,000. */
export function inrFull(n) {
  if (n == null || isNaN(Number(n))) return "—";
  return "₹" + Math.round(Number(n)).toLocaleString("en-IN");
}
/** KPI tiles: crore and above in compact form (₹2.85 Cr), everything smaller in full. Pair with title={inrFull(n)}. */
export function inrKpi(n) {
  if (n == null || isNaN(Number(n))) return "—";
  const v = Math.round(Number(n));
  const a = Math.abs(v);
  if (a >= 1e7) return (v < 0 ? "−" : "") + "₹" + String(Number((a / 1e7).toFixed(2))) + " Cr";
  return inrFull(v);
}

/* ---------- dates (always Indian time) ---------- */
const parse = (t) => {
  if (t == null || t === "") return null;
  if (t instanceof Date) return isNaN(t) ? null : t;
  const s = String(t);
  // Date-only values ("2026-12-12") are calendar days: keep the day, don't shift it through UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00Z");
  // "2026-11-16 16:12:51" from the database is UTC without a zone.
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s.replace(" ", "T") : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d) ? null : d;
};
/** "16 Nov 2026" */
export function day(t) {
  const d = parse(t);
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";
}
/** "16 Nov 2026, 9:43 pm" */
export function dayTime(t) {
  const d = parse(t);
  return d ? d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";
}

/** "1 applicant", "3 applicants" */
export const plural = (n, one, many = one + "s") => `${Number(n) || 0} ${Number(n) === 1 ? one : many}`;
