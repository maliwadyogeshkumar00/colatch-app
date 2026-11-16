import { test } from "node:test";
import assert from "node:assert/strict";
import { can, ROLES, safeNext, isEmail } from "@/lib/net/security";
import { hashPassword, verifyPassword, needsRehash, passwordProblem, makeSession, readSession } from "@/lib/net/auth";

test("roles grant only what they should", () => {
  assert.equal(can("owner", "owner"), true);
  assert.equal(can("admin", "owner"), false);
  assert.equal(can("admin", "finance"), true);
  assert.equal(can("shortlist", "shortlist"), true);
  assert.equal(can("shortlist", "finance"), false, "a shortlister must not touch money");
  assert.equal(can("finance", "shortlist"), false);
  assert.equal(can("finance", "finance"), true);
  assert.equal(can("viewer", "view"), true);
  assert.equal(can("viewer", "shortlist"), false);
  assert.equal(can("root", "view"), false, "unknown roles get nothing");
  assert.equal(can(null, "view"), false);
  for (const r of ROLES) assert.equal(can(r, "view"), true);
});

test("safeNext blocks open redirects", () => {
  assert.equal(safeNext("/creator/deals/1", "/creator", "/creator"), "/creator/deals/1");
  assert.equal(safeNext("https://evil.com", "/creator", "/creator"), "/creator");
  assert.equal(safeNext("//evil.com", "/", "/x"), "/x");
  assert.equal(safeNext("/\\evil.com", "/", "/x"), "/x");
  assert.equal(safeNext("/creator\r\nSet-Cookie: a=b", "/creator", "/creator"), "/creator");
  assert.equal(safeNext(undefined, "/creator", "/creator"), "/creator");
});

test("email check", () => {
  assert.ok(isEmail("a.b@colatch.com"));
  assert.ok(!isEmail("no-at-sign"));
  assert.ok(!isEmail("a@b"));
});

test("passwords hash with the new scheme and still verify old ones", async () => {
  const { hash, salt } = await hashPassword("correct horse battery");
  assert.ok(hash.startsWith("p600k$"));
  assert.equal(await verifyPassword("correct horse battery", hash, salt), true);
  assert.equal(await verifyPassword("wrong password!", hash, salt), false);
  assert.equal(needsRehash(hash), false);
  assert.equal(await verifyPassword("anything", "login-disabled", "login-disabled"), false, "demo accounts can never log in");
  assert.equal(needsRehash("legacyhashwithoutprefix"), true);
});

test("password rules", () => {
  assert.ok(passwordProblem("short"));
  assert.ok(passwordProblem("aaaaaaaaaaaa"));
  assert.ok(passwordProblem("password123456"));
  assert.equal(passwordProblem("Monsoon-Bhangra-2026"), null);
});

test("sessions: valid, tampered, expired, wrong secret", async () => {
  const tok = await makeSession("s3cret-key", "cr_abc~1", 1);
  assert.equal(await readSession("s3cret-key", tok), "cr_abc~1");
  const [sub, exp, sig] = tok.split(".");
  assert.equal(await readSession("s3cret-key", `cr_other~1.${exp}.${sig}`), null, "changing the subject breaks the signature");
  assert.equal(await readSession("s3cret-key", `${sub}.${Number(exp) + 99999}.${sig}`), null, "extending expiry breaks the signature");
  assert.equal(await readSession("another-key", tok), null);
  const old = await makeSession("s3cret-key", "cr_abc~1", -1);
  assert.equal(await readSession("s3cret-key", old), null, "expired");
  assert.equal(await readSession("s3cret-key", "garbage"), null);
  await assert.rejects(() => makeSession("", "cr_x~1"), "no secret means no session");
});
