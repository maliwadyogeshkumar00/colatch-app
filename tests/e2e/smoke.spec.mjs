import { test, expect } from "@playwright/test";

test("health endpoint reports the database is reachable", async ({ request }) => {
  const r = await request.get("/api/net/health");
  expect(r.ok()).toBeTruthy();
});

for (const path of ["/", "/brief", "/join", "/creator/login", "/team/login"]) {
  test(`public page loads: ${path}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(path);
    expect(res?.status(), `status for ${path}`).toBeLessThan(400);
    await expect(page.locator("body")).not.toBeEmpty();
    expect(errors, `browser errors on ${path}`).toEqual([]);
  });
}
