// Brand accounts: join → log out → log in; a brand sees only its own campaigns; the email
// confirmation link links earlier briefs sent from that email; wrong passwords are throttled.
// Everything is seeded into the throwaway CI database with values made up for this run.
import { test, expect } from "@playwright/test";
import { pbkdf2Sync, randomBytes, createHash } from "node:crypto";

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const rand = () => Math.random().toString(36).slice(2, 10);
let ipN = 20;
const newCtx = (browser) => browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `198.51.101.${ipN++}` } });
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hash = (pw) => { const salt = randomBytes(16); return { hash: "p600k$" + b64url(pbkdf2Sync(pw, salt, 600_000, 32, "sha256")), salt: b64url(salt) }; };

async function login(page, who) {
  await page.goto("/brand/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("logged-out visitors are sent to the brand login", async ({ page }) => {
  for (const path of ["/brand", "/brand/settings"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/brand\/login/);
  }
});

test("a brand joins, logs out and logs back in", async ({ browser }) => {
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  const who = { email: `join-${run}@brand-test.local`, password: `pw-${rand()}-${rand()}` };
  await page.goto("/brand/join");
  await page.getByLabel("Your name").fill("E2E Brand Person");
  await page.getByLabel("Company or brand").fill(`E2E Brand ${run}`);
  await page.getByLabel("Work email").fill(who.email);
  await page.getByLabel(/^Password/).fill(who.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/brand(\?|$)/);
  await expect(page.getByText(/Confirm your email to see campaigns sent from/)).toBeVisible();

  // Same email again is refused.
  const other = await (await newCtx(browser)).newPage();
  await other.goto("/brand/join");
  await other.getByLabel("Your name").fill("Someone Else");
  await other.getByLabel("Company or brand").fill("Other Co");
  await other.getByLabel("Work email").fill(who.email);
  await other.getByLabel(/^Password/).fill(`pw-${rand()}-${rand()}`);
  await other.getByRole("checkbox").check();
  await other.getByRole("button", { name: "Create account" }).click();
  await expect(other.getByRole("alert")).toContainText("already has a brand account");

  await page.goto("/brand/logout");
  await expect(page).toHaveURL(/\/brand\/login/);
  await page.goto("/brand");
  await expect(page).toHaveURL(/\/brand\/login/);
  await login(page, who);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Your move" })).toBeVisible();
  await ctx.close();
});

test.describe("with seeded brands", () => {
  let db;
  const q = (sql, ...v) => db.query(sql, v).then((r) => r.rows);
  const A = { id: `e2e-ba-${run}`, email: `brand-a-${run}@brand-test.local`, password: `pw-${rand()}-${rand()}` };
  const B = { id: `e2e-bb-${run}`, email: `brand-b-${run}@brand-test.local`, password: `pw-${rand()}-${rand()}` };
  const titleA = `Alpha campaign ${run}`, titleB = `Bravo secret campaign ${run}`, titleOld = `Old brief by email ${run}`;

  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to seed brands");
    let pg;
    try { pg = (await import("pg")).default; } catch { test.skip(true, "pg not installed"); }
    db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await fetch(new URL("/api/net/health", process.env.BASE_URL || "http://localhost:3000")).catch(() => null);
    for (const u of [A, B]) {
      const h = hash(u.password);
      await q("INSERT INTO brand_accounts (id, email, password_hash, salt, name, company, email_verified_at) VALUES ($1,$2,$3,$4,'E2E','E2E Co', now())", u.id, u.email, h.hash, h.salt);
    }
    const camp = (id, title, email, acct) => q(
      "INSERT INTO campaigns (id, slug, title, brand, status, client_email, share_token, brand_account_id) VALUES ($1,$1,$2,'E2E Co','open',$3,$4,$5)",
      id, title, email, `tok${randomBytes(12).toString("hex")}`, acct);
    await camp(`e2e-ka-${run}`, titleA, A.email, A.id);
    await camp(`e2e-kb-${run}`, titleB, B.email, B.id);
    // Sent from B's email by someone else's account: still never shown to A.
    await camp(`e2e-kx-${run}`, `${titleB} two`, A.email.replace("brand-a", "nobody"), B.id);
  });
  test.afterAll(async () => { await db?.end().catch(() => {}); });

  test("brand A sees its own campaign and never brand B's", async ({ browser }) => {
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    await login(page, A);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/brand");
    await expect(page.getByText(titleA)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(titleB);
    await ctx.close();
  });

  test("the confirmation link marks the email confirmed and links earlier briefs by email", async ({ browser }) => {
    const C = { id: `e2e-bc-${run}`, email: `brand-c-${run}@brand-test.local`, password: `pw-${rand()}-${rand()}` };
    const h = hash(C.password);
    await q("INSERT INTO brand_accounts (id, email, password_hash, salt, name, company) VALUES ($1,$2,$3,$4,'E2E','E2E C')", C.id, C.email, h.hash, h.salt);
    // A brief C sent before having an account (upper-case email on purpose), and one already owned by B.
    await q("INSERT INTO campaigns (id, slug, title, brand, status, client_email, share_token) VALUES ($1,$1,$2,'E2E C','open',$3,$4)", `e2e-kc-${run}`, titleOld, C.email.toUpperCase(), `tok${randomBytes(12).toString("hex")}`);
    await q("INSERT INTO campaigns (id, slug, title, brand, status, client_email, share_token, brand_account_id) VALUES ($1,$1,$2,'E2E C','open',$3,$4,$5)", `e2e-kd-${run}`, `${titleB} three`, C.email, `tok${randomBytes(12).toString("hex")}`, B.id);
    const raw = b64url(randomBytes(32));
    await q("INSERT INTO email_verifications (token_hash, user_kind, user_id, email, expires_at) VALUES ($1,'brand',$2,$3, now() + interval '1 hour')", b64url(createHash("sha256").update(raw).digest()), C.id, C.email);

    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    await login(page, C);
    await page.goto("/brand");
    await expect(page.locator("body")).not.toContainText(titleOld); // not linked before confirming
    await page.goto(`/verify/${raw}`);
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    await expect(page.getByText(/1 brief you sent from this email is now in your account/)).toBeVisible();
    expect((await q("SELECT email_verified_at FROM brand_accounts WHERE id=$1", C.id))[0].email_verified_at).not.toBeNull();
    expect((await q("SELECT brand_account_id FROM campaigns WHERE id=$1", `e2e-kd-${run}`))[0].brand_account_id).toBe(B.id); // never taken from B
    await page.goto("/brand");
    await expect(page.getByText(titleOld)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(titleB);
    // The link works once.
    await page.goto(`/verify/${raw}`);
    await expect(page.getByRole("heading", { name: "This link doesn't work any more" })).toBeVisible();
    await ctx.close();
  });

  test("wrong passwords are throttled", async ({ browser }) => {
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    for (let i = 0; i < 8; i++) {
      await login(page, { email: B.email, password: `wrong-${i}-${rand()}` });
      await expect(page.getByText("Wrong email or password.")).toBeVisible();
    }
    await login(page, { email: B.email, password: `wrong-again-${rand()}` });
    await expect(page.getByText(/Too many wrong tries/)).toBeVisible();
    // Even the right password is refused while blocked from this connection.
    await login(page, B);
    await expect(page).toHaveURL(/\/brand\/login/);
    await ctx.close();
  });
});
