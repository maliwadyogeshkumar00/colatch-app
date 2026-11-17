import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import PublicShell from "../../_ui/PublicShell";
import { MoveRow } from "../../_ui/Moves";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { compact, inr, erBand } from "@/lib/net/creators";
import { requirementChips, PAY_LABEL } from "@/lib/net/campaign";
import { quote, railDone, RAIL, feePct, brandFeePct, RUSH_PCT, makeTrackCode } from "@/lib/net/deal";
import { dealValue, sumValue, baselines, quoteSavings, budgetFit, marketRate } from "@/lib/net/value";
import { ensureCode } from "@/lib/net/referral";
import { scrubContacts, safeUrl } from "@/lib/net/guard";
import { priceDeal } from "@/lib/net/pricing";
import { transition, FlowError } from "@/lib/net/dealflow";
import { notify } from "@/lib/net/notify";
import { audit, logError } from "@/lib/net/security";
import { REASONS, raiseDispute, DisputeError } from "@/lib/net/disputes";
import { currentBrand } from "@/lib/net/creatorAuth";
import DealThread from "@/components/deal/DealThread";
import { UsageLine, ShipmentStatus, ShipPill } from "@/components/deal/DealExtras";
import { postMessage, notifyMessage, messagesForCampaign, unreadForCampaign, markCampaignRead, MessageError } from "@/lib/net/messages";
import { shipmentStatusForCampaign } from "@/lib/net/shipments";
import { syncUsageStart, usageStatus } from "@/lib/net/usage";
import { inrShort } from "@/lib/net/dashboard";
import { inrFull, day } from "@/components/team/labels";
import { PageHeader, KpiStrip, StatusRail, Grid, Section, Card, AsideCard, FilterBar, FilterChips, DataTable, Cell, EmptyState, Pill, Tags, Avatar } from "@/components/ui";
import { Facts, MiniStats } from "@/components/brand/Facts";

// Checked here as well as in the page: metadata runs before the page streams, so a bad link gets a real 404 status.
export async function generateMetadata({ params }) {
  if (!(await campaignFor(params.token))) notFound();
  return { title: "Your shortlist", robots: { index: false, follow: false } };
}

const CSS = `
.pg-shortlist .dots{display:inline-flex;gap:4px}
.pg-shortlist .dots i{width:10px;height:10px;border-radius:50%;background:var(--line-3);display:inline-block}
.pg-shortlist .dots i.on{background:var(--p700)}
.pg-shortlist .save{margin-top:8px;display:flex;flex-direction:column;gap:3px}
.pg-shortlist .save span{font-size:12px;font-weight:500;color:var(--accent-ink)}
.pg-shortlist .fit{display:inline-block;margin-top:6px;font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px}
.pg-shortlist .fit.good{background:var(--soft-bg);color:var(--soft-fg)}.pg-shortlist .fit.good::before{content:"✓ "}.pg-shortlist .fit.ok{background:transparent;box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--accent-ink)}.pg-shortlist .fit.bad{background:transparent;box-shadow:inset 0 0 0 1px var(--line-3);color:var(--ink-3)}.pg-shortlist .fit.bad::before{content:"– "}
`;

async function campaignFor(token) {
  const t = String(token || "");
  return t.length >= 16 ? env.DB.prepare("SELECT * FROM campaigns WHERE share_token=?").bind(t).first() : null;
}
const back = (token, msg, tone = "ok") => flashUrl(`/shortlist/${encodeURIComponent(token)}`, tone, msg);
const EXT = { target: "_blank", rel: "noopener noreferrer nofollow" };

/** Runs one deal step as this brand. The deal must belong to the campaign behind the link. */
async function brandStep(f, step, input, okMsg) {
  const token = String(f.get("token") ?? "");
  const k = await campaignFor(token);
  if (!k) notFound();
  const dealId = String(f.get("deal") ?? "");
  let msg = okMsg, tone = "ok";
  try {
    await transition(dealId, step, { kind: "brand", id: k.id }, input);
  } catch (e) {
    if (!(e instanceof FlowError)) throw e;
    msg = e.message; tone = "err";
  }
  redirect(back(token, msg, tone));
}

async function ownDeal(f) {
  const token = String(f.get("token") ?? "");
  const k = await campaignFor(token);
  if (!k) notFound();
  const dealId = String(f.get("deal") ?? "");
  const own = await env.DB.prepare("SELECT id FROM creator_deals WHERE id=? AND campaign_id=?").bind(dealId, k.id).first();
  return { token, k, dealId, own };
}

async function signoff(f) {
  "use server";
  await brandStep(f, "brand_signoff", { public: Boolean(f.get("public")) }, "Signed off. Thank you!");
}
async function approveDraft(f) {
  "use server";
  await brandStep(f, "approve_draft", { note: scrubContacts(String(f.get("note") ?? "")).text.slice(0, 500) || null }, "Draft approved. The creator can now post it.");
}
async function requestChanges(f) {
  "use server";
  await brandStep(f, "request_changes", { note: String(f.get("note") ?? "") }, "Feedback sent to the creator.");
}

async function rate(f) {
  "use server";
  const { token, dealId, own } = await ownDeal(f);
  if (own) {
    const stars = Math.max(1, Math.min(5, Number(f.get("stars")) || 0));
    await env.DB.prepare(
      "INSERT INTO ratings (id, deal_id, by_side, stars, note) VALUES (?,?,?,?,?) ON CONFLICT (deal_id, by_side) DO UPDATE SET stars=EXCLUDED.stars, note=EXCLUDED.note"
    ).bind(crypto.randomUUID(), dealId, "brand", stars, scrubContacts(String(f.get("note") ?? "")).text.slice(0, 300) || null).run();
  }
  redirect(back(token, "Rating saved. It helps other brands pick well."));
}

/** The brand messages the creator and the Colatch team on one booked deal of this campaign. Contact details are scrubbed. */
async function brandMessage(f) {
  "use server";
  const { token, k, dealId, own } = await ownDeal(f);
  const to = (msg, tone = "ok") => redirect(back(token, msg, tone) + `#deal-${encodeURIComponent(dealId)}`);
  if (!own) to("That creator isn't booked on this campaign.", "err");
  const d = await env.DB.prepare("SELECT stage, pay_status FROM creator_deals WHERE id=?").bind(dealId).first();
  if (!d || d.stage === "cancelled" || d.pay_status === "refunded") to("This deal is closed, so messages are off. Reply to the Colatch team by email if you need anything.", "err");
  const sender = { kind: "brand", id: k.id };
  let r;
  try {
    r = await postMessage(dealId, sender, f.get("body"), f.get("mid"));
  } catch (e) {
    if (e instanceof MessageError) to(e.message, "err");
    await logError("shortlist.message", e, { deal: dealId });
    to("Something went wrong, your message wasn't sent. Try again.", "err");
  }
  if (r.created) await notifyMessage(dealId, r.id, sender);
  to(!r.created ? "That message was already sent." : r.scrubbed ? "Message sent. Contact details were hidden: keep the deal on Colatch." : "Message sent.");
}

/** The brand raises a dispute on one booked deal of this campaign. Ownership is checked in raiseDispute. */
async function dispute(f) {
  "use server";
  const token = String(f.get("token") ?? "");
  const k = await campaignFor(token);
  if (!k) notFound();
  const dealId = String(f.get("deal") ?? "");
  let msg = "Dispute sent. The Colatch team will look into it and reply by email.", tone = "ok";
  try {
    await raiseDispute(dealId, { kind: "brand", id: k.id }, String(f.get("reason") ?? ""), String(f.get("detail") ?? ""));
  } catch (e) {
    tone = "err";
    if (e instanceof DisputeError) msg = e.message;
    else { await logError("shortlist.dispute", e, { deal: dealId }); msg = "Something went wrong, nothing was sent. Try again."; }
  }
  redirect(back(token, msg, tone));
}

/**
 * The brand approves or declines one shortlisted creator. Approving is the moment the deal is created
 * (one per application, enforced by a unique index). Declining is refused once a deal exists, because
 * then the creator is booked and only the team can cancel.
 */
async function decide(f, d) {
  const token = String(f.get("token") ?? "");
  const k = await campaignFor(token);
  if (!k) notFound();
  const appId = String(f.get("app") ?? "");
  const note = scrubContacts(String(f.get("note") ?? "").trim()).text.slice(0, 500) || null;
  let result;
  try {
    result = await env.DB.tx(async (t) => {
      // The application must belong to this link's campaign and be on the brand's shortlist.
      const a = await t.prepare(
        `SELECT a.*, c.handle AS chandle, c.rate_reel, c.followers AS cf FROM campaign_applications a LEFT JOIN creators c ON c.id=a.creator_id
         WHERE a.id=? AND a.campaign_id=? AND a.status IN ('shortlisted','accepted') FOR UPDATE OF a`
      ).bind(appId, k.id).first();
      if (!a) return { msg: "That creator isn't on this shortlist.", tone: "err" };
      const existing = a.creator_id ? await t.prepare("SELECT id, stage FROM creator_deals WHERE campaign_id=? AND (application_id=? OR creator_id=?) AND stage <> 'cancelled' LIMIT 1").bind(k.id, appId, a.creator_id).first() : null;
      if (d === "declined") {
        if (existing) return { msg: "This creator is already booked. To cancel, reply to the Colatch team and we'll handle it.", tone: "err" };
        const r = await t.prepare("UPDATE campaign_applications SET client_decision='declined', client_note=COALESCE(?, client_note) WHERE id=? AND (client_decision IS NULL OR client_decision <> 'declined')").bind(note, appId).run();
        return { msg: "Noted. We'll suggest a replacement.", tone: "ok", changed: r.meta.changes > 0, a };
      }
      if (!a.creator_id) return { msg: "This creator hasn't finished joining Colatch yet. The team will confirm them first.", tone: "err" };
      if (!a.rate_quote) return { msg: "This creator has no fee yet. The Colatch team will confirm it before you approve.", tone: "err" };
      await t.prepare("UPDATE campaign_applications SET client_decision='approved', client_note=COALESCE(?, client_note) WHERE id=?").bind(note, appId).run();
      let dealId = existing?.id || null, created = false;
      if (!dealId) {
        const ins = await t.prepare(
          `INSERT INTO creator_deals (id, creator_id, campaign_id, application_id, brand, deliverable, stage, fee, revisions_included, go_live_date, market_rate, reward_value, track_code)
           VALUES (?,?,?,?,?,?,'confirmed',?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING id`
        ).bind(crypto.randomUUID(), a.creator_id, k.id, appId, k.brand || k.client_company || "Confidential", k.deliverables, a.rate_quote, k.revisions ?? 2, k.shoot_date,
          marketRate({ rate_reel: a.rate_reel, followers: a.cf ?? a.followers }), k.reward_value, makeTrackCode(a.chandle || a.handle || "")).first();
        if (ins) { dealId = ins.id; created = true; }
        else dealId = (await t.prepare("SELECT id FROM creator_deals WHERE application_id=?").bind(appId).first())?.id;
        if (created) await t.prepare("INSERT INTO deal_events (id, deal_id, actor, kind, note) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), dealId, "brand", "created", "Brand approved this creator").run();
      }
      await audit({ kind: "brand", id: k.id }, d === "approved" ? "shortlist.approve" : "shortlist.decline", "application", appId, { dealId, created }, t);
      return { msg: "Approved. The creator is asked to accept the terms; the Colatch team then confirms payment details with you.", tone: "ok", changed: created, dealId, a };
    });
  } catch (e) {
    console.error("[shortlist] decide", e?.message);
    result = { msg: "Something went wrong saving that. Please try again.", tone: "err" };
  }
  if (result.changed && result.a) {
    const acct = await env.DB.prepare("SELECT email FROM creator_accounts WHERE creator_id=?").bind(result.a.creator_id).first().catch(() => null);
    const to = acct?.email || result.a.email;
    if (d === "approved") await notify({ template: "creator_approved", to, toKind: "creator", toId: result.a.creator_id, payload: { name: result.a.name, title: k.title, dealId: result.dealId }, dedupeKey: `creator_approved:${appId}` });
    else await notify({ template: "creator_declined", to, toKind: "creator", toId: result.a.creator_id, payload: { name: result.a.name, title: k.title }, dedupeKey: `creator_declined:${appId}` });
  }
  redirect(back(token, result.msg, result.tone));
}
async function approve(f) { "use server"; await decide(f, "approved"); }

/** #81 Save a creator to this brand's private roster (keyed by the brief's client email). */
async function saveRoster(f) {
  "use server";
  const token = String(f.get("token") ?? "");
  const k = await campaignFor(token);
  if (!k) notFound();
  const email = String(k.client_email || "").toLowerCase();
  const creator = String(f.get("creator") ?? "");
  if (email && creator) {
    await env.DB.prepare("INSERT OR IGNORE INTO brand_roster (id, brand_email, creator_id) VALUES (?,?,?)").bind(crypto.randomUUID(), email, creator).run();
  }
  redirect(back(token, "Saved to your roster. Rebook them in one click from My roster."));
}
async function decline(f) { "use server"; await decide(f, "declined"); }

const initials = (s) => String(s || "").replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const SHOW = [["all", "All"], ["waiting", "Waiting for you"], ["approved", "Approved"], ["passed", "Passed"]];
const istWhen = (iso) => { const t = Date.parse(String(iso || "")); return Number.isFinite(t) ? new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) + " IST" : ""; };

export default async function Page({ params, searchParams }) {
  const token = params.token;
  const k = await campaignFor(token);
  if (!k) notFound();

  const rows = (await env.DB.prepare(
    `SELECT a.*, c.profile_pic, c.rate_reel AS crate, c.followers AS cf, c.engagement_rate, c.quality_score, c.verified, c.skills, c.niche AS cniche, c.city AS ccity, c.language, c.portfolio_links, c.bio_pitch, c.avg_views
     FROM campaign_applications a LEFT JOIN creators c ON c.id=a.creator_id WHERE a.campaign_id=? AND a.status IN ('shortlisted','accepted') ORDER BY a.match_score DESC NULLS LAST`
  ).bind(k.id).all()).results ?? [];
  const approved = rows.filter((r) => r.client_decision === "approved");
  const deals = (await env.DB.prepare("SELECT d.*, c.name, c.handle, c.profile_pic FROM creator_deals d JOIN creators c ON c.id=d.creator_id WHERE d.campaign_id=? AND d.stage <> ? ORDER BY d.updated_at DESC").bind(k.id, "dropped").all()).results ?? [];
  const live = deals.filter((d) => d.live_at);
  const tSpend = deals.reduce((a, d) => a + (d.fee || 0), 0);
  const tViews = live.reduce((a, d) => a + (d.actual_views || 0), 0);
  const tClicks = deals.reduce((a, d) => a + (d.clicks || 0), 0);
  const tOrders = deals.reduce((a, d) => a + (d.orders || 0), 0);
  const tEng = live.reduce((a, d) => a + (d.likes || 0) + (d.comments || 0), 0);
  const liveSpend = live.reduce((a, d) => a + (d.fee || 0), 0);
  const actualCpv = tViews ? liveSpend / tViews : null;
  const promise = k.promised_cpv ? Number(k.promised_cpv) : null;
  // CPV = creator fees of live posts ÷ their views. A target only shows if the team agreed one for this campaign.
  const promiseLine = actualCpv == null ? "Shows once posts are live" : promise ? (actualCpv > promise ? `vs ₹${promise.toFixed(2)} agreed target: above target` : `vs ₹${promise.toFixed(2)} agreed target ✓`) : "across live posts";
  const ranked = [...live].filter((d) => d.fee && d.actual_views).sort((a, b) => a.fee / a.actual_views - b.fee / b.actual_views);
  const pct = feePct(env);
  const values = deals.map((d) => dealValue(env, d, pct));
  const tot = sumValue(values);
  const base = baselines(env);
  const brandEmail = String(k.client_email || "").toLowerCase();
  const myCode = brandEmail ? await ensureCode(env, "brand", brandEmail, k.client_company || k.brand).catch(() => null) : null;
  const rated = new Set(((await env.DB.prepare("SELECT deal_id FROM ratings WHERE by_side='brand' AND deal_id IN (SELECT id FROM creator_deals WHERE campaign_id=?)").bind(k.id).all()).results ?? []).map((r) => r.deal_id));
  const rush = Number(k.rush) === 1;
  // This brand's disputes per deal: an open one replaces the form; otherwise the latest outcome is shown.
  const disputes = {};
  for (const x of ((await env.DB.prepare("SELECT deal_id, status, reason, resolution FROM disputes WHERE raised_by_kind='brand' AND raised_by_id=? ORDER BY created_at").bind(k.id).all().catch(() => ({ results: [] }))).results ?? [])) {
    if (!disputes[x.deal_id] || disputes[x.deal_id].status !== "open") disputes[x.deal_id] = x;
  }
  // #65 repeat rate + #85 loyalty ladder, per creator.
  const fees = Object.fromEntries(await Promise.all(rows.map(async (r) => [r.id, await brandFeePct(env, brandEmail, r.creator_id, k.id).catch(() => ({ pct, reason: null, spent: 0, repeat: false }))])));
  const brandFee = await brandFeePct(env, brandEmail, null, k.id).catch(() => ({ pct, reason: null, spent: 0, repeat: false }));
  const allIn = (fee, rowId) => (fee ? quote(env, fee, false, fees[rowId]?.pct ?? pct, rush) : null);
  const saved = new Set(brandEmail ? (((await env.DB.prepare("SELECT creator_id FROM brand_roster WHERE brand_email=?").bind(brandEmail).all()).results ?? []).map((x) => x.creator_id)) : []);
  // Money Colatch actually holds for this brand right now: recorded as received, not yet paid out or refunded.
  const held = deals.filter((d) => d.pay_status === "funded" || d.pay_status === "released");
  const atStake = held.reduce((a, d) => a + (d.brand_paid_paise != null ? Number(d.brand_paid_paise) / 100 : d.fee || 0), 0);
  const booked = new Set(deals.filter((d) => d.stage !== "cancelled" && d.application_id).map((d) => d.application_id));
  const bookedCreators = new Set(deals.filter((d) => d.stage !== "cancelled").map((d) => d.creator_id));
  // Approved = the brand said yes, or the creator is already booked on this brief. Fees come from the booked deals.
  const approvedOrBooked = rows.filter((r) => r.client_decision === "approved" || booked.has(r.id) || (r.creator_id && bookedCreators.has(r.creator_id)));
  // Expected views count the same creators as "Creators approved": said yes, or already booked.
  const views = approvedOrBooked.reduce((s, r) => s + (r.avg_views || 0), 0);
  const spend = deals.filter((d) => d.stage !== "cancelled").reduce((a, d) => a + (d.fee || 0), 0) || approved.reduce((a, r) => a + (r.rate_quote || 0), 0);
  const priced = Object.fromEntries(await Promise.all(deals.map(async (d) => [d.id, await priceDeal(env, d, k).catch(() => null)])));
  const drafts = deals.filter((d) => d.draft_status === "submitted" && d.stage !== "cancelled");
  const waitingOnYou = rows.filter((r) => !r.client_decision && !booked.has(r.id) && !(r.creator_id && bookedCreators.has(r.creator_id)));
  const loyaltyGap = Math.max(0, feePct(env) - brandFee.pct);
  const origin = `https://${headers().get("host")}`;
  // Header only: a signed-in brand keeps its own nav here. Access to this page is still the share link.
  const signedIn = await currentBrand().catch(() => null);
  // Deal room per booked creator: messages, shipment status (never the address) and usage rights.
  const brandReader = { kind: "brand", id: k.id };
  for (const d of deals) await syncUsageStart(d).catch(() => false);
  const threads = deals.length ? await messagesForCampaign(k.id).catch(() => ({})) : {};
  const unreadBy = deals.length ? await unreadForCampaign(k.id, brandReader).catch(() => ({})) : {};
  if (Object.keys(threads).length) await markCampaignRead(k.id, brandReader).catch(() => {});
  const shipBy = deals.length ? await shipmentStatusForCampaign(k.id).catch(() => ({})) : {};
  const roomDeals = deals.filter((d) => d.stage !== "cancelled" || (threads[d.id] || []).length);

  // ---- Shapes for the page, all from the rows above (no extra queries).
  const isBooked = (r) => booked.has(r.id) || (r.creator_id && bookedCreators.has(r.creator_id));
  const stateOf = (r) => (isBooked(r) ? "booked" : r.client_decision === "approved" ? "approved" : r.client_decision === "declined" ? "passed" : "waiting");
  const show = SHOW.some(([v]) => v === searchParams?.show) ? searchParams.show : "all";
  const count = { all: rows.length, waiting: waitingOnYou.length, approved: rows.filter((r) => ["approved", "booked"].includes(stateOf(r))).length, passed: rows.filter((r) => stateOf(r) === "passed").length };
  const shown = show === "all" ? rows : rows.filter((r) => (show === "approved" ? ["approved", "booked"].includes(stateOf(r)) : stateOf(r) === show));
  const active = deals.filter((d) => d.stage !== "cancelled");
  const unreadTotal = Object.values(unreadBy).reduce((a, n) => a + (Number(n) || 0), 0);
  const need = k.creators_needed || rows.length;
  const steps = [
    ["Brief in", true],
    ["Shortlist", rows.length > 0],
    // Done once nobody waits on the brand, or once enough creators are approved or booked for the brief.
    ["You approve", rows.length > 0 && approvedOrBooked.length > 0 && (waitingOnYou.length === 0 || (need > 0 && approvedOrBooked.length >= need))],
    ["Booked and paid", active.length > 0 && active.every((d) => ["funded", "released", "paid"].includes(d.pay_status))],
    ["Drafts approved", active.length > 0 && active.every((d) => d.draft_status === "approved" || d.live_at)],
    ["Live", active.length > 0 && active.every((d) => d.live_at)],
  ];
  const nowAt = steps.findIndex(([, done]) => !done);
  // The rail reads in order: every step after the current one stays open, even if part of it has started.
  const rail = steps.map(([label, done], i) => ({ label, state: nowAt === -1 || i < nowAt ? "done" : i === nowAt ? "now" : "todo" }));
  const myMoves = drafts.length + waitingOnYou.length;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const sel = (v) => {
    const q = new URLSearchParams(); if (v !== "all") q.set("show", v);
    const s = q.toString(); return `/shortlist/${encodeURIComponent(token)}${s ? "?" + s : ""}#creators`;
  };
  const brandName = k.brand || k.client_company || "";
  const factItems = [
    { label: "Creators needed", value: k.creators_needed ? String(k.creators_needed) : null },
    { label: "Deliverables", value: k.deliverables },
    { label: "Budget", value: k.budget_total ? inr(k.budget_total) : null },
    { label: "Pay", value: PAY_LABEL[k.pay_type || "cash"] },
    { label: "Apply by", value: k.deadline ? day(k.deadline) || k.deadline : null },
    { label: "Cost-per-view target", value: promise ? `₹${promise.toFixed(2)} per view` : null },
    { label: "Rush", value: rush ? `Yes, adds ${RUSH_PCT}% of creator fees` : null },
  ];

  const hero = (
    <PageHeader variant="hero"
      crumbs={signedIn ? [{ label: "My campaigns", href: "/brand" }, { label: "Shortlist" }] : undefined}
      eyebrow={`Your Colatch shortlist${brandName ? ` · ${brandName}` : ""}`}
      title={k.title || "Your shortlist"}
      sub={`Prepared for ${k.client_name || k.client_company || k.brand || "you"} by the Colatch team. ${rows.length} ${rows.length === 1 ? "creator" : "creators"} picked. Fees shown are the creator's quote; the all-in price with Colatch's fee and GST is under each one.`}
      meta={[
        { label: "Waiting for you", value: myMoves },
        { label: "Booked", value: active.length },
        { label: "Live", value: live.length },
      ]}>
      <div className="v2b-hero-tags"><Tags items={[...requirementChips(k), PAY_LABEL[k.pay_type || "cash"]]} max={8} /></div>
    </PageHeader>
  );

  const creatorCard = (r) => {
    const b = erBand(r.engagement_rate, r.cf ?? r.followers);
    const links = String(r.portfolio_links || "").split(/\s+/).map(safeUrl).filter(Boolean).slice(0, 3);
    const q = allIn(r.rate_quote, r.id);
    const fr = fees[r.id];
    const sv = r.rate_quote ? quoteSavings(env, { rate_reel: r.crate, followers: r.cf ?? r.followers }, r.rate_quote, fr?.pct ?? pct) : null;
    const fit = q ? budgetFit(k.budget_total, k.creators_needed, q.total) : null;
    const st = stateOf(r);
    const pic = safeUrl(r.profile_pic);
    return (
      <article key={r.id} className={`v2b-cc v2b-cc--${st}`} aria-labelledby={`cc-${r.id}`}>
        <header className="v2b-cc__head">
          <Avatar name={r.name || r.handle} initials={initials(r.name || r.handle)} src={pic || undefined} size={52} />
          <div className="v2b-cc__who">
            <h3 id={`cc-${r.id}`}>{r.name || r.handle}{r.verified ? <span className="v2b-tick" title="Instagram-verified"> ✓</span> : ""}</h3>
            <p><a className="link" href={`https://instagram.com/${encodeURIComponent(String(r.handle || "").replace(/[^a-z0-9._]/gi, ""))}`} {...EXT}>@{r.handle}</a>{r.ccity || r.city ? ` · ${r.ccity || r.city}` : ""}</p>
          </div>
          <div className="v2b-cc__state">
            {st === "booked" ? <Pill tone="done">Booked</Pill> : st === "approved" ? <Pill tone="done">Approved</Pill> : st === "passed" ? <Pill tone="off">Declined</Pill> : <Pill tone="mine">Waiting for you</Pill>}
            <div className="score sm" style={{ "--v": r.match_score ?? 50 }} title="Match score"><i>{r.match_score ?? "—"}</i></div>
          </div>
        </header>
        <dl className="v2b-cc__stats">
          <div><dt>Followers</dt><dd><b>{compact(r.cf ?? r.followers)}</b><small>{r.verified ? "From Instagram" : "Self-reported"}</small></dd></div>
          <div><dt>Engagement</dt><dd><b>{r.engagement_rate != null ? `${r.engagement_rate}%` : "—"}</b>{r.engagement_rate != null && <small><span className={`pill ${b.tone}`}>{b.label}</span></small>}</dd></div>
          <div><dt>Avg reel views</dt><dd><b>{compact(r.avg_views)}</b></dd></div>
          <div><dt>Creator quote</dt><dd><b>{inr(r.rate_quote)}</b>{r.rate_quote && r.avg_views ? <small>₹{(r.rate_quote / r.avg_views).toFixed(2)} per view</small> : null}</dd></div>
        </dl>
        {(q || (sv && (sv.vsMarket || sv.vsAgency)) || fit) && <div className="v2b-cc__money">
          {q && <details><summary>All-in {inr(q.total)}</summary><p className="hint">Creator {inr(q.creatorFee)} · Colatch {q.basePct}% {inr(q.colatch - q.rushFee)}{q.rushFee ? ` · Rush ${RUSH_PCT}% ${inr(q.rushFee)}` : ""} · GST {inr(q.gstOnColatch)}{r.rate_quote && r.avg_views ? " · ₹" + (r.rate_quote / r.avg_views).toFixed(2) + " per view" : ""}{fr?.reason ? <><br /><b className="v2b-accent">{fr.reason}</b></> : null}</p></details>}
          {sv && (sv.vsMarket || sv.vsAgency) ? <div className="save">{sv.vsMarket ? <span>{inr(sv.vsMarket)} under this creator's usual rate</span> : null}{sv.vsAgency ? <span>{inr(sv.vsAgency)} under agency pricing</span> : null}</div> : null}
          {fit && <span className={`fit ${fit.tone}`}>{fit.label}</span>}
        </div>}
        {r.team_note && <p className="v2b-cc__why"><b>Why we picked them:</b> {r.team_note}</p>}
        {!r.team_note && r.match_reasons && <p className="hint v2b-cc__reasons">{r.match_reasons}</p>}
        {(links.length > 0 || (brandEmail && r.creator_id)) && <div className="v2b-cc__links">
          {links.map((u, i) => <a key={u} className="btn sm" href={u} {...EXT}>Sample {i + 1} ↗</a>)}
          {brandEmail && r.creator_id && (saved.has(r.creator_id)
            ? <span className="hint v2b-accent">In your roster ✓</span>
            : <form action={saveRoster}><input type="hidden" name="token" value={token} /><input type="hidden" name="creator" value={r.creator_id} /><button className="btn sm">Save to my roster</button></form>)}
        </div>}
        {st === "booked"
          ? <div className="note good v2b-cc__decide">Booked. Track this creator under "Campaign progress" below.</div>
          : <form action={approve} className="v2b-cc__decide">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="app" value={r.id} />
            <input className="in" name="note" placeholder="Note for the Colatch team" aria-label="Note for the Colatch team (optional)" defaultValue={r.client_note ?? ""} />
            <div className="v2b-cc__btns">
              <button className="btn" formAction={decline}>Not for us</button>
              {r.rate_quote ? <button className="btn plum">Approve</button> : <span className="hint">Fee being confirmed by the Colatch team</span>}
            </div>
          </form>}
      </article>
    );
  };

  const dealColumns = [
    { key: "who", label: "Creator", render: (d) => (
      <span className="v2b-who"><Avatar name={d.name || d.handle} initials={initials(d.name || d.handle)} src={safeUrl(d.profile_pic) || undefined} size={32} ring={false} /><Cell title={d.name || d.handle} sub={d.deliverable} /></span>
    ) },
    { key: "progress", label: "Progress", primary: true, render: (d) => {
      const done = railDone(d);
      const at = done.lastIndexOf(true);
      return (<>
        <span className="dots" role="img" aria-label={`${done.filter(Boolean).length} of ${RAIL.length} steps done`}>{RAIL.map((r, i) => <i key={r.key} className={done[i] ? "on" : ""} title={r.label} />)}</span>
        <div className="hint">{d.stage === "cancelled" ? "Cancelled" : at < 0 ? "Waiting for the creator to accept terms" : RAIL[at].label}</div>
        {priced[d.id] && <div className="hint">All-in {inr(priced[d.id].total)}{priced[d.id].frozen ? " (as paid)" : ""}</div>}
      </>);
    } },
    { key: "views", label: "Views", num: true, render: (d) => compact(d.actual_views) },
    { key: "cpv", label: "CPV", num: true, render: (d) => (d.fee && d.actual_views ? "₹" + (d.fee / d.actual_views).toFixed(2) : "—") },
    { key: "clicks", label: "Clicks", num: true, render: (d) => d.clicks },
    { key: "post", label: "Post", className: "wide", render: (d) => {
      const post = d.live_at ? safeUrl(d.post_url) : null;
      return (<div className="v2b-post">
        {post ? <a className="link" href={post} {...EXT}>View ↗</a> : d.live_at && d.post_url ? <span className="hint">{String(d.post_url).slice(0, 60)}</span> : <span className="hint">Not live yet</span>}
        {d.live_at && !d.brand_signoff_at && <form action={signoff} style={{ marginTop: 6 }}><input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} /><label className="hint v2b-check"><input type="checkbox" name="public" value="1" defaultChecked /> creator may show it as proof</label><button className="btn sm plum">Sign off work</button></form>}
        {d.brand_signoff_at && <div className="hint v2b-accent">Signed off ✓</div>}
        {d.stage !== "cancelled" && (disputes[d.id]?.status === "open"
          ? <div style={{ marginTop: 6 }}><span className="pill mine">Dispute open</span></div>
          : <details style={{ marginTop: 6 }}>
              <summary className="hint" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Something wrong? Raise a dispute</summary>
              {disputes[d.id] && <div className="hint" style={{ margin: "4px 0", maxWidth: 280 }}><span className={`pill ${disputes[d.id].status === "resolved" ? "good" : "low"}`}>{disputes[d.id].status === "resolved" ? "Resolved" : "Not upheld"}</span> {disputes[d.id].resolution}</div>}
              <form action={dispute} className="stack" style={{ gap: 6, marginTop: 6, minWidth: 0 }}>
                <input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} />
                <label className="hint" htmlFor={`dr-${d.id}`}>What it's about</label>
                <select className="in" id={`dr-${d.id}`} name="reason" required defaultValue="">{[<option key="" value="" disabled>Choose one</option>, ...Object.entries(REASONS).map(([key, l]) => <option key={key} value={key}>{l}</option>)]}</select>
                <label className="hint" htmlFor={`dd-${d.id}`}>What happened</label>
                <textarea className="in" id={`dd-${d.id}`} name="detail" rows={3} required minLength={10} maxLength={2000} placeholder="Dates, what was agreed, and what went wrong." />
                <button className="btn sm" style={{ minHeight: 44 }}>Send dispute</button>
              </form>
            </details>)}
        {d.live_at && !rated.has(d.id) && <form action={rate} className="row" style={{ gap: 4, marginTop: 6, flexWrap: "nowrap" }}><input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} /><select className="in" name="stars" aria-label="Your rating" style={{ width: "auto", padding: "4px 6px", fontSize: 12 }}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select><button className="btn sm">Rate</button></form>}
      </div>);
    } },
  ];

  const aside = (<>
    {deals.some((d) => d.live_at) && (
      <AsideCard tone="night" eyebrow="Value delivered by Colatch" title={<span className="v2b-big ui-foil">{inr(tot.saved + tot.adsEquivalent + tot.sales)}</span>}>
        <Facts label="How the value adds up" items={[
          { label: "Saved vs market rates", value: inr(tot.savedVsMarket) },
          { label: `Saved vs ${base.agencyPct}% agency markup`, value: inr(tot.savedVsAgency) },
          { label: "Views, as paid-ads value", value: <>{inr(tot.adsEquivalent)}{tot.adsMultiple ? <small>{tot.adsMultiple.toFixed(1)}× your creator spend</small> : null}</> },
          { label: "Sales from creator codes", value: <>{inr(tot.sales)}{tot.roas ? <small>{tot.roas.toFixed(1)}× return</small> : null}</> },
        ]} />
        <p className="small">How we count: market rate is each creator's own rate card, or the typical rate for their size. Agency markup baseline is {base.agencyPct}% (typical range 15–30%) against Colatch's {pct}%. Paid-ads value uses ₹{base.cpm} per 1,000 views. Sales come from the tracked codes and links.</p>
      </AsideCard>
    )}
    <AsideCard eyebrow="The brief" title="What you asked for">
      <Tags items={[...requirementChips(k), PAY_LABEL[k.pay_type || "cash"]]} max={8} />
      <Facts label="Brief details" items={factItems} />
    </AsideCard>
    {(rows.length > 0 || deals.length > 0) && (
      <AsideCard eyebrow="Booking through Colatch" title="What you'd give up going direct"
        foot={brandEmail ? <a href={`/roster/${encodeURIComponent(token)}`}>My roster{saved.size ? ` (${saved.size})` : ""}</a> : null}>
        <ul className="v2b-loss">
          <li><b>Payment held until verified</b><span>{atStake ? `${inr(atStake)} of your payments recorded and held; each creator is paid only after their post is checked live` : "Creators are paid only after their post is checked live by the Colatch team"}</span></li>
          <li><b>Replacement help</b><span>If a creator drops out before posting, we suggest a matched replacement</span></li>
          {k.promised_cpv ? <li><b>Agreed cost-per-view target</b><span>₹{Number(k.promised_cpv).toFixed(2)} per view, as agreed for this campaign</span></li> : null}
          <li><b>Signed proof of work</b><span>Dated certificate with views, value and both sign-offs</span></li>
          <li><b>Repeat booking rate</b><span>Rebook any creator through Colatch at 12% instead of {feePct(env)}%</span></li>
          <li><b>Loyalty rate</b><span>{loyaltyGap > 0 ? `You're on ${brandFee.pct}% already (${brandFee.reason})` : "1 point off our fee for every ₹5L you spend in a year, down to 10%"}</span></li>
        </ul>
      </AsideCard>
    )}
    {myCode && (
      <AsideCard eyebrow="Refer a brand" title="Know another brand that needs creators?">
        <p className="small">Share <code className="k v2b-code">{origin}/r/{myCode}</code>. For 12 months you get credit off your Colatch invoices on every campaign they run.</p>
      </AsideCard>
    )}
  </>);

  return (
    <PublicShell mode="client" brandName={signedIn ? signedIn.name || signedIn.email : null} hero={hero}>
      <div className="pg-shortlist v2b">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="v2b-flash"><Flash sp={searchParams} /></div>

        <StatusRail label="Campaign progress" steps={rail}
          badge={myMoves > 0 ? <Pill tone="mine">Your move</Pill> : rows.length ? <Pill tone="wait">With Colatch</Pill> : null}
          note={drafts.length ? <>Next: <a className="link" href="#drafts">review {plural(drafts.length, "draft", "drafts")}</a>{waitingOnYou.length ? <>, then <a className="link" href="#creators">decide on {plural(waitingOnYou.length, "creator", "creators")}</a></> : null}.</>
            : waitingOnYou.length ? <>Next: <a className="link" href="#creators">approve or pass on {plural(waitingOnYou.length, "creator", "creators")}</a>.</>
            : !rows.length ? "The Colatch team is picking creators who fit. This page updates as soon as they're added."
            : active.length && live.length < active.length ? "With the creators and the Colatch team now. We'll email you when a draft is ready."
            : null} />

        <KpiStrip label="Campaign at a glance" items={[
          { label: "Creators approved", value: `${approvedOrBooked.length} / ${need || 0}`, foot: waitingOnYou.length ? `${waitingOnYou.length} waiting for you` : "creators, including booked", href: "#creators" },
          { featured: true, label: "Creator fees committed", value: inrShort(spend), title: inrFull(spend), foot: "before Colatch fee + GST" },
          live.length
            ? { label: "Views", value: compact(tViews), foot: `${live.length} of ${deals.length} posts live` }
            : { label: "Expected views", value: compact(views), foot: spend && views ? `≈ ₹${(spend / views).toFixed(2)} per view` : "from avg reel views" },
          { label: "Cost per view", value: actualCpv != null ? "₹" + actualCpv.toFixed(2) : "—", foot: promiseLine },
        ]} />

        <Grid aside={aside}>
          {myMoves > 0 ? (
            <Section id="brand-move" title="Your move" sub={`${plural(myMoves, "thing needs", "things need")} you. Everything else is with the creators and the Colatch team.`}>
              <div className="sheet">
                {drafts.length > 0 && <MoveRow kind="mine" href="#drafts" title={drafts.length === 1 ? "Review 1 draft" : `Review ${drafts.length} drafts`} sub={drafts.map((d) => d.name || d.handle).join(", ")} cta="Review" />}
                {waitingOnYou.length > 0 && <MoveRow kind="mine" href="#creators" title={waitingOnYou.length === 1 ? "Approve or pass on 1 creator" : `Approve or pass on ${waitingOnYou.length} creators`} sub={waitingOnYou.map((r) => r.name || r.handle).slice(0, 4).join(", ") + (waitingOnYou.length > 4 ? ` and ${waitingOnYou.length - 4} more` : "")} cta="Decide" />}
              </div>
            </Section>
          ) : rows.length > 0 ? (
            <div className="allclear"><b>Nothing needs you right now.</b> We'll email you when a draft is ready or a new creator is added.</div>
          ) : null}

          {drafts.length > 0 && (
            <Section id="drafts" title="Drafts waiting for your review" sub="Approve to let the creator post, or say what should change.">
              <div className="v2b-drafts">{drafts.map((d) => {
                const u = safeUrl(d.draft_url);
                const left = Math.max(0, Number(d.revisions_included || 0) - Number(d.revisions_used || 0));
                return (
                  <Card key={d.id} className="v2b-draft">
                    <div className="v2b-draft__head">
                      <Avatar name={d.name || d.handle} initials={initials(d.name || d.handle)} src={safeUrl(d.profile_pic) || undefined} size={40} />
                      <div className="v2b-draft__who"><b>{d.name || d.handle}</b><span className="hint">{d.deliverable}</span></div>
                      {u ? <a className="btn sm" href={u} {...EXT}>Open the draft ↗</a> : null}
                    </div>
                    {!u && <p className="hint">Draft link: {String(d.draft_url || "").slice(0, 120)}</p>}
                    {d.auto_approve_at && <p className="hint v2b-draft__auto">Approved automatically after {istWhen(d.auto_approve_at) || String(d.auto_approve_at).slice(0, 16).replace("T", " ") + " UTC"} if you don't reply</p>}
                    <div className="v2b-draft__acts">
                      <form action={approveDraft}><input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} /><button className="btn sm plum">Approve draft</button></form>
                      <form action={requestChanges} className="v2b-draft__change"><input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} />
                        <input className="in" name="note" required minLength={3} placeholder="What should change?" aria-label={`What should change in ${d.name || d.handle}'s draft?`} />
                        <button className="btn sm">Request changes</button></form>
                    </div>
                    <p className="hint">{left > 0 ? `${left} revision ${left === 1 ? "round" : "rounds"} included` : "Included revision rounds are used up; more rounds are logged as extra."}</p>
                  </Card>
                );
              })}</div>
            </Section>
          )}

          <Section id="creators" title="Creators for this brief" sub={rows.length ? `${plural(rows.length, "creator", "creators")} picked by the Colatch team, best match first.` : undefined}>
            {rows.length > 0 && <FilterBar label="Filter creators">
              <FilterChips name="show" label="Show creators" current={show} hrefFor={sel} options={SHOW.map(([value, label]) => ({ value, label, count: count[value] }))} />
            </FilterBar>}
            {!rows.length
              ? <EmptyState title="Your shortlist is being prepared." body="The Colatch team will add creators here. This page updates as soon as they do." action={<a className="btn sm" href="/faq">How shortlists work</a>} />
              : !shown.length
                ? <EmptyState title="No creators here." body="Nobody on your shortlist is in this group right now." action={<a className="btn sm" href={sel("all")}>Show all creators</a>} />
                : <div className="v2b-cards">{shown.map(creatorCard)}</div>}
          </Section>

          {deals.length > 0 && (
            <Section id="progress" title="Campaign progress" sub={`${plural(deals.length, "creator", "creators")} booked · ${live.length} live`}
              actions={<><a className="btn sm" href={`/receipt/${params.token}`}>Value receipt</a><a className="btn sm" href={`/brief?again=${encodeURIComponent(token)}`}>Book again</a></>}>
              <MiniStats label="Results so far" items={[
                { label: "Booked", value: inrShort(tSpend), title: inrFull(tSpend), note: `creator fees, ${plural(deals.length, "creator", "creators")}` },
                { label: "Engagement", value: compact(tEng), note: tEng && liveSpend ? "₹" + (liveSpend / tEng).toFixed(2) + " per engagement" : "likes + comments" },
                { label: "Link clicks", value: compact(tClicks), note: "from tracked creator links" },
                { label: "Orders", value: tOrders || "—", note: "from creator codes" },
              ]} />
              <DataTable caption="Booked creators" rows={deals} columns={dealColumns} />
              {ranked.length > 1 && <p className="hint v2b-best">Best value so far: <b>{ranked[0].name || ranked[0].handle}</b> at ₹{(ranked[0].fee / ranked[0].actual_views).toFixed(2)} per view.</p>}
            </Section>
          )}

          {roomDeals.length > 0 && (
            <Section id="room" className="dr-room" title="Messages, products and usage" sub={unreadTotal ? `${plural(unreadTotal, "new message", "new messages")}` : "One thread per booked creator, with the Colatch team in it."}>
              <div className="stack">{roomDeals.map((d) => {
                const unread = unreadBy[d.id] || 0;
                const ships = shipBy[d.id] || [];
                const u = usageStatus(d);
                const closedDeal = d.stage === "cancelled" || d.pay_status === "refunded";
                return (
                  <details key={d.id} id={`deal-${d.id}`} className="panel pad dr-panel" open={unread > 0}>
                    <summary className="dr-sum">
                      <span className="dr-sum-who"><b>{d.name || d.handle}</b><span className="hint">{d.deliverable}</span></span>
                      <span className="row" style={{ gap: 6 }}>
                        {unread > 0 && <span className="pill dr-new">{unread} new</span>}
                        {ships.length > 0 && <ShipPill status={ships[ships.length - 1].status} />}
                        {u.state === "expired" && <span className="dr-ship dr-ship-returned">Usage expired</span>}
                      </span>
                    </summary>
                    <div className="dr-room-body">
                      {(ships.length > 0 || u.state !== "none") && <div className="dr-room-side">
                        <ShipmentStatus shipments={ships} showCarrier={false} title={ships.length ? "Product" : ""} />
                        {u.state !== "none" && <UsageLine d={d} style={{ marginTop: ships.length ? 12 : 0 }} />}
                      </div>}
                      <DealThread id={`thread-${d.id}`} messages={threads[d.id] || []} me="brand" unread={unread} action={brandMessage} canPost={!closedDeal} compact
                        hidden={[["token", token], ["deal", d.id]]} mid={crypto.randomUUID()} names={{ creator: d.name || d.handle }} readOnlyNote="This deal is closed, so messages are off." />
                    </div>
                  </details>
                );
              })}</div>
            </Section>
          )}
        </Grid>
      </div>
    </PublicShell>
  );
}
