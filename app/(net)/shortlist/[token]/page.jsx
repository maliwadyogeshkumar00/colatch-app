import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import PublicShell, { Hero } from "../../_ui/PublicShell";
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
import { audit } from "@/lib/net/security";

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
.pg-shortlist .save span{font-size:12px;font-weight:600;color:var(--good)}
.pg-shortlist .fit{display:inline-block;margin-top:6px;font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px}
.pg-shortlist .fit.good{background:rgba(31,122,80,.12);color:var(--good)}.pg-shortlist .fit.ok{background:rgba(200,150,46,.15);color:var(--gold-deep)}.pg-shortlist .fit.bad{background:rgba(155,59,59,.1);color:var(--crit)}
.pg-shortlist .loss{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}
.pg-shortlist .loss div{padding:12px 14px;border-radius:12px;background:var(--paper);border:1px solid var(--line)}
.pg-shortlist .loss b{display:block;font-size:13.5px}.pg-shortlist .loss span{font-size:12px;color:var(--ink-3)}
@media(max-width:760px){.pg-shortlist .loss{grid-template-columns:1fr}}
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

export default async function Page({ params, searchParams }) {
  const token = params.token;
  const k = await campaignFor(token);
  if (!k) notFound();

  const rows = (await env.DB.prepare(
    `SELECT a.*, c.profile_pic, c.rate_reel AS crate, c.followers AS cf, c.engagement_rate, c.quality_score, c.verified, c.skills, c.niche AS cniche, c.city AS ccity, c.language, c.portfolio_links, c.bio_pitch, c.avg_views
     FROM campaign_applications a LEFT JOIN creators c ON c.id=a.creator_id WHERE a.campaign_id=? AND a.status IN ('shortlisted','accepted') ORDER BY a.match_score DESC NULLS LAST`
  ).bind(k.id).all()).results ?? [];
  const approved = rows.filter((r) => r.client_decision === "approved");
  const spend = approved.reduce((s, r) => s + (r.rate_quote || 0), 0);
  const views = approved.reduce((s, r) => s + (r.avg_views || 0), 0);
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
  const priced = Object.fromEntries(await Promise.all(deals.map(async (d) => [d.id, await priceDeal(env, d, k).catch(() => null)])));
  const drafts = deals.filter((d) => d.draft_status === "submitted" && d.stage !== "cancelled");
  const waitingOnYou = rows.filter((r) => !r.client_decision && !booked.has(r.id) && !(r.creator_id && bookedCreators.has(r.creator_id)));
  const loyaltyGap = Math.max(0, feePct(env) - brandFee.pct);
  const origin = `https://${headers().get("host")}`;
  const darkTag = { background: "rgba(255,255,255,.1)", color: "#F4EFE3" };
  const lblDim = { color: "rgba(244,239,227,.6)" };

  const hero = (
    <Hero eyebrow={`Your Colatch shortlist · ${k.brand || k.client_company || ""}`} title={escapeHtml(k.title)}>
      <p>Prepared for {k.client_name || k.client_company || k.brand || "you"} by the Colatch team. {rows.length} {rows.length === 1 ? "creator" : "creators"} picked. Fees shown are the creator's quote; the all-in price with Colatch's fee and GST is under each one.</p>
      <div className="row" style={{ marginTop: 16, gap: 8 }}>{requirementChips(k).map((r) => <span key={r} className="tag" style={darkTag}>{r}</span>)}<span className="tag" style={darkTag}>{PAY_LABEL[k.pay_type || "cash"]}</span></div>
    </Hero>
  );

  return (
    <PublicShell mode="client" hero={hero}>
      <div className="pg-shortlist">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>
        {(drafts.length > 0 || waitingOnYou.length > 0) ? (
          <section className="sheet" aria-labelledby="brand-move" style={{ marginBottom: 28 }}>
            <div className="sheet__h"><h2 id="brand-move">Your move</h2><span className="n">{drafts.length + waitingOnYou.length}</span></div>
            {drafts.length > 0 && <MoveRow kind="mine" href="#drafts" title={drafts.length === 1 ? "Review 1 draft" : `Review ${drafts.length} drafts`} sub={drafts.map((d) => d.name || d.handle).join(", ")} cta="Review" />}
            {waitingOnYou.length > 0 && <MoveRow kind="mine" href="#creators" title={waitingOnYou.length === 1 ? "Approve or pass on 1 creator" : `Approve or pass on ${waitingOnYou.length} creators`} sub={waitingOnYou.map((r) => r.name || r.handle).slice(0, 4).join(", ") + (waitingOnYou.length > 4 ? ` and ${waitingOnYou.length - 4} more` : "")} cta="Decide" />}
          </section>
        ) : rows.length > 0 ? (
          <div className="allclear" style={{ marginBottom: 28 }}><b>Nothing needs you right now.</b> We'll email you when a draft is ready or a new creator is added.</div>
        ) : null}
        {drafts.length > 0 && <div className="panel pad" style={{ marginBottom: 22 }} id="drafts">
          <h2 style={{ marginTop: 0 }}>Drafts waiting for your review</h2>
          <div className="stack">{drafts.map((d) => {
            const u = safeUrl(d.draft_url);
            const left = Math.max(0, Number(d.revisions_included || 0) - Number(d.revisions_used || 0));
            return (
              <div key={d.id} className="box" style={{ padding: 14 }}>
                <div className="spread"><b>{d.name || d.handle}</b><span className="hint">{d.auto_approve_at ? `Approved automatically after ${String(d.auto_approve_at).slice(0, 16).replace("T", " ")} UTC if you don't reply` : ""}</span></div>
                <div style={{ margin: "8px 0" }}>{u ? <a className="btn sm" href={u} {...EXT}>Open the draft ↗</a> : <span className="hint">Draft link: {String(d.draft_url || "").slice(0, 120)}</span>}</div>
                <form action={approveDraft} className="row" style={{ gap: 8 }}><input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} /><button className="btn sm plum">Approve draft</button></form>
                <form action={requestChanges} className="row" style={{ gap: 8, marginTop: 8 }}><input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} />
                  <input className="in" name="note" required minLength={3} style={{ flex: 1, minWidth: 200 }} placeholder="What should change?" />
                  <button className="btn sm">Request changes</button></form>
                <div className="hint" style={{ marginTop: 6 }}>{left > 0 ? `${left} revision ${left === 1 ? "round" : "rounds"} included` : "Included revision rounds are used up; more rounds are logged as extra."}</div>
              </div>
            );
          })}</div>
        </div>}
        <section id="creators" aria-labelledby="creators-h" style={{ marginBottom: 34 }}>
        <div className="sheet__h"><h2 id="creators-h">Creators for this brief</h2><span className="n">{rows.length}</span></div>
        <div className="stack">
          {rows.map((r) => {
            const b = erBand(r.engagement_rate, r.cf ?? r.followers);
            const links = String(r.portfolio_links || "").split(/\s+/).map(safeUrl).filter(Boolean).slice(0, 3);
            const q = allIn(r.rate_quote, r.id);
            const fr = fees[r.id];
            const sv = r.rate_quote ? quoteSavings(env, { rate_reel: r.crate, followers: r.cf ?? r.followers }, r.rate_quote, fr?.pct ?? pct) : null;
            const fit = q ? budgetFit(k.budget_total, k.creators_needed, q.total) : null;
            return (
              <div key={r.id} className="panel pad">
                <div className="spread" style={{ alignItems: "flex-start" }}>
                  <div className="who"><div className="ava" style={{ width: 56, height: 56 }}>{safeUrl(r.profile_pic) ? <img src={safeUrl(r.profile_pic)} alt="" /> : initials(r.name || r.handle)}</div>
                    <div><b style={{ fontSize: 17 }}>{r.name || r.handle}{r.verified ? " ✓" : ""}</b><span><a className="link" href={`https://instagram.com/${encodeURIComponent(String(r.handle || "").replace(/[^a-z0-9._]/gi, ""))}`} {...EXT}>@{r.handle}</a>{r.ccity || r.city ? ` · ${r.ccity || r.city}` : ""}</span></div></div>
                  <div className="row" style={{ gap: 8 }}>
                    {r.client_decision === "approved" ? <span className="pill good">Approved</span> : r.client_decision === "declined" ? <span className="pill low">Declined</span> : <span className="pill ok">Waiting for you</span>}
                    <div className="score sm" style={{ "--v": r.match_score ?? 50 }} title="Match score"><i>{r.match_score ?? "—"}</i></div>
                  </div>
                </div>
                <div className="grid4" style={{ marginTop: 16 }}>
                  <div><div className="lbl">Followers</div><b>{compact(r.cf ?? r.followers)}</b>{r.verified ? <div className="hint">From Instagram</div> : <div className="hint">Self-reported</div>}</div>
                  <div><div className="lbl">Engagement</div><b>{r.engagement_rate != null ? `${r.engagement_rate}%` : "—"}</b> {r.engagement_rate != null && <span className={`pill ${b.tone}`}>{b.label}</span>}</div>
                  <div><div className="lbl">Avg reel views</div><b>{compact(r.avg_views)}</b></div>
                  <div><div className="lbl">Creator quote</div><b>{inr(r.rate_quote)}</b>{q && <details style={{ marginTop: 4 }}><summary className="hint" style={{ cursor: "pointer" }}>All-in {inr(q.total)}</summary><div className="hint" style={{ marginTop: 4 }}>Creator {inr(q.creatorFee)} · Colatch {q.basePct}% {inr(q.colatch - q.rushFee)}{q.rushFee ? ` · Rush ${RUSH_PCT}% ${inr(q.rushFee)}` : ""} · GST {inr(q.gstOnColatch)}{r.rate_quote && r.avg_views ? " · ₹" + (r.rate_quote / r.avg_views).toFixed(2) + " per view" : ""}{fr?.reason ? <><br /><b style={{ color: "var(--good)" }}>{fr.reason}</b></> : null}</div></details>}
                    {sv && (sv.vsMarket || sv.vsAgency) ? <div className="save">{sv.vsMarket ? <span>{inr(sv.vsMarket)} under this creator's usual rate</span> : null}{sv.vsAgency ? <span>{inr(sv.vsAgency)} under agency pricing</span> : null}</div> : null}
                    {fit && <span className={`fit ${fit.tone}`}>{fit.label}</span>}</div>
                </div>
                {r.team_note && <div className="note info" style={{ marginTop: 14 }}><b>Why we picked them:</b> {r.team_note}</div>}
                {!r.team_note && r.match_reasons && <p className="hint" style={{ margin: "12px 0 0" }}>{r.match_reasons}</p>}
                <div className="row" style={{ marginTop: 12, gap: 8 }}>
                  {links.map((u, i) => <a key={u} className="btn sm" href={u} {...EXT}>Sample {i + 1} ↗</a>)}
                  {brandEmail && r.creator_id && (saved.has(r.creator_id)
                    ? <span className="hint" style={{ color: "var(--good)" }}>In your roster ✓</span>
                    : <form action={saveRoster}><input type="hidden" name="token" value={token} /><input type="hidden" name="creator" value={r.creator_id} /><button className="btn sm">Save to my roster</button></form>)}
                </div>
                {booked.has(r.id) || (r.creator_id && bookedCreators.has(r.creator_id))
                  ? <div className="note good" style={{ marginTop: 16 }}>Booked. Track this creator under "Campaign progress" below.</div>
                  : <form action={approve} className="row" style={{ marginTop: 16 }}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="app" value={r.id} />
                  <input className="in" name="note" style={{ flex: 1, minWidth: 200 }} placeholder="Comment for the Colatch team (optional)" defaultValue={r.client_note ?? ""} />
                  <button className="btn" formAction={decline}>Not for us</button>
                  {r.rate_quote ? <button className="btn plum">Approve</button> : <span className="hint">Fee being confirmed by the Colatch team</span>}
                </form>}
              </div>
            );
          })}
          {!rows.length && <div className="panel empty"><b>Your shortlist is being prepared.</b>The Colatch team will add creators here. This page updates as soon as they do.</div>}
        </div>
        </section>
        {deals.length > 0 && <div style={{ marginBottom: 34 }}>
          <div className="spread" style={{ marginBottom: 12 }}><div className="h2" style={{ margin: 0 }}>Campaign progress</div><div className="row" style={{ gap: 8 }}><a className="btn sm" href={`/receipt/${params.token}`}>Value receipt</a><a className="btn sm" href={`/brief?again=${encodeURIComponent(token)}`}>Book again</a></div></div>
          <div className="grid3">
            <div className="panel kpi"><div className="k">Spend</div><div className="v">{inr(tSpend)}</div><div className="s">creator fees, {deals.length} {deals.length === 1 ? "creator" : "creators"}</div></div>
            <div className="panel kpi"><div className="k">Views</div><div className="v">{compact(tViews)}</div><div className="s">{live.length} of {deals.length} posts live</div></div>
            <div className="panel kpi"><div className="k">Cost per view</div><div className="v">{actualCpv != null ? "₹" + actualCpv.toFixed(2) : "—"}</div><div className="s">{promiseLine}</div></div>
            <div className="panel kpi"><div className="k">Engagement</div><div className="v">{compact(tEng)}</div><div className="s">{tEng && liveSpend ? "₹" + (liveSpend / tEng).toFixed(2) + " per engagement" : "likes + comments"}</div></div>
            <div className="panel kpi"><div className="k">Link clicks</div><div className="v">{compact(tClicks)}</div><div className="s">from tracked creator links</div></div>
            <div className="panel kpi"><div className="k">Orders</div><div className="v">{tOrders || "—"}</div><div className="s">from creator codes</div></div>
          </div>
          <div className="panel scroll-x" style={{ marginTop: 14 }}><table className="tbl">
            <thead><tr><th>Creator</th><th>Progress</th><th className="num">Views</th><th className="num">CPV</th><th className="num">Clicks</th><th>Post</th></tr></thead>
            <tbody>{deals.map((d) => {
              const done = railDone(d);
              const at = done.lastIndexOf(true);
              const post = d.live_at ? safeUrl(d.post_url) : null;
              return (
                <tr key={d.id}>
                  <td><div className="who"><div className="ava" style={{ width: 32, height: 32, fontSize: 11 }}>{safeUrl(d.profile_pic) ? <img src={safeUrl(d.profile_pic)} alt="" /> : initials(d.name || d.handle)}</div><div><b>{d.name || d.handle}</b><span>{d.deliverable}</span></div></div></td>
                  <td><span className="dots">{RAIL.map((r, i) => <i key={r.key} className={done[i] ? "on" : ""} title={r.label} />)}</span><div className="hint">{d.stage === "cancelled" ? "Cancelled" : at < 0 ? "Waiting for the creator to accept terms" : RAIL[at].label}</div>{priced[d.id] && <div className="hint">All-in {inr(priced[d.id].total)}{priced[d.id].frozen ? " (as paid)" : ""}</div>}</td>
                  <td className="num">{compact(d.actual_views)}</td>
                  <td className="num">{d.fee && d.actual_views ? "₹" + (d.fee / d.actual_views).toFixed(2) : "—"}</td>
                  <td className="num">{d.clicks}</td>
                  <td>
                    {post ? <a className="link" href={post} {...EXT}>View ↗</a> : d.live_at && d.post_url ? <span className="hint">{String(d.post_url).slice(0, 60)}</span> : <span className="hint">Not live yet</span>}
                    {d.live_at && !d.brand_signoff_at && <form action={signoff} style={{ marginTop: 6 }}><input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} /><label className="hint" style={{ display: "block" }}><input type="checkbox" name="public" value="1" defaultChecked /> creator may show it as proof</label><button className="btn sm plum">Sign off work</button></form>}
                    {d.brand_signoff_at && <div className="hint" style={{ color: "var(--good)" }}>Signed off ✓</div>}
                    {d.live_at && !rated.has(d.id) && <form action={rate} className="row" style={{ gap: 4, marginTop: 6, flexWrap: "nowrap" }}><input type="hidden" name="token" value={token} /><input type="hidden" name="deal" value={d.id} /><select className="in" name="stars" style={{ width: "auto", padding: "4px 6px", fontSize: 12 }}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select><button className="btn sm">Rate</button></form>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {ranked.length > 1 && <p className="hint" style={{ margin: "10px 0 0" }}>Best value so far: <b>{ranked[0].name || ranked[0].handle}</b> at ₹{(ranked[0].fee / ranked[0].actual_views).toFixed(2)} per view.</p>}
        </div>}

        <div className="grid3" style={{ marginBottom: 22 }}>
          <div className="panel kpi"><div className="k">Approved</div><div className="v">{approved.length} / {k.creators_needed || rows.length}</div><div className="s">creators</div></div>
          <div className="panel kpi"><div className="k">Creator fees so far</div><div className="v">{inr(spend)}</div><div className="s">before Colatch fee + GST</div></div>
          <div className="panel kpi"><div className="k">Expected views</div><div className="v">{compact(views)}</div><div className="s">{spend && views ? `≈ ₹${(spend / views).toFixed(2)} per view` : "from avg reel views"}</div></div>
        </div>

        {deals.some((d) => d.live_at) && <div className="panel pad" style={{ marginBottom: 22, background: "linear-gradient(135deg,#2E1B36,#1E1128)", color: "#F4EFE3", border: 0 }}>
          <div className="lbl" style={{ color: "var(--gold-2)" }}>Value delivered by Colatch</div>
          <div style={{ fontSize: 34, fontWeight: 300, marginTop: 6 }}>{inr(tot.saved + tot.adsEquivalent + tot.sales)}</div>
          <div className="grid4" style={{ marginTop: 14 }}>
            <div><div className="lbl" style={lblDim}>Saved vs market rates</div><b style={{ fontSize: 18 }}>{inr(tot.savedVsMarket)}</b></div>
            <div><div className="lbl" style={lblDim}>Saved vs {base.agencyPct}% agency markup</div><b style={{ fontSize: 18 }}>{inr(tot.savedVsAgency)}</b></div>
            <div><div className="lbl" style={lblDim}>Views, as paid-ads value</div><b style={{ fontSize: 18 }}>{inr(tot.adsEquivalent)}</b>{tot.adsMultiple ? <div className="small" style={{ opacity: 0.7 }}>{tot.adsMultiple.toFixed(1)}× your creator spend</div> : null}</div>
            <div><div className="lbl" style={lblDim}>Sales from creator codes</div><b style={{ fontSize: 18 }}>{inr(tot.sales)}</b>{tot.roas ? <div className="small" style={{ opacity: 0.7 }}>{tot.roas.toFixed(1)}× return</div> : null}</div>
          </div>
          <p className="small" style={{ margin: "14px 0 0", opacity: 0.65 }}>How we count: market rate is each creator's own rate card, or the typical rate for their size. Agency markup baseline is {base.agencyPct}% (typical range 15–30%) against Colatch's {pct}%. Paid-ads value uses ₹{base.cpm} per 1,000 views. Sales come from the tracked codes and links.</p>
        </div>}
        {(rows.length > 0 || deals.length > 0) && <div className="panel pad" style={{ marginBottom: 18, background: "var(--ivory-2)", boxShadow: "none" }}>
          <div className="spread"><h2 style={{ margin: 0 }}>What you'd give up going direct</h2>{brandEmail && <a className="btn sm" href={`/roster/${encodeURIComponent(token)}`}>My roster{saved.size ? ` (${saved.size})` : ""}</a>}</div>
          <div className="loss">
            <div><b>Payment held until verified</b><span>{atStake ? `${inr(atStake)} of your payments recorded and held; each creator is paid only after their post is checked live` : "Creators are paid only after their post is checked live by the Colatch team"}</span></div>
            <div><b>Replacement help</b><span>If a creator drops out before posting, we suggest a matched replacement</span></div>
            {k.promised_cpv ? <div><b>Agreed cost-per-view target</b><span>₹{Number(k.promised_cpv).toFixed(2)} per view, as agreed for this campaign</span></div> : null}
            <div><b>Signed proof of work</b><span>Dated certificate with views, value and both sign-offs</span></div>
            <div><b>Repeat booking rate</b><span>Rebook any creator through Colatch at 12% instead of {feePct(env)}%</span></div>
            <div><b>Loyalty rate</b><span>{loyaltyGap > 0 ? `You're on ${brandFee.pct}% already (${brandFee.reason})` : "1 point off our fee for every ₹5L you spend in a year, down to 10%"}</span></div>
          </div>
        </div>}
        {myCode && <div className="note info" style={{ marginBottom: 18 }}>Know another brand that needs creators? Share <code className="k">{origin}/r/{myCode}</code>. For 12 months you get credit off your Colatch invoices on every campaign they run.</div>}




      </div>
    </PublicShell>
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
