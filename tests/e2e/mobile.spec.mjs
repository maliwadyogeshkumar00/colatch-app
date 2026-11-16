// Phone layout checks (the "phone" project in playwright.config.mjs runs this file on a Pixel 7 viewport).
import { test, expect } from "@playwright/test";

const PAGES = ["/", "/brief", "/join", "/pitches", "/creator/login"];

for (const path of PAGES) {
  test(`${path} fits a phone screen with no sideways scroll`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle").catch(() => {});
    const { scroll, inner, offenders } = await page.evaluate(() => {
      const inner = window.innerWidth;
      const offenders = [...document.querySelectorAll("body *")]
        .filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.right > inner + 1 && s.position !== "fixed" && !el.closest("[aria-hidden='true']") && !el.closest(".scroll-x"); })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")}`);
      return { scroll: document.documentElement.scrollWidth, inner, offenders };
    });
    expect(scroll, `page is ${scroll}px wide on a ${inner}px screen. Too wide: ${offenders.join(", ")}`).toBeLessThanOrEqual(inner + 1);
  });
}

test("the brief form's main controls are visible and big enough to tap", async ({ page }) => {
  await page.goto("/brief");
  for (const loc of [page.locator("#brief-raw"), page.locator('input[name="email"]'), page.getByRole("button", { name: /find my creators/i })]) {
    await loc.scrollIntoViewIfNeeded();
    await expect(loc).toBeVisible();
    const box = await loc.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("the join page's main button is visible and tappable", async ({ page }) => {
  await page.goto("/join");
  const btn = page.locator("form button, form [type=submit]").first();
  await btn.scrollIntoViewIfNeeded();
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
});
