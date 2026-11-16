// Sign-in, setup, roles and password reset, end to end against a running app (CI: fresh database).
// Every credential here is generated for this run; nothing real is used.
// Each test browses from its own made-up client address (X-Forwarded-For) so login throttling in
// one test doesn't affect another.
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const rand = () => Math.random().toString(36).slice(2, 10);
const strong = () => `pw-${rand()}-${rand()}`;
let ipN = 10;
const newCtx = (browser) => browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${ipN++}` } });

const SETUP_CODE = process.env.TEAM_SETUP_CODE || "ci-setup-code";
const OWNER_EMAIL = (process.env.TEAM_OWNER_EMAILS || "owner@colatch-test.local").split(/[\s,]+/)[0];
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || strong();
const creator = { email: `creator-${run}@colatch-test.local`, handle: `e2e_${run}`, password: strong() };

async function teamLogin(page, email, password) {
  await page.goto("/team/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("first owner needs the setup code, and setup only works once", async ({ browser }) => {
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  await page.goto("/team/setup");
  test.skip(page.url().includes("/team/login"), "A team login already exists in this database");

  const fill = async (code) => {
    await page.getByLabel("Setup code").fill(code);
    await page.getByLabel("Your name").fill("E2E Owner");
    await page.getByLabel("Work email").fill(OWNER_EMAIL);
    await page.getByLabel(/^Password/).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Create owner login" }).click();
  };
  await fill("wrong-code");
  await expect(page.locator(".note.bad")).toContainText("setup code is not right");

  await fill(SETUP_CODE);
  await expect(page).toHaveURL(/\/team(\?|$)/);
  await expect(page.getByText("Owner login created")).toBeVisible();

  // Setup is closed now, for everyone.
  const other = await (await newCtx(browser)).newPage();
  await other.goto("/team/setup");
  await expect(other).toHaveURL(/\/team\/login/);
  await ctx.close();
});

test("a viewer added by the owner can't open Team members", async ({ browser }) => {
  const owner = await (await newCtx(browser)).newPage();
  await teamLogin(owner, OWNER_EMAIL, OWNER_PASSWORD);
  await expect(owner).toHaveURL(/\/team(\?|$)/);

  const viewerEmail = `viewer-${run}@colatch-test.local`;
  await owner.goto("/team/members");
  const add = owner.locator("form", { has: owner.getByRole("button", { name: "Add member" }) });
  await add.locator('input[name="name"]').fill("E2E Viewer");
  await add.locator('input[name="email"]').fill(viewerEmail);
  await add.locator('select[name="role"]').selectOption("viewer");
  await add.getByRole("button", { name: "Add member" }).click();
  await expect(owner.getByText(`${viewerEmail} added as viewer`)).toBeVisible();

  // CI has no email keys, so the page must say so and show the link instead of pretending it was emailed.
  const link = await owner.getByTestId("invite-link").inputValue();
  expect(link).toMatch(/\/reset\/[A-Za-z0-9_-]{20,}$/);

  const viewerPw = strong();
  const viewer = await (await newCtx(browser)).newPage();
  await viewer.goto(new URL(link).pathname);
  await viewer.getByLabel(/^New password/).fill(viewerPw);
  await viewer.getByLabel("Type it again").fill(viewerPw);
  await viewer.getByRole("button", { name: "Save password" }).click();
  await expect(viewer).toHaveURL(/\/team\/login/);
  await expect(viewer.getByText("Password set")).toBeVisible();

  // The link is single use.
  await viewer.goto(new URL(link).pathname);
  await expect(viewer.getByText("This link doesn't work any more")).toBeVisible();

  await teamLogin(viewer, viewerEmail, viewerPw);
  await expect(viewer).toHaveURL(/\/team(\?|$)/);
  await viewer.goto("/team/members");
  await expect(viewer).toHaveURL(/\/team\?err=/);
  await expect(viewer.locator(".note.bad")).toContainText("can't do that");

  // Disabling signs the viewer out at once.
  await owner.goto("/team/members");
  const row = owner.locator("tr", { hasText: viewerEmail });
  await row.getByRole("button", { name: "Disable" }).click();
  await expect(owner.getByText(`${viewerEmail} can no longer log in`)).toBeVisible();
  await viewer.goto("/team");
  await expect(viewer).toHaveURL(/\/team\/login/);
});

test("a creator can join, log out and log back in", async ({ browser }) => {
  const page = await (await newCtx(browser)).newPage();
  await page.goto("/join");
  await page.locator('input[name="name"]').fill("E2E Creator");
  await page.locator('input[name="handle"]').fill(`@${creator.handle}`);
  await page.locator('input[name="email"]').fill(creator.email);
  await page.locator('input[name="password"]').fill(creator.password);
  await page.locator('input[name="skills"]').first().check({ force: true }); // visually hidden inside a chip
  await page.locator('input[name="city"]').fill("Delhi");
  await page.locator('input[name="phone"]').fill("9800000000");
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: /Join and see my matches/ }).click();
  await expect(page).toHaveURL(/\/creator(\?|$)/);

  await page.goto("/creator/logout");
  await expect(page).toHaveURL(/\/creator\/login/);
  await page.goto("/creator");
  await expect(page).not.toHaveURL(/\/creator(\?welcome=1)?$/);

  await page.goto("/creator/login");
  await page.getByLabel("Email").fill(creator.email);
  await page.getByLabel("Password").fill(creator.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/creator(\?|$)/);
});

test("logins lock after 8 wrong passwords, even with the right one", async ({ browser }) => {
  const page = await (await newCtx(browser)).newPage();
  const attempt = async (pw) => {
    await page.goto("/creator/login");
    await page.getByLabel("Email").fill(creator.email);
    await page.getByLabel("Password").fill(pw);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.locator(".note.bad")).toBeVisible();
  };
  for (let i = 0; i < 8; i++) {
    await attempt(`wrong-${i}-${rand()}`);
    await expect(page.locator(".note.bad")).toContainText("Wrong email or password");
  }
  await attempt(creator.password);
  await expect(page.locator(".note.bad")).toContainText("Too many wrong tries");
});

test("reset request says the same thing whether or not the email has an account", async ({ browser }) => {
  const page = await (await newCtx(browser)).newPage();
  const ask = async (email) => {
    await page.goto("/reset/request");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    return (await page.locator(".note.good").innerText()).trim();
  };
  const known = await ask(creator.email);
  const unknown = await ask(`nobody-${run}@colatch-test.local`);
  expect(known).toContain("If that email has a Colatch creator account");
  expect(unknown).toBe(known);
});

test("a made-up reset link is refused", async ({ browser }) => {
  const page = await (await newCtx(browser)).newPage();
  await page.goto(`/reset/${"x".repeat(43)}`);
  await expect(page.getByText("This link doesn't work any more")).toBeVisible();
});
