import { test } from "node:test";
import assert from "node:assert/strict";
import { nextMove, stepsDone, isMine } from "@/lib/net/moves";

const base = { id: "d", creator_id: "c", campaign_id: "k", fee: 40000, stage: "confirmed", pay_status: "unfunded", draft_status: "none", sow_accepted_at: null, live_at: null, post_url: null };
const at = (patch) => ({ ...base, ...patch });

test("each deal state has exactly the next step the server would allow", () => {
  const cases = [
    [at({}), "accept_terms", "creator"],
    [at({ sow_accepted_at: "x" }), "record_funding", "finance"],
    [at({ sow_accepted_at: "x", pay_status: "funded" }), "submit_draft", "creator"],
    [at({ sow_accepted_at: "x", pay_status: "funded", draft_status: "changes" }), "submit_draft", "creator"],
    [at({ sow_accepted_at: "x", pay_status: "funded", draft_status: "submitted" }), "approve_draft", "brand"],
    [at({ sow_accepted_at: "x", pay_status: "funded", draft_status: "approved" }), "submit_live_link", "creator"],
    [at({ sow_accepted_at: "x", pay_status: "funded", draft_status: "approved", post_url: "https://instagram.com/reel/abc" }), "verify_live", "team"],
    [at({ sow_accepted_at: "x", pay_status: "funded", draft_status: "approved", post_url: "https://instagram.com/reel/abc", live_at: "x" }), "approve_payout", "finance"],
    [at({ sow_accepted_at: "x", pay_status: "released", draft_status: "approved", post_url: "https://instagram.com/reel/abc", live_at: "x" }), "record_payout", "finance"],
  ];
  for (const [d, step, owner] of cases) {
    const m = nextMove(d);
    assert.equal(m?.step, step, JSON.stringify(d));
    assert.equal(m?.owner, owner);
  }
});

test("closed deals have no next move; a deal with no fee waits on the team", () => {
  assert.equal(nextMove(at({ pay_status: "paid" })), null);
  assert.equal(nextMove(at({ stage: "cancelled" })), null);
  assert.equal(nextMove(at({ sow_accepted_at: "x", fee: null })).step, "edit_terms");
  assert.equal(stepsDone(at({ pay_status: "paid" })), 8);
  assert.equal(stepsDone(at({ sow_accepted_at: "x", pay_status: "funded" })), 2);
});

test("whose move: roles map to the server's permissions", () => {
  const fund = nextMove(at({ sow_accepted_at: "x" }));
  assert.ok(isMine(fund, { role: "finance" }));
  assert.ok(isMine(fund, { role: "owner" }));
  assert.ok(!isMine(fund, { role: "shortlist" }));
  assert.ok(!isMine(fund, "creator"));
  const draft = nextMove(at({ sow_accepted_at: "x", pay_status: "funded" }));
  assert.ok(isMine(draft, "creator"));
  assert.ok(!isMine(draft, { role: "admin" }));
});
