import { test } from "node:test";
import assert from "node:assert/strict";
import { render, emailConfig } from "@/lib/net/notify";

test("every template renders a subject and body with no undefined", () => {
  const p = { name: "Asha", title: "Diwali reels", token: "tok", campaignId: "c1", dealId: "d1", creator: "Simran", score: 90, count: 3, due: "Tue 18 Nov", amount: "₹10,000", utr: "UTR1", link: "https://x/reset", by: "Yogesh", role: "admin", reason: "Referral bonus", note: "Show logo", postUrl: "https://ig/p/1", subject: "S", text: "T" };
  const templates = ["creator_welcome","brief_received","new_application","shortlist_ready","creator_shortlisted","creator_approved","creator_declined","deal_created","draft_submitted","changes_requested","draft_approved","post_live","payout_eligible","payout_sent","brand_payment_recorded","referral_earned","password_reset","team_invite","account_alert"];
  for (const t of templates) {
    const r = render(t, p);
    assert.ok(r.subject && r.text, t);
    assert.ok(!/undefined/.test(r.subject + r.text), `${t} has undefined`);
  }
});
test("email is reported as not configured without keys", () => {
  delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
  const c = emailConfig();
  assert.equal(c.ready, false);
  assert.deepEqual(c.missing, ["RESEND_API_KEY", "EMAIL_FROM"]);
});
