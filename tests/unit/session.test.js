// Signed session cookies and password rules (lib/net/auth.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSession, readSession, passwordProblem, hashPassword, verifyPassword, needsRehash } from "@/lib/net/auth";

const SECRET = "unit-test-secret-" + Math.random().toString(36).slice(2);

test("a session round-trips to its subject", async () => {
  const c = await makeSession(SECRET, "cr_acc1~3", 7);
  assert.equal(await readSession(SECRET, c), "cr_acc1~3");
});

test("a tampered session is rejected", async () => {
  const c = await makeSession(SECRET, "cr_acc1~3", 7);
  const [sub, exp, sig] = c.split(".");
  assert.equal(await readSession(SECRET, `cr_acc2~3.${exp}.${sig}`), null, "changed subject");
  assert.equal(await readSession(SECRET, `${sub}.${Number(exp) + 864e5}.${sig}`), null, "extended expiry");
  assert.equal(await readSession(SECRET, `${sub}.${exp}.${sig.slice(0, -2)}xx`), null, "changed signature");
  assert.equal(await readSession(SECRET, "garbage"), null);
  assert.equal(await readSession(SECRET, undefined), null);
});

test("an expired session is rejected", async () => {
  const c = await makeSession(SECRET, "tm_t1~1", -1);
  assert.equal(await readSession(SECRET, c), null);
});

test("a session signed with another secret is rejected", async () => {
  const c = await makeSession("other-secret", "tm_t1~1", 7);
  assert.equal(await readSession(SECRET, c), null);
  assert.equal(await readSession("", c), null);
});

test("no secret configured: sessions cannot be made", async () => {
  await assert.rejects(makeSession("", "x", 1));
});

test("password rules", () => {
  assert.match(passwordProblem("short"), /10 characters/);
  assert.match(passwordProblem("aaaaaaaaaaaa"), /harder/);
  assert.match(passwordProblem("1234567890abc"), /harder/);
  assert.match(passwordProblem("Password123!"), /harder/);
  assert.match(passwordProblem("x".repeat(201)), /too long/);
  assert.equal(passwordProblem("kite-river-mango-41"), null);
});

test("passwords hash with a salt, verify, and never match the wrong password", async () => {
  const h = await hashPassword("kite-river-mango-41");
  assert.ok(h.hash.startsWith("p600k$"));
  assert.ok(!needsRehash(h.hash));
  assert.ok(await verifyPassword("kite-river-mango-41", h.hash, h.salt));
  assert.ok(!(await verifyPassword("kite-river-mango-42", h.hash, h.salt)));
  assert.ok(!(await verifyPassword("anything", "login-disabled", h.salt)));
  const h2 = await hashPassword("kite-river-mango-41");
  assert.notEqual(h.hash, h2.hash, "different salt, different hash");
});
