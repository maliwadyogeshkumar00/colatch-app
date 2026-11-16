// Captures every Colatch Connect screen at phone, tablet and desktop widths, for design review.
// Runs in CI only, against the throwaway CI database: it seeds a small sample world (clearly fake
// names on .sample.test addresses), logs in as a creator and as a team owner, and saves JPEGs to
// screens-out/<width>/<name>.jpg. Nothing here touches the live database.
import { chromium } from "playwright";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.env.SCREENS_OUT || "screens-out";
const WIDTHS = [[320, 640], [375, 812], [414, 896], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const q = (sql, ...v) => db.query(sql, v);
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hash = (pw) => { const salt = randomBytes(16); return { hash: "p600k$" + b64url(pbkdf2Sync(pw, salt, 600_000, 32, "sha256")), salt: b64url(salt) }; };
const pw = () => "pw-" + randomBytes(9).toString("hex");

const TOKEN = "sampletoken" + randomBytes(12).toString("hex");
const owner = { email: "owner-screens@colatch.sample.test", password: pw() };
const creator = { email: "aarav@creator.sample.test", password: pw() };
const brandUser = { email: "brand@bloom.sample.test", password: pw() };

async function seed() {
  await db.connect();
  await fetch(new URL("/api/net/health", BASE)).catch(() => null); // runs migrations
  const h1 = hash(owner.password), h2 = hash(creator.password);
  await q("INSERT INTO team_users (id, email, name, password_hash, salt, role) VALUES ('tm-screens', $1, 'Priya (sample)', $2, $3, 'owner') ON CONFLICT (email) DO NOTHING", owner.email, h1.hash, h1.salt);
  const creators = [
    ["scr-aarav", "aarav_mehta", "Aarav Mehta", "food", "Mumbai", "Hindi, English", 184000, 6.2, 92000, 40000, 1],
    ["scr-ishita", "ishita_rao", "Ishita Rao", "beauty", "Bengaluru", "English, Kannada", 96000, 4.8, 51000, 28000, 0],
    ["scr-kabir", "kabir_sethi", "Kabir Sethi", "fitness", "Delhi", "Hindi", 312000, 3.1, 140000, 65000, 1],
    ["scr-meera", "meera_pillai", "Meera Pillai", "travel", "Kochi", "Malayalam, English", 58000, 7.4, 33000, 18000, 0],
  ];
  for (const [id, handle, name, niche, city, lang, f, er, v, rate, ver] of creators) {
    await q(`INSERT INTO creators (id, handle, name, niche, city, language, followers, engagement_rate, avg_views, rate_reel, verified, skills, bio_pitch, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Creator, Actor','Short, warm Reels that feel like a friend recommending something.','active') ON CONFLICT (id) DO NOTHING`, id, handle, name, niche, city, lang, f, er, v, rate, ver);
  }
  await q("INSERT INTO creator_accounts (id, creator_id, email, password_hash, salt) VALUES ('acc-scr-aarav','scr-aarav',$1,$2,$3) ON CONFLICT (email) DO NOTHING", creator.email, h2.hash, h2.salt);
  const h3 = hash(brandUser.password);
  // Brand account (table exists from schema v5); its campaigns are linked below once the campaigns exist.
  await q("INSERT INTO brand_accounts (id, email, password_hash, salt, name, company, email_verified_at) VALUES ('ba-scr-bloom',$1,$2,$3,'Neha (sample)','Bloom Skincare (sample)', now()) ON CONFLICT (email) DO NOTHING", brandUser.email, h3.hash, h3.salt).catch(() => null);
  await q(`INSERT INTO campaigns (id, slug, title, brand, brief, deliverables, niche, city, languages, creators_needed, budget_total, deadline, status, client_name, client_company, client_email, share_token, is_open)
           VALUES ('scr-k1','bloom-winter','Bloom Skincare winter launch','Bloom Skincare (sample)','A winter routine Reel for dry skin, filmed at home, honest and unpolished.','1 Reel, 45-60s','beauty','Mumbai','Hindi, English',3,150000,'2026-12-12','open','Neha (sample)','Bloom Skincare (sample)','brand@bloom.sample.test',$1,1)
           ON CONFLICT (id) DO NOTHING`, TOKEN);
  await q(`INSERT INTO campaigns (id, slug, title, brand, brief, deliverables, niche, city, languages, creators_needed, budget_total, deadline, status, client_email, share_token, is_open)
           VALUES ('scr-k2','chai-festive','Chai Point festive Reels','Chai Point (sample)','Festive gifting Reels around a chai moment with family.','2 Reels','food','Delhi','Hindi',5,250000,'2026-12-20','open','brand@chai.sample.test',$1,1)
           ON CONFLICT (id) DO NOTHING`, TOKEN + "b");
  await q("UPDATE campaigns SET brand_account_id='ba-scr-bloom' WHERE id='scr-k1'").catch(() => null);
  await q("INSERT INTO disputes (id, deal_id, raised_by_kind, raised_by_id, reason, detail) VALUES ('scr-dis-1','scr-d1','brand','scr-k1','late','Draft came two days after the agreed date.') ON CONFLICT DO NOTHING").catch(() => null);
  const apps = [["scr-a1", "scr-k1", "scr-aarav", "accepted", 88], ["scr-a2", "scr-k1", "scr-ishita", "shortlisted", 81], ["scr-a3", "scr-k1", "scr-kabir", "new", 64], ["scr-a4", "scr-k2", "scr-aarav", "new", 77], ["scr-a5", "scr-k1", "scr-meera", "shortlisted", 72]];
  for (const [id, k, c, st, sc] of apps) {
    const r = (await q("SELECT handle, name, followers, rate_reel FROM creators WHERE id=$1", c)).rows[0];
    await q(`INSERT INTO campaign_applications (id, campaign_id, creator_id, handle, name, followers, rate_quote, pitch, match_score, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'I film my own winter routine every year; this fits naturally.',$8,$9) ON CONFLICT (id) DO NOTHING`, id, k, c, r.handle, r.name, r.followers, r.rate_reel, sc, st);
  }
  await q(`INSERT INTO creator_deals (id, creator_id, campaign_id, application_id, brand, deliverable, fee, stage, pay_status, funded_at, sow_accepted_at, draft_status, draft_url, draft_submitted_at, fee_pct, brand_paid_paise)
           VALUES ('scr-d1','scr-aarav','scr-k1','scr-a1','Bloom Skincare (sample)','1 Reel, 45-60s',40000,'confirmed','funded',to_char(now(),'YYYY-MM-DD HH24:MI:SS'),to_char(now(),'YYYY-MM-DD HH24:MI:SS'),'submitted','https://drive.google.com/file/d/sample-draft',to_char(now(),'YYYY-MM-DD HH24:MI:SS'),15,4708000)
           ON CONFLICT (id) DO NOTHING`);
  await q(`INSERT INTO creator_deals (id, creator_id, brand, deliverable, fee, stage, pay_status, paid_at, utr, tds_amount, sow_accepted_at, draft_status, post_url, live_at)
           VALUES ('scr-d2','scr-aarav','Monsoon Foods (sample)','1 Reel',25000,'paid','paid',to_char(now() - interval '20 days','YYYY-MM-DD HH24:MI:SS'),'SAMPLEUTR0001',2500,to_char(now() - interval '40 days','YYYY-MM-DD HH24:MI:SS'),'approved','https://www.instagram.com/reel/sample',to_char(now() - interval '25 days','YYYY-MM-DD HH24:MI:SS'))
           ON CONFLICT (id) DO NOTHING`);
}

const PUBLIC = [["join", "/join"], ["brief", "/brief"], ["creator-login", "/creator/login"], ["team-login", "/team/login"], ["pitches", "/pitches"],
  ["media-kit", "/m/aarav_mehta"], ["shortlist", `/shortlist/${TOKEN}`], ["receipt", `/receipt/${TOKEN}`], ["reset", "/reset/request"], ["not-found", "/shortlist/nope-not-a-token-000000"],
  ["brand-join", "/brand/join"], ["brand-login", "/brand/login"], ["faq", "/faq"]];
const BRAND = [["brand-home", "/brand"], ["brand-settings", "/brand/settings"], ["brand-shortlist-signed-in", `/shortlist/${TOKEN}`]];
const CREATOR = [["creator-home", "/creator"], ["creator-applications", "/creator/applications"], ["creator-deal", "/creator/deals/scr-d1"], ["creator-earnings", "/creator/earnings"],
  ["creator-profile", "/creator/profile"], ["creator-score", "/creator/score"], ["creator-pitch", "/creator/pitch"], ["creator-settings", "/creator/settings"]];
const TEAM = [["team-home", "/team"], ["team-campaigns", "/team/campaigns"], ["team-campaign", "/team/campaigns/scr-k1"], ["team-creators", "/team/creators"], ["team-creator", "/team/creators/scr-aarav"],
  ["team-crm", "/team/crm"], ["team-deal", "/team/deals/scr-d1"], ["team-insights", "/team/insights"], ["team-reports", "/team/reports"], ["team-referrals", "/team/referrals"],
  ["team-members", "/team/members"], ["team-notifications", "/team/notifications"], ["team-cpv", "/team/cpv"], ["team-settings", "/team/settings"],
  ["team-brands", "/team/brands"], ["team-disputes", "/team/disputes"], ["team-finance", "/team/finance"], ["team-audit", "/team/audit"], ["team-system", "/team/system"]];

let ip = 10;
async function shoot(browser, list, login) {
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${ip++}` } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (login) {
      await page.goto(BASE + `/${login.kind}/login`);
      await page.getByLabel("Email").fill(login.who.email);
      await page.getByLabel("Password").fill(login.who.password);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
    }
    mkdirSync(`${OUT}/${w}`, { recursive: true });
    for (const [name, path] of list) {
      try {
        const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${w}/${name}.jpg`, fullPage: true, type: "jpeg", quality: 62 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        report.push({ name, w, status: res?.status(), overflow, errors: errors.splice(0) });
      } catch (e) { report.push({ name, w, error: String(e.message || e).slice(0, 200) }); }
    }
    await ctx.close();
  }
}

const report = [];
await seed();
const browser = await chromium.launch();
await shoot(browser, PUBLIC);
await shoot(browser, CREATOR, { kind: "creator", who: creator });
await shoot(browser, TEAM, { kind: "team", who: owner });
await shoot(browser, BRAND, { kind: "brand", who: brandUser }).catch((e) => report.push({ name: "brand-login", error: String(e.message || e).slice(0, 200) }));
await browser.close();
await db.end();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.error || r.status >= 400 && r.name !== "not-found" || r.overflow > 0 || r.errors?.length);
console.log(`screens: ${report.length} captured, ${bad.length} with problems`);
for (const b of bad) console.log(JSON.stringify(b));
