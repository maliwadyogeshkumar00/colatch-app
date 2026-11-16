// Who can see and do what: logged-out redirects, one creator can't open another creator's deal (IDOR),
// a pending profile claim sees no deal, and team roles only get the buttons their role allows.
// Users are seeded straight into the throwaway CI database with passwords made up for this run.
import { test, expect } from "@playwright/test";
import { pbkdf2Sync, randomBytes } from "node:crypto";

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const rand = () => Math.random().toString(36).slice(2, 10);
let ipN = 80;
const newCtx = (browser) => browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipN++}` } });
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hash = (pw) => { const salt = randomBytes(16); return { hash: "p600k$" + b64url(pbkdf2Sync(pw, salt, 600_000, 32, "sha256")), salt: b64url(salt) }; };

test("logged-out visitors are sent to the right login", async ({ page }) => {
  for (const [path, login] of [["/team", "/team/login"], ["/team/crm", "/team/login"], ["/team/deals/anything", "/team/login"], ["/creator", "/creator/login"], ["/creator/earnings", "/creator/login"], ["/creator/deals/anything", "/creator/login"]]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(login.replace(/\//g, "\\/")));
  }
});

test.describe("with seeded users", () => {
  let pg, db;
  const q = (sql, ...v) => db.query(sql, v).then((r) => r.rows);
  const A = { id: `e2e-pa-${run}`, email: `perm-a-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
  const B = { id: `e2e-pb-${run}`, email: `perm-b-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
  const P = { id: `e2e-pp-${run}`, email: `perm-p-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
  const shortlister = { email: `sl-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
  const viewer = { email: `vw-${run}@colatch-test.local`, password: `pw-${rand()}-${rand()}` };
  const dealB = `e2e-pdeal-${run}`;

  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to seed users");
    try { pg = (await import("pg")).default; } catch { test.skip(true, "pg not installed"); }
    db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await fetch(new URL("/api/net/health", process.env.BASE_URL || "http://localhost:3000")).catch(() => null);
    for (const u of [A, B, P]) {
      const h = hash(u.password);
      await q("INSERT INTO creators (id, handle, name) VALUES ($1,$2,$3)", u.id, u.id.replace(/-/g, "_"), "E2E Perm");
      await q("INSERT INTO creator_accounts (id, creator_id, email, password_hash, salt) VALUES ($1,$2,$3,$4,$5)", `acc-${u.id}`, u.id, u.email, h.hash, h.salt);
    }
    // P joined with the handle of a creator Colatch already had: a pending claim.
    await q("UPDATE creator_accounts SET claim_status='pending' WHERE creator_id=$1", P.id);
    await q("INSERT INTO creator_deals (id, creator_id, brand, deliverable, fee, stage, sow_accepted_at) VALUES ($1,$2,'Secret Brand','1 Reel',25000,'negotiating', to_char(now(),'YYYY-MM-DD HH24:MI:SS'))", dealB, B.id);
    for (const [u, role] of [[shortlister, "shortlist"], [viewer, "viewer"]]) {
      const h = hash(u.password);
      await q("INSERT INTO team_users (id, email, name, password_hash, salt, role) VALUES ($1,$2,$3,$4,$5,$6)", `tm-${role}-${run}`, u.email, `E2E ${role}`, h.hash, h.salt, role);
    }
  });
  test.afterAll(async () => { await db?.end().catch(() => {}); });

  async function login(page, kind, who) {
    await page.goto(`/${kind}/login`);
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password").fill(who.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  }

  test("creator A gets a 404 for creator B's deal, and never sees B's brand", async ({ browser }) => {
    const a = await (await newCtx(browser)).newPage();
    await login(a, "creator", A);
    const res = await a.goto(`/creator/deals/${dealB}`);
    expect(res?.status()).toBe(404);
    await expect(a.getByText("Secret Brand")).toHaveCount(0);
    await a.goto("/creator/applications");
    await expect(a.getByText("Secret Brand")).toHaveCount(0);

    // B sees their own deal.
    const b = await (await newCtx(browser)).newPage();
    await login(b, "creator", B);
    const ok = await b.goto(`/creator/deals/${dealB}`);
    expect(ok?.status()).toBe(200);
    await expect(b.getByText("Secret Brand").first()).toBeVisible();
  });

  test("a pending profile claim sees the verification notice, not deals", async ({ browser }) => {
    const p = await (await newCtx(browser)).newPage();
    await login(p, "creator", P);
    await p.goto("/creator/earnings");
    await expect(p.getByText(/verifying this profile is yours/i)).toBeVisible();
    await expect(p.getByText(/Paid to you/)).toHaveCount(0);
  });

  test("a shortlister can't record money; a viewer can't change anything", async ({ browser }) => {
    const s = await (await newCtx(browser)).newPage();
    await login(s, "team", shortlister);
    await s.goto(`/team/deals/${dealB}`);
    await expect(s.getByRole("button", { name: "Record brand payment" })).toHaveCount(0);
    await expect(s.getByText(/finance role records it/)).toBeVisible();
    await expect(s.getByRole("button", { name: "Save terms" })).toBeVisible();

    const v = await (await newCtx(browser)).newPage();
    await login(v, "team", viewer);
    await v.goto(`/team/deals/${dealB}`);
    await expect(v.getByText(/Your role is read-only/)).toBeVisible();
    await expect(v.getByRole("button", { name: "Save terms" })).toHaveCount(0);
    await expect(v.getByRole("button", { name: /Cancel deal/ })).toHaveCount(0);
    // Owner-only demo controls are hidden from everyone else.
    await v.goto("/team");
    await expect(v.getByRole("button", { name: /demo data/i })).toHaveCount(0);
  });
});
