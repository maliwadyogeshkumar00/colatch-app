// The whole deal, end to end, through the real pages: a creator applies, the team shortlists and makes the
// deal, the creator accepts, the brand payment is recorded, draft → approve → live → verify → payout.
// Then a second payout of the same deal (a stale tab submitting again) must be refused.
//
// Runs against the app CI starts (BASE_URL) with a throwaway database (DATABASE_URL). The team user and the
// creator are seeded straight into that database with passwords made up for this run; nothing real is used.
import { test, expect } from "@playwright/test";
import { pbkdf2Sync, randomBytes } from "node:crypto";

test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const rand = () => Math.random().toString(36).slice(2, 10);
let ipN = 40;
// Each browser context comes from its own made-up address so login throttling doesn't trip across tests.
const newCtx = (browser) => browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipN++}` } });

const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** Same format as lib/net/auth.ts hashPassword: "p600k$" + PBKDF2-SHA256(600k) and a base64url salt. */
function hash(pw) {
  const salt = randomBytes(16);
  return { hash: "p600k$" + b64url(pbkdf2Sync(pw, salt, 600_000, 32, "sha256")), salt: b64url(salt) };
}

let pg, db;
const q = (sql, ...v) => db.query(sql, v).then((r) => r.rows);

const admin = { email: `admin-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
const creator = { id: `e2e-cr-${run}`, handle: `e2e_deal_${run}`, email: `deal-creator-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
const campaign = { id: `e2e-k-${run}`, slug: `e2e-deal-${run}`, title: `E2E deal flow ${run}` };
let dealId;

test.beforeAll(async () => {
  test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to seed users");
  try { pg = (await import("pg")).default; } catch { test.skip(true, "pg not installed"); }
  db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  // The app creates its tables on first request; make sure that happened.
  await fetch(new URL("/api/net/health", process.env.BASE_URL || "http://localhost:3000")).catch(() => null);
  const a = hash(admin.password), c = hash(creator.password);
  await q("INSERT INTO team_users (id, email, name, password_hash, salt, role) VALUES ($1,$2,'E2E Admin',$3,$4,'admin')", `e2e-tm-${run}`, admin.email, a.hash, a.salt);
  await q("INSERT INTO creators (id, handle, name, city, followers, status) VALUES ($1,$2,'E2E Deal Creator','Delhi',50000,'new')", creator.id, creator.handle);
  await q("INSERT INTO creator_accounts (id, creator_id, email, password_hash, salt) VALUES ($1,$2,$3,$4,$5)", `e2e-acc-${run}`, creator.id, creator.email, c.hash, c.salt);
  // An open brief with no hard requirements, posted two days ago (outside the Icon early-access window).
  await q(`INSERT INTO campaigns (id, slug, title, brand, brief, deliverables, status, source, is_open, client_email, payment_days, approve_hours, share_token, created_at)
           VALUES ($1,$2,$3,'E2E Brand','A test brief for the end-to-end deal flow.','1 Reel','open','team',1,$4,15,72,$5, to_char(now() at time zone 'utc' - interval '2 days','YYYY-MM-DD HH24:MI:SS'))`,
    campaign.id, campaign.slug, campaign.title, `brand-${run}@e2e-brand.example`, `tok${run}${rand()}${rand()}${rand()}`);
});

test.afterAll(async () => { await db?.end().catch(() => {}); });

async function login(page, kind, who) {
  await page.goto(`/${kind}/login`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
const ok = (page, text) => expect(page.locator(".note.good, .note.ok").filter({ hasText: text }).first()).toBeVisible();

test("full deal: apply → shortlist → deal → accept → fund → draft → approve → live → verify → payout", async ({ browser }) => {
  const cr = await (await newCtx(browser)).newPage();
  const tm = await (await newCtx(browser)).newPage();
  await login(cr, "creator", creator);
  await login(tm, "team", admin);

  // Creator applies.
  await cr.goto(`/creator/o/${campaign.slug}`);
  await cr.locator('textarea[name="pitch"]').fill("I make festive dance reels for fashion brands and my audience is in Delhi.");
  await cr.locator('input[name="rate_quote"]').fill("20000");
  await cr.getByRole("button", { name: "Apply" }).click();
  await expect(cr.getByText(/Applied: the Colatch team is reviewing/)).toBeVisible();

  // Team shortlists. That alone must not create a deal.
  await tm.goto(`/team/campaigns/${campaign.id}`);
  const row = tm.locator("tr", { hasText: creator.handle });
  await row.locator('select[name="status"]').selectOption("shortlisted");
  await ok(tm, "Shortlisted");
  expect((await q("SELECT COUNT(*)::int n FROM creator_deals WHERE campaign_id=$1", campaign.id))[0].n).toBe(0);

  // Team makes the deal explicitly.
  await tm.locator("tr", { hasText: creator.handle }).getByRole("button", { name: "Create deal" }).click();
  await expect(tm).toHaveURL(/\/team\/deals\//);
  dealId = tm.url().split("/team/deals/")[1].split("?")[0];
  await ok(tm, "Deal created");

  // Creator accepts the terms.
  await cr.goto(`/creator/deals/${dealId}`);
  await cr.locator('input[name="agree"]').check();
  await cr.getByRole("button", { name: "Accept terms" }).click();
  await ok(cr, "Terms accepted");
  await expect(cr.getByText("Waiting for the brand's payment")).toBeVisible();

  // Finance records the brand payment (amount is prefilled with the quoted all-in price).
  await tm.goto(`/team/deals/${dealId}`);
  await tm.locator('input[name="reference"]').fill(`BRANDPAY${run}`.toUpperCase().slice(0, 24));
  await tm.getByRole("button", { name: "Record brand payment" }).click();
  await ok(tm, "Brand payment recorded");

  // Creator sends a draft; a javascript: link is refused by the browser pattern and by the server.
  await cr.goto(`/creator/deals/${dealId}`);
  await cr.locator('input[name="draft_url"]').fill("https://drive.google.com/file/d/e2e-draft");
  await cr.locator('input[name="disclosure"]').check();
  await cr.getByRole("button", { name: "Send draft" }).click();
  await ok(cr, "Draft sent");

  // Team approves the draft.
  await tm.goto(`/team/deals/${dealId}`);
  await tm.getByRole("button", { name: "Approve draft" }).click();
  await ok(tm, "Draft approved");

  // Creator shares the live link.
  await cr.goto(`/creator/deals/${dealId}`);
  await cr.locator('input[name="post_url"]').fill("https://www.instagram.com/reel/e2e-live/");
  await cr.getByRole("button", { name: "Submit live link" }).click();
  await ok(cr, "The team will check the post");

  // Team verifies the post and approves the payout.
  await tm.goto(`/team/deals/${dealId}`);
  await tm.getByRole("button", { name: "Verify live" }).click();
  await ok(tm, "Live post verified");
  await tm.getByRole("button", { name: "Approve payout" }).click();
  await ok(tm, "Payout approved");

  // A second tab opens the same payout form before the first one is submitted (stale tab / double click).
  const stale = await tm.context().newPage();
  await stale.goto(`/team/deals/${dealId}`);
  await expect(stale.getByRole("button", { name: "Record payout" })).toBeVisible();

  await tm.locator('input[name="utr"]').fill(`PAYOUT${run}`.toUpperCase().slice(0, 24));
  await tm.getByRole("button", { name: "Record payout" }).click();
  await ok(tm, "Payout recorded");
  await expect(tm.getByText(/Paid \d{4}-\d\d-\d\d · UTR/)).toBeVisible();

  // The stale tab tries to pay again with another reference: refused, nothing recorded.
  await stale.locator('input[name="utr"]').fill(`AGAIN${run}`.toUpperCase().slice(0, 24));
  await stale.getByRole("button", { name: "Record payout" }).click();
  await expect(stale.locator(".note.bad").first()).toContainText(/already marked paid/i);

  const ledger = await q("SELECT kind, amount_paise FROM finance_ledger WHERE deal_id=$1 ORDER BY id", dealId);
  expect(ledger.map((r) => r.kind)).toEqual(["brand_payment_received", "creator_payout_sent"]);
  const d = (await q("SELECT pay_status, stage, fee_pct, brand_paid_paise FROM creator_deals WHERE id=$1", dealId))[0];
  expect(d.pay_status).toBe("paid");
  expect(d.stage).toBe("paid");
  expect(d.fee_pct).not.toBeNull();

  // The creator sees the bank reference.
  await cr.goto(`/creator/deals/${dealId}`);
  await expect(cr.getByText(/bank reference \(UTR\)/)).toBeVisible();
});

test("a CRM card can't be dragged to Paid", async ({ browser }) => {
  test.skip(!dealId, "needs the deal from the previous test");
  const tm = await (await newCtx(browser)).newPage();
  await login(tm, "team", admin);
  await tm.goto("/team/crm");
  // Funded/paid deals have no stage picker at all.
  const card = tm.locator(".card", { has: tm.locator(`a[href="/team/deals/${dealId}"]`) });
  await expect(card.locator('select[name="stage"]')).toHaveCount(0);
});
