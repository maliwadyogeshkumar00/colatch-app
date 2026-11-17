import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import {
  EVENTS, MAX_ATTEMPTS, BACKOFF_MINUTES, signature, verifySignature, matches, parseEvents, nextAttemptAt,
  deliveryId, checkUrlShape, privateIp, newSecret, dealPayload, iso,
} from "@/lib/net/webhooks";

test("signature is HMAC-SHA256 over `${t}.${body}` in the documented header format", () => {
  const body = JSON.stringify({ id: "wd_1", event: "deal.created", data: { deal_id: "d1" } });
  const t = 1763371800;
  const h = signature("whsec_test", body, t);
  const want = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
  assert.equal(h, `t=${t},v1=${want}`);
  assert.match(h, /^t=\d+,v1=[0-9a-f]{64}$/);
});

test("receivers can verify; a changed body, secret or old timestamp fails", () => {
  const body = '{"a":1}';
  const t = 1763371800;
  const h = signature("s3cret", body, t);
  assert.equal(verifySignature("s3cret", body, h, t + 10), true);
  assert.equal(verifySignature("s3cret", '{"a":2}', h, t + 10), false);
  assert.equal(verifySignature("other", body, h, t + 10), false);
  assert.equal(verifySignature("s3cret", body, h, t + 301), false, "older than 5 minutes");
  assert.equal(verifySignature("s3cret", body, "garbage", t), false);
});

test("event matching only accepts known events the hook subscribed to", () => {
  assert.equal(EVENTS.length, 8);
  assert.equal(matches("deal.created,post.live", "post.live"), true);
  assert.equal(matches("deal.created, post.live ", "post.live"), true);
  assert.equal(matches("deal.created", "deal.stage_changed"), false);
  assert.equal(matches("deal.*", "deal.created"), false, "no wildcards");
  assert.equal(matches("", "deal.created"), false);
  assert.equal(matches(null, "deal.created"), false);
  assert.deepEqual(parseEvents("post.live,bogus,post.live,payout.sent"), ["post.live", "payout.sent"]);
});

test("backoff: first attempt immediate, then growing gaps, nothing after the last attempt", () => {
  const created = new Date("2026-11-17T00:00:00Z");
  assert.equal(MAX_ATTEMPTS, 6);
  assert.equal(BACKOFF_MINUTES.length, MAX_ATTEMPTS);
  assert.equal(nextAttemptAt(created, 0).getTime(), created.getTime());
  let prev = -1;
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    const at = nextAttemptAt(created, n).getTime();
    assert.ok(at > prev, `attempt ${n + 1} is later than attempt ${n}`);
    prev = at;
  }
  assert.equal(nextAttemptAt(created, 1).toISOString(), "2026-11-17T00:05:00.000Z");
  assert.equal(nextAttemptAt(created, 5).toISOString(), "2026-11-18T00:00:00.000Z");
  assert.equal(nextAttemptAt(created, MAX_ATTEMPTS), null);
  assert.equal(nextAttemptAt("not a date", 0), null);
});

test("delivery ids are stable per hook, event and key", () => {
  assert.equal(deliveryId("wh_1", "deal.created", "d1"), deliveryId("wh_1", "deal.created", "d1"));
  assert.notEqual(deliveryId("wh_1", "deal.created", "d1"), deliveryId("wh_2", "deal.created", "d1"));
  assert.notEqual(deliveryId("wh_1", "deal.created", "d1"), deliveryId("wh_1", "post.live", "d1"));
  assert.match(deliveryId("a", "b", "c"), /^wd_[0-9a-f]{32}$/);
});

test("hook URLs: https only, public hosts only", () => {
  assert.equal(checkUrlShape("https://hooks.zapier.com/hooks/catch/1/abc"), "https://hooks.zapier.com/hooks/catch/1/abc");
  for (const bad of ["http://hooks.zapier.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x",
    "https://169.254.169.254/latest", "https://intranet/x", "https://db.internal/x", "https://printer.local/x", "https://user:pw@example.com/x",
    "https://example.com:8443/x", "https://[::1]/x", "ftp://example.com", "javascript:alert(1)", ""]) {
    assert.throws(() => checkUrlShape(bad), Error, bad);
  }
  assert.equal(privateIp("10.1.2.3"), true);
  assert.equal(privateIp("172.20.0.1"), true);
  assert.equal(privateIp("100.64.0.1"), true);
  assert.equal(privateIp("::1"), true);
  assert.equal(privateIp("fd00::1"), true);
  assert.equal(privateIp("fe80::1"), true);
  assert.equal(privateIp("::ffff:127.0.0.1"), true);
  assert.equal(privateIp("8.8.8.8"), false);
  assert.equal(privateIp("2606:4700::1111"), false);
});

test("secrets are long and random", () => {
  const a = newSecret(), b = newSecret();
  assert.match(a, /^whsec_[0-9a-f]{48}$/);
  assert.notEqual(a, b);
});

test("deal payloads carry ids, stages, paise and timestamps, never contact details", () => {
  const p = dealPayload({ id: "d1", campaign_id: "k1", creator_id: "c1", stage: "live", pay_status: "funded", draft_status: "approved", fee: 35000, brand_paid_paise: "4130000",
    created_at: "2026-11-01 10:00:00", updated_at: "2026-11-02 11:30:00", utr: "SECRETUTR", notes: "call 9876543210", brand: "Acme", post_url: "https://x" });
  assert.equal(p.fee_paise, 3500000);
  assert.equal(p.brand_paid_paise, 4130000);
  assert.equal(p.created_at, "2026-11-01T10:00:00.000Z");
  const s = JSON.stringify(p);
  for (const leak of ["SECRETUTR", "9876543210", "Acme"]) assert.ok(!s.includes(leak), leak);
  assert.equal(iso("2026-11-01 10:00:00"), "2026-11-01T10:00:00.000Z");
});
