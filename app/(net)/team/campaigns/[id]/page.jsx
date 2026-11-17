import { redirect } from "next/navigation";
import { headers } from "next/headers";
import TeamShell from "../../../_ui/TeamShell";
import CampaignFields from "../../../_ui/CampaignFields";
import { flashUrl } from "../../../_ui/flash";
import { AutoSelect, CopyButton } from "../../_client";
import { requireTeam } from "../../_guard";
import { env } from "@/lib/net/env";
import { campaignFieldsFromForm, rankCreators, requirementChips, CAMPAIGN_STATUS_LABEL, REJECT_REASONS } from "@/lib/net/campaign";
import { compact, inr } from "@/lib/net/creators";
import { match } from "@/lib/net/match";
import { checkBrief } from "@/lib/net/compliance";
import { newToken } from "@/lib/net/tokens";
import { scrubContacts } from "@/lib/net/guard";
import { marketRate } from "@/lib/net/value";
import { colatchScore } from "@/lib/net/score";
import { notify } from "@/lib/net/notify";
import { audit, logError } from "@/lib/net/security";
import { APP_STATUS_OPTIONS, appStatusLabel, plural, day } from "@/components/team/labels";
import { inrShort } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, StatusRail, DataTable, Grid, Section, Card, AsideCard, Pill, Tags, Split } from "@/components/ui";

export const metadata = { title: "Campaign", robots: { index: false, follow: false } };

const back = (id, key, msg) => flashUrl(`/team/campaigns/${id}`, key, msg);

/** Every form on this page posts here; `action` says what to do. Mirrors the POST handler of the Astro page. */
async function handle(fd, forced) {
  const id = String(fd.get("id") ?? "");
  const action = forced || String(fd.get("action") ?? "");
  // Checked inside the action: Server Actions can be called without loading the page.
  const me = await requireTeam("shortlist", `/team/campaigns/${encodeURIComponent(id)}`);
  const actor = { kind: "team", id: me.email };
  let msg = "";
  try {
    if (action === "save" || action === "approve") {
      const v = campaignFieldsFromForm(fd);
      const sb = scrubContacts(v.brief); v.brief = sb.text || null; v.title = scrubContacts(v.title).text || v.title;
      const cur = await env.DB.prepare("SELECT raw_brief FROM campaigns WHERE id=?").bind(id).first();
      const blocked = action === "approve" && checkBrief([cur?.raw_brief, v.brief, v.title, v.brand].join(" ")).some((x) => x.level === "block");
      if (blocked) return back(id, "err", "Not published: this brief promotes betting or real-money gaming, which Colatch does not run. Reject it, or remove that content first.");
      await env.DB.prepare(
        `UPDATE campaigns SET title=?, brand=?, brief=?, deliverables=?, talent_types=?, niche=?, city=?, languages=?, gender=?, min_followers=?, max_followers=?,
         creators_needed=?, budget_note=?, budget_total=?, deadline=?, shoot_date=?, pay_type=?, revisions=?, usage_rights=?, payment_days=?, approve_hours=?, mandatories=?, exclusions=?, brand_url=?, promised_cpv=?, brand_category=?, reward_value=?, commission_pct=?, funded=? ${action === "approve" ? ", status='open', is_open=CASE WHEN pitch_id IS NULL THEN 1 ELSE 0 END" : ""} WHERE id=?`
      ).bind(v.title, v.brand, v.brief, v.deliverables, v.talent_types, v.niche, v.city, v.languages, v.gender, v.min_followers, v.max_followers,
        v.creators_needed, v.budget_note, v.budget_total, v.deadline, v.shoot_date, v.pay_type, v.revisions, v.usage_rights, v.payment_days, v.approve_hours, v.mandatories, v.exclusions, v.brand_url, v.promised_cpv, v.brand_category, v.reward_value, v.commission_pct, v.funded, id).run();
      // Recorded so Icon early access counts its 24 hours from publication, not from when the brief was written.
      if (action === "approve") await audit(actor, "campaign.approve", "campaign", id, null);
      msg = (action === "approve" ? "Published. Matching creators can see it now." : "Saved.") + (sb.found ? ` ${sb.found} contact detail(s) were hidden from the creator brief.` : "");
    } else if (["close", "reject", "reopen"].includes(action)) {
      const st = action === "close" ? "closed" : action === "reject" ? "rejected" : "open";
      if (st === "open") {
        // Reopening publishes again, so the same compliance check as approving applies.
        const cur = await env.DB.prepare("SELECT raw_brief, brief, title, brand FROM campaigns WHERE id=?").bind(id).first();
        if (!cur) return back(id, "err", "That campaign does not exist.");
        if (checkBrief([cur.raw_brief, cur.brief, cur.title, cur.brand].join(" ")).some((x) => x.level === "block"))
          return back(id, "err", "Not reopened: this brief promotes betting or real-money gaming, which Colatch does not run.");
      }
      // A booked creator idea (pitch_id set) is a private deal with that creator: never publish it to the open feed.
      await env.DB.prepare("UPDATE campaigns SET status=?, is_open=CASE WHEN pitch_id IS NULL AND ?=1 THEN 1 ELSE 0 END WHERE id=?").bind(st, st === "open" ? 1 : 0, id).run();
      await audit(actor, `campaign.${action}`, "campaign", id, null);
      msg = `Marked ${CAMPAIGN_STATUS_LABEL[st].toLowerCase()}.`;
    } else if (action === "verify") {
      // #69 Verified brand: clears the scam-shield hold.
      await env.DB.prepare("UPDATE campaigns SET brand_verified=1, held_reason=NULL WHERE id=?").bind(id).run();
      await audit(actor, "campaign.verify_brand", "campaign", id, null);
      msg = "Brand marked verified. The hold is cleared; creators will see a Verified brand badge.";
    } else if (action === "feature") {
      // #94 Featured brief: pinned for 7 days.
      await env.DB.prepare("UPDATE campaigns SET featured_until=datetime('now','+7 days') WHERE id=?").bind(id).run();
      await audit(actor, "campaign.feature", "campaign", id, null);
      msg = "Featured for 7 days. Remember to invoice ₹1,999.";
    } else if (action === "unfeature") {
      await env.DB.prepare("UPDATE campaigns SET featured_until=NULL WHERE id=?").bind(id).run();
      msg = "No longer featured.";
    } else if (action === "share") {
      await env.DB.prepare("UPDATE campaigns SET share_token=COALESCE(share_token, ?) WHERE id=?").bind(newToken() + newToken(), id).run();
      msg = "Client shortlist link ready. Copy it below and send it to the client.";
    } else if (action === "note") {
      await env.DB.prepare("UPDATE campaign_applications SET team_note=? WHERE id=? AND campaign_id=?").bind(String(fd.get("team_note") ?? "").trim().slice(0, 400) || null, String(fd.get("app") ?? ""), id).run();
      msg = "Note saved. The client sees it on the shortlist.";
    } else if (action === "app") {
      const appId = String(fd.get("app") ?? "");
      const st = String(fd.get("status") ?? "");
      if (!["shortlisted", "rejected", "accepted", "new"].includes(st)) return back(id, "err", "Pick a status.");
      const reason = String(fd.get("reason") ?? "");
      if (st === "rejected" && !REJECT_REASONS[reason]) return back(id, "err", "Pick a reason before rejecting. The creator sees it with a tip.");
      const before = await env.DB.prepare("SELECT a.status, a.creator_id, a.email, a.name, k.title FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id WHERE a.id=? AND a.campaign_id=?").bind(appId, id).first();
      if (!before) return back(id, "err", "That application is not on this campaign.");
      if (before.status === "withdrawn") return back(id, "err", "The creator withdrew this application.");
      const deal = await env.DB.prepare("SELECT id, pay_status FROM creator_deals WHERE application_id=?").bind(appId).first();
      if (deal && (st === "rejected" || st === "new")) return back(id, "err", "This creator already has a deal. Cancel the deal first.");
      // Shortlisting never creates a deal: the brand approves on the shortlist page, or the team uses "Create deal".
      await env.DB.prepare("UPDATE campaign_applications SET status=?, reject_reason=? WHERE id=? AND campaign_id=?").bind(st, st === "rejected" ? reason : null, appId, id).run();
      await audit(actor, "application.status", "application", appId, { from: before.status, to: st });
      if (before.status !== st && before.email) {
        if (st === "shortlisted") await notify({ template: "creator_shortlisted", to: before.email, toKind: "creator", toId: before.creator_id, payload: { name: before.name, title: before.title }, dedupeKey: `shortlisted:${appId}` });
        if (st === "rejected") await notify({ template: "creator_declined", to: before.email, toKind: "creator", toId: before.creator_id, payload: { name: before.name, title: before.title, reason: REJECT_REASONS[reason]?.[0] }, dedupeKey: `declined:${appId}` });
      }
      msg = st === "shortlisted" ? "Shortlisted. The client sees them on the shortlist link." : st === "accepted" ? "Marked accepted. Use Create deal when the terms are agreed." : "Updated.";
    } else if (action === "deal") {
      // Explicit, idempotent: one deal per application (unique index), only for shortlisted or accepted applicants.
      const appId = String(fd.get("app") ?? "");
      const a = await env.DB.prepare("SELECT a.status, a.creator_id, a.email, a.name, a.rate_quote, k.title, k.brand, k.client_company, k.deliverables, k.revisions, k.shoot_date, k.reward_value, c.rate_reel, c.followers FROM campaign_applications a JOIN campaigns k ON k.id=a.campaign_id LEFT JOIN creators c ON c.id=a.creator_id WHERE a.id=? AND a.campaign_id=?").bind(appId, id).first();
      if (!a) return back(id, "err", "That application is not on this campaign.");
      if (!a.creator_id) return back(id, "err", "This applicant has no Colatch account yet, so they can't accept a deal.");
      if (!["shortlisted", "accepted"].includes(a.status)) return back(id, "err", "Shortlist or accept the creator first.");
      const dealId = crypto.randomUUID();
      const r = await env.DB.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, application_id, brand, deliverable, stage, fee, revisions_included, go_live_date, market_rate, reward_value) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
        .bind(dealId, a.creator_id, id, appId, a.brand || a.client_company || "Confidential", a.deliverables, "negotiating", a.rate_quote, a.revisions ?? 2, a.shoot_date, marketRate(a), a.reward_value).run();
      if (!r.meta?.changes) return back(id, "err", "A deal for this creator already exists. Open it from the CRM.");
      await env.DB.prepare("UPDATE campaign_applications SET status='accepted' WHERE id=?").bind(appId).run();
      await audit(actor, "deal.create", "deal", dealId, { application: appId });
      if (a.email) await notify({ template: "deal_created", to: a.email, toKind: "creator", toId: a.creator_id, payload: { name: a.name, title: a.title, dealId }, dedupeKey: `deal_created:${dealId}` });
      return flashUrl(`/team/deals/${dealId}`, "ok", "Deal created. Check the fee and terms, then the creator accepts in their portal.");
    }
  } catch (e) {
    await logError("team/campaign", e, { action });
    return back(id, "err", "Something went wrong, the change may not have been saved. Reload and check.");
  }
  return msg ? back(id, "ok", msg) : `/team/campaigns/${id}`;
}

async function act(fd) { "use server"; redirect(await handle(fd)); }
async function saveAct(fd) { "use server"; redirect(await handle(fd, "save")); }
async function approveAct(fd) { "use server"; redirect(await handle(fd, "approve")); }

export default async function Page({ params, searchParams }) {
  const me = await requireTeam();
  const id = params.id;
  const k = await env.DB.prepare("SELECT * FROM campaigns WHERE id=?").bind(id).first();
  if (!k) redirect("/team/campaigns");
  const flash = searchParams?.err || searchParams?.ok || (searchParams?.new ? "Brief read. Check the needs below, fix anything, then approve to publish it to matching creators." : "");
  const tone = searchParams?.err ? "bad" : "good";

  const apps = (await env.DB.prepare(
    `SELECT a.*, c.profile_pic, c.followers AS cf, c.engagement_rate, c.quality_score, c.verified, c.skills, c.niche AS cniche, c.city AS ccity, c.language, c.gender, c.portfolio_links, c.rate_reel, c.bio_pitch, c.open_to_barter, c.status AS cstatus
     FROM campaign_applications a LEFT JOIN creators c ON c.id=a.creator_id WHERE a.campaign_id=? ORDER BY a.created_at DESC`
  ).bind(id).all()).results ?? [];
  // Re-score applicants against the current brief so edits to the brief re-rank them.
  const ranked = apps.filter((a) => a.status !== "withdrawn").map((a) => ({ a, m: match({ skills: a.skills, niche: a.cniche, city: a.ccity ?? a.city, language: a.language, gender: a.gender, followers: a.cf ?? a.followers, engagement_rate: a.engagement_rate, quality_score: a.quality_score, verified: a.verified, status: a.cstatus, portfolio_links: a.portfolio_links, rate_reel: a.rate_reel, bio_pitch: a.bio_pitch, open_to_barter: a.open_to_barter }, k) }))
  ;
  // Colatch Score perk: Trusted-and-above creators are listed first among eligible applicants.
  const tiers = new Map(await Promise.all([...new Set(apps.map((a) => a.creator_id).filter(Boolean))].map(async (cid) => [cid, (await colatchScore(env, cid).catch(() => null))?.tier || "Rising"])));
  const trusted = (a) => (a.creator_id && tiers.get(a.creator_id) && tiers.get(a.creator_id) !== "Rising" ? 1 : 0);
  ranked.sort((x, y) => (y.m.eligible ? 1 : 0) - (x.m.eligible ? 1 : 0) || trusted(y.a) - trusted(x.a) || (y.a.match_score ?? y.m.score) - (x.a.match_score ?? x.m.score));
  const deals = new Map(((await env.DB.prepare("SELECT id, application_id FROM creator_deals WHERE campaign_id=?").bind(id).all()).results ?? []).map((d) => [d.application_id, d.id]));
  const appliedHandles = new Set(apps.map((a) => a.handle));
  const pool = (await rankCreators(env, k, 40)).filter((x) => !appliedHandles.has(x.c.handle));
  let ai = {};
  try { ai = JSON.parse(k.ai_notes || "{}"); } catch {}
  const flags = checkBrief([k.raw_brief, k.brief, k.title, k.brand].join(" "));
  const slApps = apps.filter((a) => ["shortlisted", "accepted"].includes(a.status));
  // Same rule as the brand's shortlist page: a booked creator counts as approved even without a client_decision.
  const dealRows = (await env.DB.prepare("SELECT application_id, creator_id, stage FROM creator_deals WHERE campaign_id=?").bind(id).all().catch(() => null))?.results ?? [];
  const bookedApps = new Set(dealRows.filter((x) => x.stage !== "cancelled" && x.application_id).map((x) => x.application_id));
  const bookedCreators = new Set(dealRows.filter((x) => x.stage !== "cancelled").map((x) => x.creator_id));
  const isBooked = (a) => bookedApps.has(a.id) || Boolean(a.creator_id && bookedCreators.has(a.creator_id));
  const slTotal = slApps.length, slOk = slApps.filter((a) => a.client_decision === "approved" || isBooked(a)).length, slNo = slApps.filter((a) => a.client_decision === "declined" && !isBooked(a)).length;
  const slBooked = slApps.filter(isBooked).length;
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const inviteText = (name) => `Hi ${name}! Colatch here. We have a paid opportunity that fits your profile: "${k.title}"${k.budget_note ? ` (${k.budget_note})` : ""}. See the brief and apply: ${origin}/creator/o/${k.slug}`;
  const wa = (phone, name) => phone ? `https://wa.me/${String(phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(inviteText(name))}` : "";
  const initials = (s) => String(s).replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const chips = requirementChips(k);
  const eligibleN = ranked.filter((r) => r.m.eligible).length;
  const hidden = (a) => <><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value={a} /></>;
  const esc = (s) => String(s).replace(/</g, "&lt;");
  const nowTs = new Date().toISOString().replace("T", " ").slice(0, 19);

  // Read-only roll-up of the deals on this brief for the KPI strip and the progress rail. A failure only blanks those figures.
  const booked = (await env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(fee),0) fee, SUM(CASE WHEN live_at IS NOT NULL THEN 1 ELSE 0 END) live FROM creator_deals WHERE campaign_id=? AND stage NOT IN ('cancelled','dropped')").bind(id).first().catch(() => null)) || { n: 0, fee: 0, live: 0 };
  const bookedN = Number(booked.n || 0), bookedFee = Number(booked.fee || 0), liveN = Number(booked.live || 0);
  const STATUS_TONE = { open: "done", pending: "wait", closed: "off", rejected: "off" };
  // "Booked" stays the current step until a post is live, so the rail never marks Live while nothing is live.
  const reached = [k.status !== "pending", ["open", "closed"].includes(k.status), slTotal > 0, bookedN > 0 && liveN > 0, liveN > 0 && liveN >= bookedN];
  const firstTodo = reached.findIndex((x) => !x);
  const railSteps = ["Draft", "Approved", "Shortlist", "Booked", "Live"].map((label, i) => ({
    label, state: k.status === "rejected" ? (i === 0 ? "done" : "todo") : reached[i] ? "done" : i === firstTodo && (i < 4 || liveN > 0) ? "now" : "todo",
  }));
  const railNote = k.status === "rejected" ? "This brief was rejected. Reopen it to publish again."
    : k.status === "pending" ? "Check the needs below, then approve to publish it to matching creators."
    : !slTotal ? (apps.length ? "Shortlist the best applicants below. The client then approves them on the shortlist link." : "Waiting for applicants. Invite the matching creators below.")
    : !bookedN ? `${plural(slTotal, "creator")} on the shortlist. Use Create deal once the terms are agreed.`
    : !liveN ? `${plural(bookedN, "deal")} booked. Open each deal to move it to live.`
    : `${liveN} of ${plural(bookedN, "deal")} live.${k.status === "closed" ? " The brief is closed." : ""}`;
  const editOpen = k.status !== "open" || Boolean(searchParams?.new);
  const who = (a) => (
    <>
      <a className="who" href={a.creator_id ? `/team/creators/${a.creator_id}` : `https://instagram.com/${a.handle}`}><div className="ava">{a.profile_pic ? <img src={a.profile_pic} alt="" /> : initials(a.name || a.handle)}</div><div><b>{a.name || a.handle}{a.verified ? " ✓" : ""}{a.creator_id && tiers.get(a.creator_id) && tiers.get(a.creator_id) !== "Rising" ? <span className="pill good" style={{ marginLeft: 6 }}>{tiers.get(a.creator_id)}</span> : null}</b><span>@{a.handle}{a.ccity || a.city ? ` · ${a.ccity || a.city}` : ""}</span></div></a>
    </>
  );
  const appCols = [
    { key: "creator", label: "Creator", render: ({ a, m }) => (
      <div className="tr-app">
        <div className="score sm" style={{ "--v": a.match_score ?? m.score }} title="Score saved when they applied: the one the brand sees"><i>{a.match_score ?? m.score}</i></div>
        <div className="tr-app__who">{who(a)}{a.pitch && <div className="hint tr-pitch">"{a.pitch}"</div>}</div>
      </div>
    ) },
    { key: "followers", label: "Followers", num: true, render: ({ a }) => compact(a.cf ?? a.followers) },
    { key: "er", label: "ER", num: true, render: ({ a }) => (a.engagement_rate != null ? `${a.engagement_rate}%` : "—") },
    { key: "quote", label: "Quote", num: true, render: ({ a }) => (a.rate_quote ? inr(a.rate_quote) : "—") },
    { key: "why", label: "Why", render: ({ m }) => <span className="tr-why">{m.reasons.slice(0, 2).map((r) => <span key={r} className="tag">{r}</span>)}{m.blockers.map((b) => <span key={b} className="tag tr-blocker">✕ {b}</span>)}</span> },
    { key: "status", label: "Status", primary: true, className: "cell-stack tr-appact", render: ({ a }) => (<>
      {a.client_decision && <span className={`pill ${a.client_decision === "approved" ? "good" : "low"}`} style={{ marginBottom: 6 }}>Client {a.client_decision}</span>}{a.client_note && <div className="hint" style={{ maxWidth: 220 }}>"{a.client_note}"</div>}
      {["shortlisted", "accepted"].includes(a.status) && <form action={act} className="row tr-appnote">{hidden("note")}<input type="hidden" name="app" value={a.id} /><input className="in" name="team_note" aria-label={`Why we picked ${a.name || a.handle}`} defaultValue={a.team_note ?? ""} placeholder="Why we picked them" /><button className="btn sm">Save</button></form>}
      {deals.get(a.id) ? <a className="btn sm" href={`/team/deals/${deals.get(a.id)}`} style={{ marginBottom: 6 }}>Open deal</a>
        : ["shortlisted", "accepted"].includes(a.status) && a.creator_id && <form action={act} style={{ marginBottom: 6 }}>{hidden("deal")}<input type="hidden" name="app" value={a.id} /><button className="btn sm">Create deal</button></form>}
      <form action={act} className="tr-appstatus">{hidden("app")}<input type="hidden" name="app" value={a.id} />
        {/* A creator with a deal can't be rejected (the server refuses it), so the reason picker only shows when it can be used. */}
        {!deals.get(a.id) && <select className="in" name="reason" defaultValue={a.reject_reason ?? ""} aria-label="Reason if not selecting"><option value="">Reason if not selecting…</option>{Object.entries(REJECT_REASONS).map(([key, val]) => <option key={key} value={key}>{val[0]}</option>)}</select>}
        <AutoSelect className="in" name="status" defaultValue={a.status} aria-label={`Status: ${appStatusLabel(a.status)}`}>{APP_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</AutoSelect></form>
    </>) },
  ];
  const poolCols = [
    { key: "creator", label: "Creator", render: ({ c, m }) => (
      <div className="tr-app">
        <div className="score sm" style={{ "--v": m.score }}><i>{m.score}</i></div>
        <a className="who" href={`/team/creators/${c.id}`}><div className="ava">{c.profile_pic ? <img src={c.profile_pic} alt="" loading="lazy" /> : initials(c.name || c.handle)}</div><div><b>{c.name || c.handle}</b><span>@{c.handle}{c.city ? ` · ${c.city}` : ""}</span></div></a>
      </div>
    ) },
    { key: "followers", label: "Followers", num: true, render: ({ c }) => compact(c.followers) },
    { key: "er", label: "ER", num: true, render: ({ c }) => (c.engagement_rate != null ? `${c.engagement_rate}%` : "—") },
    { key: "rate", label: "Reel rate", num: true, render: ({ c }) => (c.rate_reel ? inr(c.rate_reel) : "—") },
    { key: "why", label: "Why", hidePhone: true, render: ({ m }) => <span className="tr-why">{m.reasons.slice(0, 2).map((r) => <span key={r} className="tag">{r}</span>)}</span> },
    { key: "invite", label: "Invite", labelHidden: true, primary: true, render: ({ c }) => (k.status === "open" ? (wa(c.phone, c.name || c.handle) ? <a className="btn sm" href={wa(c.phone, c.name || c.handle)} target="_blank" rel="noopener">Invite on WhatsApp</a> : <a className="btn sm" href={`https://ig.me/m/${c.handle}`} target="_blank" rel="noopener">Invite on Instagram</a>) : <span className="hint">Publish first</span>) },
  ];

  return (
    <TeamShell active="campaigns" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Open campaigns", href: "/team/campaigns" }, { label: k.title }]}
        actions={<>
          {k.status === "open" && <a className="btn sm" href={`/creator/o/${k.slug}`} target="_blank">Creator view ↗</a>}
          {k.status === "open" ? <form action={act}>{hidden("close")}<button className="btn sm">Close</button></form>
            : k.status === "pending" ? <form action={act}>{hidden("reject")}<button className="btn sm danger">Reject</button></form>
            : <form action={act}>{hidden("reopen")}<button className="btn sm">Reopen</button></form>}
        </>}
        eyebrow={`${CAMPAIGN_STATUS_LABEL[k.status] || k.status} · ${k.brand || k.client_company || "Brand confidential"}`}
        title={esc(k.title)}
        sub={[k.deliverables, k.deadline ? `apply by ${day(k.deadline) || k.deadline}` : null, k.shoot_date ? `shoot ${day(k.shoot_date) || k.shoot_date}` : null, k.source === "client" ? "brief from the client" : "brief from the team"].filter(Boolean).join(" · ")}
      >
        <div className="ui-pills tr-headpills tr-headrow">
          <Pill tone={STATUS_TONE[k.status] || "quiet"}>{CAMPAIGN_STATUS_LABEL[k.status] || k.status}</Pill>
          {Number(k.brand_verified) === 1 ? <span className="pill good">Verified brand</span> : !k.held_reason && <form action={act}>{hidden("verify")}<button className="btn sm">Mark brand verified</button></form>}
          {Number(k.rush) === 1 && <span className="pill plum">Rush: shortlist in 6 working hours (+5% fee)</span>}
          {k.brief_score != null && <span className="pill">Brief strength {k.brief_score}/100</span>}
          {k.featured_until && k.featured_until > nowTs
            ? <><span className="pill ok">Featured until {day(k.featured_until)}</span><form action={act}>{hidden("unfeature")}<button className="btn sm">Stop featuring</button></form></>
            : <>{ai.featured_request && <span className="pill ok">Client asked to feature (₹1,999)</span>}<form action={act}>{hidden("feature")}<button className="btn sm">Feature for 7 days</button></form></>}
        </div>
      </PageHeader>

      {flash && <div className={`note ${tone}`} style={{ marginBottom: 16 }}>{flash}</div>}

      {k.held_reason && <div className="note bad" style={{ marginBottom: 16 }}>
        <div className="spread"><div><b>On hold: {k.held_reason}.</b> Call or WhatsApp {k.client_name || "the client"}{k.client_phone ? ` on ${k.client_phone}` : ""} and check the company (GST, website, LinkedIn) before publishing.{ai.website ? ` They gave the website ${ai.website}.` : ""}</div>
          <form action={act}>{hidden("verify")}<button className="btn plum">Mark brand verified</button></form></div>
      </div>}

      <StatusRail label="Campaign progress" steps={railSteps} eyebrow={k.status === "rejected" ? "Rejected" : undefined} note={railNote}
        badge={k.status === "pending" ? <Pill tone="mine">Your move</Pill> : null} />

      <div className="tr-gap">
        <KpiStrip label="Campaign at a glance" items={[
          { label: "Applicants", value: apps.length, foot: `${eligibleN} ${eligibleN === 1 ? "meets" : "meet"} every requirement`, href: "#applicants" },
          { label: "Shortlisted", value: slTotal, foot: `${pool.length + eligibleN}${pool.length === 40 ? "+" : ""} matching creators in the database` },
          { label: "Approved by client", value: slOk, title: "Approved on the client's page, or already booked: the same count the brand sees", foot: slTotal ? `${slBooked ? `${slBooked} booked · ` : ""}${slNo} declined · ${slTotal - slOk - slNo} waiting` : "Shortlist creators to ask the client" },
          { featured: true, label: "Booked spend", value: bookedN ? inrShort(bookedFee) : "—", title: bookedN ? inr(bookedFee) : undefined, foot: `${plural(bookedN, "deal")}${k.budget_total ? ` · budget ${inrShort(k.budget_total)}` : ""}${k.creators_needed ? ` · needs ${k.creators_needed}` : ""}` },
        ]} />
      </div>

      {flags.length > 0 && (
        <div className="stack tr-gap">{flags.map((f, i) => <div key={i} className={`note ${f.level === "check" ? "warn" : "bad"}`}><b>{f.level === "block" ? "Blocked" : f.level === "stop" ? "Stop and check" : "Check"}: {f.title}.</b> {f.detail}</div>)}</div>
      )}

      <Section id="applicants" title="Applicants, best match first" sub={ranked.length ? `${plural(ranked.length, "applicant")} · ${eligibleN} ${eligibleN === 1 ? "meets" : "meet"} every requirement. Eligible and trusted creators first.` : null}>
        <DataTable caption="Applicants" columns={appCols} rows={ranked} rowKey={({ a }) => a.id} scroll
          empty={{ title: "No applicants yet.", body: k.status === "open" ? "Invite the matching creators below. Each invite is a ready WhatsApp message." : "Approve the opportunity so matching creators can see it.", action: k.status === "open" ? <a className="btn sm" href="#pool">See matching creators</a> : <a className="btn sm" href="#needs">Check the needs</a> }} />
      </Section>

      <Grid aside={<>
        <AsideCard id="shortlist" eyebrow="Client shortlist" title={slTotal ? `${slOk} of ${slTotal} <b>approved</b>` : "Client shortlist"}
          foot={k.share_token ? <a href={`/shortlist/${k.share_token}`} target="_blank">Open the client's page ↗</a> : null}>
          <p className="small">Shortlisted and accepted creators appear on a private page where the client approves or declines each one. Your note on each creator is shown as "Why we picked them".</p>
          {slTotal > 0 && <Split label="Client decisions" parts={[{ label: "Approved or booked", n: slOk }, { label: "Declined", n: slNo }, { label: "Waiting", n: slTotal - slOk - slNo }]} />}
          {k.share_token
            ? <div className="tr-copy"><code className="k">{origin}/shortlist/{k.share_token.slice(0, 8)}…</code><CopyButton url={`${origin}/shortlist/${k.share_token}`} /></div>
            : <form action={act}>{hidden("share")}<button className="btn plum">Create client link</button></form>}
        </AsideCard>
        <AsideCard eyebrow={ai.engine === "ai" ? "AI read this brief" : "Read by keyword rules"} title="Who can see it">
          <div>{chips.length ? <Tags items={chips} max={10} /> : <span className="hint">No hard requirements, so every creator can see it.</span>}</div>
          {ai.questions?.length ? <><div className="lbl">Clarify with the client</div><ul className="tr-qs">{ai.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></> : null}
        </AsideCard>
        {k.raw_brief && <AsideCard eyebrow={`Original brief${k.source === "client" ? " from client" : ""}`} title={k.client_company || k.brand || "As it came"}>
          <p className="tr-raw">{k.raw_brief}</p>
          {k.source === "client" && <p className="hint"><b>{k.client_name}</b>{k.client_company ? ` · ${k.client_company}` : ""}<br />{k.client_email}{k.client_phone ? ` · ${k.client_phone}` : ""}</p>}
        </AsideCard>}
      </>}>
        <Section id="pool" title="Matching creators who haven't applied" sub="From Colatch's database, ranked by the same engine.">
          <DataTable caption="Matching creators who haven't applied" columns={poolCols} rows={pool} rowKey={({ c }) => c.id}
            empty={<Card><p className="small" style={{ margin: 0 }}><b>No one else in the database fits yet.</b> Loosen a hard requirement, import more creators, or share <code className="k">{origin}/join</code> with {chips[0]?.toLowerCase() || "creator"} communities.</p></Card>} />
        </Section>

        <Section id="needs" title="Needs and what creators see" sub="Talent, followers, city and gender decide who can see this. Niche and language only change the ranking.">
          <details className="tr-fold" open={editOpen}>
            <summary><span>Edit the brief</span><span className="hint">{chips.length ? chips.slice(0, 4).join(" · ") : "No hard requirements"}</span></summary>
            <form className="tr-fold__body" action={saveAct}>
              <input type="hidden" name="id" value={id} />
              <CampaignFields v={k} />
              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn" formAction={saveAct}>Save</button>
                {k.status !== "open" && <button className="btn-foil" formAction={approveAct}>Approve &amp; publish to matching creators</button>}
              </div>
            </form>
          </details>
        </Section>
      </Grid>
    </TeamShell>
  );
}
