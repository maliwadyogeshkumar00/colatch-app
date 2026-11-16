// Brand journey on the public side. Runs against the app started by CI (BASE_URL) with a throwaway database.
import { test, expect } from "@playwright/test";

const uniq = () => Math.random().toString(36).slice(2, 8);

async function submitBrief(page, raw) {
  await page.goto("/brief");
  await page.locator("#brief-raw").fill(raw);
  await page.locator('input[name="name"]').fill("Asha Test");
  await page.locator('input[name="company"]').fill("Test Kurta Co");
  await page.locator('input[name="email"]').fill(`asha.${uniq()}@testkurta.example`);
  await page.locator('input[name="site"]').fill("testkurta.example");
  await page.getByRole("button", { name: /find my creators/i }).click();
  await expect(page.getByRole("heading", { name: /brief received/i })).toBeVisible();
  const href = await page.getByTestId("shortlist-link").getAttribute("href");
  expect(href).toMatch(/^\/shortlist\/[A-Za-z0-9_-]{32,}$/);
  return href;
}

test("a brand posts a brief and lands on its private shortlist page", async ({ page }) => {
  const href = await submitBrief(page, `We need 3 dancers in Delhi for a festive kurta reel, 1 reel each, going live next month. ref ${uniq()}`);
  // The done page is reached by the private token, never by a guessable id.
  expect(page.url()).toMatch(/done=[A-Za-z0-9_-]{32,}/);
  const res = await page.goto(href);
  expect(res?.status()).toBe(200);
  await expect(page.getByText(/your shortlist is being prepared/i)).toBeVisible();
  // Private pages must not be indexed.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("a wrong or short shortlist token is a 404, and so is the receipt", async ({ page }) => {
  for (const path of ["/shortlist/notarealtoken000000000000000000", "/shortlist/abc", "/receipt/notarealtoken000000000000000000"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
});

test("'Book again' only reopens a brief with the private token, never with a slug or id", async ({ page }) => {
  const secret = `Secret launch plan ${uniq()} for our winter range`;
  const href = await submitBrief(page, `${secret}. Need 2 food creators in Mumbai, 1 reel each.`);
  const token = href.split("/").pop();

  await page.goto(`/brief?again=${encodeURIComponent(token)}`);
  await expect(page.locator("#brief-raw")).toHaveValue(new RegExp(secret));

  // Slugs are built from the title ("secret-launch-plan-…") and can be guessed; they must open an empty form.
  for (const guess of ["secret-launch-plan", `secret-launch-plan-${uniq()}`, "brief"]) {
    await page.goto(`/brief?again=${encodeURIComponent(guess)}`);
    await expect(page.locator("#brief-raw")).toHaveValue("");
  }
  // The old ?done=<campaign id> form shows nothing.
  await page.goto(`/brief?done=${crypto.randomUUID()}`);
  await expect(page.getByRole("heading", { name: /brief received/i })).toHaveCount(0);
});

test("a javascript: link in a creator profile is never rendered as a link", async ({ page }) => {
  const url = process.env.DATABASE_URL;
  test.skip(!url, "needs DATABASE_URL to seed a creator");
  let pg;
  try { pg = (await import("pg")).default; } catch { test.skip(true, "pg not installed"); }
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const id = `e2e_${uniq()}`;
  try {
    await db.query(
      "INSERT INTO creators (id, handle, name, portfolio_links, profile_pic) VALUES ($1, $1, 'E2E Creator', $2, $3)",
      [id, "javascript:alert(document.domain) https://example.com/real-sample data:text/html,hi", "javascript:alert(1)"]
    );
    await db.query("INSERT INTO creator_accounts (id, creator_id, email, password_hash, salt) VALUES ($1, $2, $3, 'login-disabled', 'x')", [`acc_${id}`, id, `${id}@e2e.example`]);
    const res = await page.goto(`/m/${id}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('a[href^="javascript:" i], a[href^="data:" i], img[src^="javascript:" i]')).toHaveCount(0);
    await expect(page.locator('a[href="https://example.com/real-sample"]')).toHaveCount(1);
  } finally {
    await db.query("DELETE FROM creator_accounts WHERE creator_id=$1", [id]).catch(() => {});
    await db.query("DELETE FROM creators WHERE id=$1", [id]).catch(() => {});
    await db.end();
  }
});

test("robots.txt keeps private areas out and the sitemap lists public pages only", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  for (const p of ["/team", "/shortlist", "/receipt", "/reset", "/creator"]) expect(robots).toContain(`Disallow: ${p}`);
  const map = await (await request.get("/sitemap.xml")).text();
  expect(map).toContain("/brief</loc>");
  expect(map).toContain("/join</loc>");
  expect(map).not.toMatch(/\/(shortlist|receipt|roster|reset|team)\//);
});
