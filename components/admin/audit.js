// Turns audit_log rows into plain words for the Audit log screen: a title ("Record payout"), an area
// ("Deals and briefs") and change lines such as "Stage: draft → live" or "Fee: ₹40,000 → ₹45,000".
// Pure functions, no React, so they are unit tested (tests/unit/admin-audit.test.js). The raw JSON
// stays available on the page behind a details toggle; nothing here hides what was stored.

const IST = 5.5 * 36e5;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Areas for the activity mix chart, keyed by the action's first part ("deal.verify_live" → "deal"). */
export const AREAS = [
  { key: "team", label: "Team and logins", prefixes: ["team", "demo"] },
  { key: "deals", label: "Deals and briefs", prefixes: ["deal", "dispute", "shipment", "shortlist", "application", "campaign"] },
  { key: "money", label: "Money and trust", prefixes: ["finance", "referral_earning", "bypass"] },
  { key: "creators", label: "Creators", prefixes: ["creator", "media", "platform", "audience"] },
  { key: "brands", label: "Brands", prefixes: ["brand"] },
  { key: "system", label: "System and email", prefixes: ["webhook", "notification"] },
];
export function areaOf(action) {
  const head = String(action || "").split(".")[0];
  return AREAS.find((a) => a.prefixes.includes(head)) || { key: "other", label: "Other" };
}

/** Actions an owner should see at a glance: access, exports and money. */
export const SENSITIVE = new Set([
  "team.role_changed", "team.member_added", "team.member_disabled", "team.member_enabled", "team.reset_link_issued",
  "team.signed_out_everywhere", "team.owner_setup", "team.password_changed", "finance.export",
  "creator.claim_verified", "creator.claim_rejected", "webhook.created", "webhook.deleted", "brand.disabled",
  "deal.record_funding", "deal.record_payout", "deal.record_refund", "referral_earning.paid", "bypass.confirm",
]);

const TITLES = {
  "team.login": "Signed in", "team.password_changed": "Changed their password", "team.password_reset": "Set a new password from a link",
  "team.signed_out_everywhere": "Signed out on every device", "team.member_added": "Added a team member", "team.role_changed": "Changed a role",
  "team.member_disabled": "Disabled a login", "team.member_enabled": "Enabled a login", "team.reset_link_issued": "Made a set-password link",
  "team.owner_setup": "Created the owner login", "finance.export": "Downloaded the ledger CSV", "notification.retry": "Retried an email",
  "notification.retry_all": "Retried unsent emails", "referral_earning.paid": "Recorded a referral payout", "referral_earning.status": "Changed a referral earning",
  "bypass.confirm": "Confirmed an off-platform report", "bypass.dismiss": "Dismissed an off-platform report", "bypass.report": "Reported an off-platform request",
  "webhook.created": "Added a webhook", "webhook.deleted": "Deleted a webhook", "webhook.enabled": "Turned a webhook on", "webhook.disabled": "Turned a webhook off",
  "webhook.tested": "Sent a test webhook", "demo.load": "Loaded demo data", "demo.remove": "Removed demo data", "deal.create": "Created a deal",
  "creator.login": "Creator signed in", "brand.login": "Brand signed in", "creator.join": "Creator joined", "brand.join": "Brand joined",
  "creator.claim_verified": "Verified a creator claim", "creator.claim_rejected": "Rejected a creator claim", "dispute.raised": "Raised a dispute",
  "shortlist.approve": "Approved a creator on the shortlist", "shortlist.decline": "Declined a creator on the shortlist",
  "application.create": "Applied to a brief", "application.withdraw": "Withdrew an application", "application.status": "Moved an application",
  "campaign.approve": "Approved a brief",
  "deal.accept_terms": "Accepted the deal terms", "deal.edit_terms": "Edited the deal terms", "deal.record_funding": "Recorded the brand payment",
  "deal.submit_draft": "Submitted a draft", "deal.approve_draft": "Approved a draft", "deal.request_changes": "Asked for draft changes",
  "deal.submit_live_link": "Added the live link", "deal.verify_live": "Verified the live post", "deal.approve_payout": "Approved the payout",
  "deal.record_payout": "Recorded the creator payout", "deal.record_refund": "Recorded a refund to the brand", "deal.save_results": "Saved the post results",
  "deal.usage": "Changed usage rights", "shipment.add": "Added a shipment", "shipment.move": "Moved a shipment",
};

const FIELD = {
  stage: "Stage", pay_status: "Payment", draft_status: "Draft", fee: "Fee", amount: "Amount", amount_paise: "Amount", tds_paise: "TDS",
  budget_total: "Budget", live_at: "Live", paid_at: "Paid", go_live_date: "Go-live", status: "Status", role: "Role", kind: "Type",
  utr: "Bank ref", rows: "Rows", host: "Host", events: "Events", tried: "Tried", sent: "Sent", bounty: "Thank-you credit",
  email: "Email", reason: "Reason", channels: "Usage channels", months: "Usage months", expires: "Usage until", platform: "Platform",
  cities: "Cities", from: "From", to: "To", fee_pct: "Colatch fee %", brand_paid_paise: "Brand paid", tds_amount: "TDS", auto_approve_at: "Auto-approves", funded_at: "Funded", released_at: "Released", sow_accepted_at: "Terms accepted", post_url: "Post link", draft_url: "Draft link", actual_views: "Views", deliverable: "Deliverable",
};
const MONEY = new Set(["fee", "amount", "budget_total", "price", "tds_amount"]);
const SKIP = new Set(["before", "set", "ledger", "dispute", "shipment", "media", "report", "application", "campaign", "creator", "dealId", "bytes", "storage_deleted", "manual", "created", "gender", "age"]);

export const sentence = (s) => { s = String(s ?? "").replace(/[_.]+/g, " ").trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const words = (s) => String(s ?? "").replace(/_/g, " ");
const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

/** "17 Nov 2026, 11:30" in Indian time from 'YYYY-MM-DD HH:MM:SS' (UTC) or ISO text; other text is returned as is. */
export function istStamp(v) {
  const s = String(v ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return s;
  if (!m[4]) return `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}`;
  const t = Date.parse(s.replace(" ", "T") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? "" : "Z"));
  if (!Number.isFinite(t)) return s;
  const d = new Date(t + IST);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** One value in words: money in rupees, paise as rupees, times in IST, codes as words, lists joined. */
export function fmtValue(key, v) {
  if (v == null || v === "") return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (key.endsWith("_paise")) return inr(Number(v) / 100);
  if (MONEY.has(key)) return inr(v);
  if (key === "utr") return "…" + String(v).slice(-4);
  if (key.endsWith("_at") || key === "expires" || key.endsWith("_date")) return istStamp(v);
  if (Array.isArray(v)) return v.map((x) => words(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number") return v.toLocaleString("en-IN");
  return words(v);
}

/** Parses the stored detail (JSON text or an object). Returns null for empty, { _raw } for text that isn't JSON. */
export function parseDetail(d) {
  if (d == null || d === "") return null;
  if (typeof d === "object") return d;
  try { const o = JSON.parse(String(d)); return o && typeof o === "object" ? o : { _raw: String(d) }; } catch { return { _raw: String(d) }; }
}

/**
 * changeLines(action, detail) → ["Stage: draft → live", "Fee: ₹40,000 → ₹45,000", "Ledger: creator payout sent ₹40,000"]
 * Handles the three shapes the app writes: { before, set, ledger } (deal steps), { from, to } (role and status
 * moves) and flat facts ({ amount, kind, utr }). At most `max` lines; the raw JSON keeps the rest.
 */
export function changeLines(action, detail, max = 4) {
  const d = parseDetail(detail);
  if (!d) return [];
  if (d._raw) return [String(d._raw).slice(0, 120)];
  const out = [];
  const label = (k) => FIELD[k] || sentence(k);
  if (d.set && typeof d.set === "object") {
    const before = d.before && typeof d.before === "object" ? d.before : {};
    for (const [k, v] of Object.entries(d.set)) {
      if (typeof v === "string" && v.startsWith("@") || k.endsWith("_json")) continue; // "@now" and friends: the entry's own time
      if (k in before && String(before[k]) !== String(v)) out.push(`${label(k)}: ${fmtValue(k, before[k])} → ${fmtValue(k, v)}`);
      else if (!(k in before)) out.push(`${label(k)}: ${fmtValue(k, v)}`);
    }
  } else if (d.before && typeof d.before === "object") {
    for (const [k, v] of Object.entries(d.before)) out.push(`${label(k)} was ${fmtValue(k, v)}`);
  }
  if (d.ledger && typeof d.ledger === "object" && d.ledger.kind) out.push(`Ledger: ${words(d.ledger.kind)}${d.ledger.amount_paise != null ? " " + inr(Number(d.ledger.amount_paise) / 100) : ""}`);
  if ("from" in d && "to" in d && !d.set) {
    const noun = /role/.test(action) ? "Role" : /status/.test(action) ? "Status" : "Changed";
    out.push(`${noun}: ${fmtValue("status", d.from)} → ${fmtValue("status", d.to)}`);
  } else if ("to" in d && !d.set) out.push(`Moved to ${fmtValue("status", d.to)}`);
  for (const [k, v] of Object.entries(d)) {
    if (SKIP.has(k) || k === "from" || k === "to" || v == null || v === "" || typeof v === "object" && !Array.isArray(v)) continue;
    out.push(`${label(k)}: ${fmtValue(k, v)}`);
  }
  return out.slice(0, max);
}

/** title for an action: a known phrase, or "Deal · verify live" built from the code. */
export function actionTitle(action) {
  const a = String(action || "");
  if (TITLES[a]) return TITLES[a];
  const [head, ...rest] = a.split(".");
  return rest.length ? `${sentence(head)} · ${words(rest.join(" "))}` : sentence(head);
}
