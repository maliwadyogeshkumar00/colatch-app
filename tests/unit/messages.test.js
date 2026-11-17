import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubMessage, cleanBody, prepareBody, messageId, MessageError, MAX_MESSAGE } from "@/lib/net/messages";

const HIDDEN = "[contact hidden by Colatch]";

test("phone numbers, emails, handles, links and UPI ids are hidden", () => {
  const cases = [
    "Call me on 98765 43210 tomorrow",
    "my number is +91-9876543210",
    "mail ravi.k@gmail.com for the invoice",
    "follow @ravi.creates for more",
    "see https://wa.me/919876543210",
    "pay to ravik@okaxis please",
    "UPI id: ravi.k@ybl",
    "gpay: 98765xx",
  ];
  for (const c of cases) {
    const r = scrubMessage(c);
    assert.ok(r.found > 0, `nothing found in: ${c}`);
    assert.ok(r.text.includes(HIDDEN), `not hidden: ${c} -> ${r.text}`);
    assert.ok(!/\d{10}|@ok|@ybl|gmail|ravi\.creates|wa\.me/.test(r.text), `leaked: ${c} -> ${r.text}`);
  }
});

test("ordinary messages are left alone", () => {
  for (const c of ["Can you show the pack front-on at 0:04?", "Paying via UPI is fine for us", "Shoot on 12 Mar, 2 outfits", "Loved the draft!"]) {
    const r = scrubMessage(c);
    assert.equal(r.found, 0, c);
    assert.equal(r.text, c);
  }
});

test("empty and too-long messages are refused; whitespace is tidied", () => {
  assert.throws(() => cleanBody("   \n\t "), MessageError);
  assert.throws(() => cleanBody(null), MessageError);
  assert.throws(() => cleanBody("x".repeat(MAX_MESSAGE + 1)), MessageError);
  assert.equal(cleanBody("x".repeat(MAX_MESSAGE)).length, MAX_MESSAGE);
  assert.equal(cleanBody("  hi\r\n\r\n\r\n\r\nthere ​ "), "hi\n\nthere");
});

test("team messages are not scrubbed; creator and brand messages are", () => {
  const t = prepareBody("Ping me on 9876543210", "team");
  assert.deepEqual(t, { body: "Ping me on 9876543210", scrubbed: false });
  const c = prepareBody("My number is 9876543210 if needed", "creator");
  assert.equal(c.scrubbed, true);
  assert.ok(!c.body.includes("9876543210"));
  const b = prepareBody("Great work on the reel", "brand");
  assert.deepEqual(b, { body: "Great work on the reel", scrubbed: false });
  // A message that is nothing but contact details is refused rather than stored as a blank placeholder.
  assert.throws(() => prepareBody("9876543210", "brand"), MessageError);
});

test("the form's one-time id is kept when valid, replaced otherwise", () => {
  const u = "3F2504E0-4F89-41D3-9A0C-0305E82C3301";
  assert.equal(messageId(u), u.toLowerCase());
  for (const bad of ["", null, "abc", "'; DROP TABLE x;--"]) assert.match(messageId(bad), /^[0-9a-f-]{36}$/);
  assert.notEqual(messageId(""), messageId(""));
});
