// Login throttling (lib/net/security.ts): failures inside the window block; a success clears them.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { loginBlocked, recordLogin, THROTTLE } from "@/lib/net/security";

after(async () => { await closeDb(); });
const key = () => `login:${crypto.randomUUID()}@t.test|203.0.113.9`;

test(`${THROTTLE.maxFailures} failures inside ${THROTTLE.windowMinutes} minutes block the key`, async () => {
  await ensureSchema();
  const k = key();
  for (let i = 0; i < THROTTLE.maxFailures - 1; i++) await recordLogin(k, false);
  assert.equal(await loginBlocked(k), false, "one short of the limit: still allowed");
  await recordLogin(k, false);
  assert.equal(await loginBlocked(k), true);
});

test("a successful login clears earlier failures", async () => {
  const k = key();
  for (let i = 0; i < THROTTLE.maxFailures - 1; i++) await recordLogin(k, false);
  await recordLogin(k, true);
  await recordLogin(k, false);
  assert.equal(await loginBlocked(k), false);
});

test("failures older than the window don't count", async () => {
  const k = key();
  for (let i = 0; i < THROTTLE.maxFailures + 2; i++) {
    await db.prepare(`INSERT INTO login_attempts (key, ok, at) VALUES (?, 0, now() - interval '${THROTTLE.windowMinutes + 5} minutes')`).bind(k).run();
  }
  assert.equal(await loginBlocked(k), false);
});

test("keys are independent: one blocked email doesn't block another", async () => {
  const a = key(), b = key();
  for (let i = 0; i < THROTTLE.maxFailures; i++) await recordLogin(a, false);
  assert.equal(await loginBlocked(a), true);
  assert.equal(await loginBlocked(b), false);
});
