// Email verification tokens (lib/net/security.ts): single use, only verify the email they were sent to,
// and a new link cancels the old one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { createVerifyToken, consumeVerifyToken } from "@/lib/net/security";

after(async () => { await closeDb(); });

async function brand() {
  await ensureSchema();
  const id = `it-ba-${crypto.randomUUID()}`;
  const email = `${id}@verify.test`;
  await db.prepare("INSERT INTO brand_accounts (id, email, password_hash, salt) VALUES (?,?,'x','y')").bind(id, email).run();
  return { id, email };
}
const verifiedAt = async (id) => (await db.prepare("SELECT email_verified_at FROM brand_accounts WHERE id=?").bind(id).first())?.email_verified_at ?? null;

test("a verify link works once and marks the email confirmed", async () => {
  const b = await brand();
  const raw = await createVerifyToken("brand", b.id, b.email);
  assert.equal(await verifiedAt(b.id), null);
  const who = await consumeVerifyToken(raw);
  assert.deepEqual({ kind: who?.user_kind, id: who?.user_id }, { kind: "brand", id: b.id });
  assert.notEqual(await verifiedAt(b.id), null);
  assert.equal(await consumeVerifyToken(raw), null, "second use is refused");
});

test("a newer link cancels the older one", async () => {
  const b = await brand();
  const first = await createVerifyToken("brand", b.id, b.email);
  const second = await createVerifyToken("brand", b.id, b.email);
  assert.equal(await consumeVerifyToken(first), null);
  assert.ok(await consumeVerifyToken(second));
});

test("a link for an old email does not confirm a changed email", async () => {
  const b = await brand();
  const raw = await createVerifyToken("brand", b.id, b.email);
  await db.prepare("UPDATE brand_accounts SET email=? WHERE id=?").bind(`changed-${b.email}`, b.id).run();
  assert.ok(await consumeVerifyToken(raw), "token itself is valid");
  assert.equal(await verifiedAt(b.id), null, "but the new address stays unconfirmed");
});

test("expired and made-up tokens are refused", async () => {
  const b = await brand();
  const raw = await createVerifyToken("brand", b.id, b.email);
  await db.prepare("UPDATE email_verifications SET expires_at = now() - interval '1 minute' WHERE user_id=?").bind(b.id).run();
  assert.equal(await consumeVerifyToken(raw), null);
  assert.equal(await consumeVerifyToken("not-a-real-token-but-long-enough"), null);
  assert.equal(await consumeVerifyToken(""), null);
});
