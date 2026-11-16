// Security checks in the browser: a creator can't open the team deal desk, a shortlister sees no payout
// form, a javascript: link from a brief never becomes a clickable link on the brand's shortlist, dead
// reset links are refused, and a tampered creator session cookie is treated as logged out.
// Everything is seeded into the throwaway CI database with values made up for this run.
import { test, expect } from "@playwright/test";
import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const rand = () => Math.random().toString(36).slice(2, 10);
let ipN = 140;
const newCtx = (browser) => browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipN++}` } });
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hash = (pw) => { const salt = randomBytes(16); return { hash: "p600k$" + b64url(pbkdf2Sync(pw, salt, 600_000, 32, "sha256")), salt: b64url(salt) }; };
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const EVIL = "javascript:alert(document.domain)";

test.describe("security", () => {
  let db;
  const q = (sql, ...v) => db.query(sql, v).then((r) => r.rows);
  const C = { id: `e2e-sc-${run}`, email: `sec-c-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
  const SL = { email: `sec-sl-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
  const deal = `e2e-sdeal-${run}`;
  const camp = `e2e-scamp-${run}`;
  const share = `sec${randomBytes(16).toString("hex")}`;

  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to seed users");
    let pg;
    try { pg = (await import("pg")).default; } catch { test.skip(true, "pg not installed"); }
    db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await fetch(new URL("/api/net/health", BASE)).catch(() => null); // runs migrations
    const hc = hash(C.password), hs = hash(SL.password);
    await q("INSERT INTO creators (id, handle, name, portfolio_links, status) VALUES ($1,$2,'E2E Sec',$3,'active')", C.id, C.id.replace(/-/g, "_"), `${EVIL} https://example.com/ok`);
    await q("INSERT INTO creator_accounts (id, creator_id, email, password_hash, salt) VALUES ($1,$2,$3,$4,$5)", `acc-${C.id}`, C.id, C.email, hc.hash, hc.salt);
    await q("INSERT INTO team_users (id, email, name, password_hash, salt, role) VALUES ($1,$2,'E2E shortlist',$3,$4,'shortlist')", `tm-sec-${run}`, SL.email, hs.hash, hs.salt);
    // A brief whose "website" and brand URL are javascript: links, as an attacker would submit them.
    await q(`INSERT INTO campaigns (id, slug, title, brand, brief, status, client_email, share_token, is_open, brand_url, ai_notes)
             VALUES ($1,$1,'E2E security brief','E2E Brand','Test brief','open','sec-brand@colatch-test.local',$2,1,$3,$4)`,
      camp, share, EVIL, JSON.stringify({ website: EVIL }));
    await q(`INSERT INTO campaign_applications (id, campaign_id, creator_id, handle, name, status, match_score)
             VALUES ($1,$2,$3,$4,'E2E Sec','shortlisted',80)`, `app-${run}`, camp, C.id, C.id.replace(/-/g, "_"));
    // Released and waiting for the payout to be recorded: the state where the payout form appears for finance.
    await q(`INSERT INTO creator_deals (id, creator_id, campaign_id, brand, deliverable, fee, stage, pay_status, sow_accepted_at, draft_status, draft_url, live_at, post_url)
             VALUES ($1,$2,$3,'E2E Brand','1 Reel',20000,'confirmed','released',to_char(now(),'YYYY-MM-DD HH24:MI:SS'),'approved',$4,to_char(now(),'YYYY-MM-DD HH24:MI:SS'),$4)`,
      deal, C.id, camp, EVIL);
  });
  test.afterAll(async () => { await db?.end().catch(() => {}); });

  async function login(page, kind, who) {
    await page.goto(`/${kind}/login`);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password").fill(who.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  }

  test("a signed-in creator opening the team deal page is sent to the team login", async ({ browser }) => {
    const ctx = await newCtx(browser); const page = await ctx.newPage();
    await login(page, "creator", C);
    await page.goto(`/team/deals/${deal}`);
    await expect(page).toHaveURL(/\/team\/login/);
    await ctx.close();
  });

  test("a shortlister sees the deal but no Record payout form", async ({ browser }) => {
    const ctx = await newCtx(browser); const page = await ctx.newPage();
    await login(page, "team", SL);
    const res = await page.goto(`/team/deals/${deal}`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("button", { name: "Record payout" })).toHaveCount(0);
    await expect(page.locator('input[name="utr"]')).toHaveCount(0);
    await ctx.close();
  });

  test("javascript: links from a brief or profile never render as links on the shortlist", async ({ page }) => {
    const res = await page.goto(`/shortlist/${share}`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('a[href^="javascript:" i], [src^="javascript:" i], [action^="javascript:" i]')).toHaveCount(0);
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") || ""));
    expect(hrefs.filter((h) => /^\s*javascript:/i.test(h))).toEqual([]);
  });

  test("invalid, expired and used reset links are refused", async ({ page }) => {
    const expired = `exp${randomBytes(16).toString("hex")}`, used = `use${randomBytes(16).toString("hex")}`;
    await q("INSERT INTO password_resets (token_hash, user_kind, user_id, expires_at) VALUES ($1,'creator',$2, now() - interval '1 hour')", sha256(expired), C.id);
    await q("INSERT INTO password_resets (token_hash, user_kind, user_id, expires_at, used_at) VALUES ($1,'creator',$2, now() + interval '1 hour', now())", sha256(used), C.id);
    for (const t of [`bad${randomBytes(16).toString("hex")}`, expired, used, "short"]) {
      await page.goto(`/reset/${t}`);
      await expect(page.getByRole("heading", { name: "This link doesn't work any more" }), t).toBeVisible();
      await expect(page.locator('input[name="password"]')).toHaveCount(0);
    }
  });

  test("a tampered creator session cookie counts as logged out", async ({ browser }) => {
    const ctx = await newCtx(browser); const page = await ctx.newPage();
    await login(page, "creator", C);
    await page.goto("/creator");
    await expect(page).toHaveURL(/\/creator\/?$/);
    const cookie = (await ctx.cookies()).find((c) => c.name === "cr_session");
    expect(cookie, "creator session cookie is set").toBeTruthy();
    const [sub, exp, sig] = cookie.value.split(".");
    const flip = (s) => s.slice(0, -1) + (s.at(-1) === "A" ? "B" : "A");
    for (const value of [`${sub}.${exp}.${flip(sig)}`, `${sub}x.${exp}.${sig}`, `${sub}.${Number(exp) + 86400}.${sig}`, "garbage"]) {
      await ctx.clearCookies();
      await ctx.addCookies([{ ...cookie, value }]);
      await page.goto("/creator");
      await expect(page, value.slice(0, 24)).toHaveURL(/\/creator\/login/);
    }
    await ctx.close();
  });
});
