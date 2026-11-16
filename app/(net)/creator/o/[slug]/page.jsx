import { notFound, redirect } from "next/navigation";
import PublicShell from "../../../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { match } from "@/lib/net/match";
import { requirementChips, PAY_LABEL, daysLeft, rewardLine, NON_CASH } from "@/lib/net/campaign";
import { DISCLOSURE_LINE } from "@/lib/net/compliance";
import { scrubContacts, blindBrand } from "@/lib/net/guard";
import { brandTrust, payByLine, isFeatured, goingDirectLosses } from "@/lib/net/trust";
import { int, str, inr } from "@/lib/net/creators";
import { flashUrl } from "../../../_ui/flash";
import { colatchScore } from "@/lib/net/score";
import { notify, teamInbox } from "@/lib/net/notify";
import { audit } from "@/lib/net/security";
import { ClaimNote } from "@/app/(net)/join/_claim.js";

const CSS = `
.pg-brief .trust{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.pg-brief .trust span{font-size:12.5px;padding:6px 12px;border-radius:999px;background:var(--ivory-2);color:var(--ink-2)}
.pg-brief .trust span.ok{background:var(--soft-bg);color:var(--soft-fg);font-weight:500}
.pg-brief .loss{margin-top:18px;padding:16px 18px;border-radius:14px;border:1px dashed rgba(155,59,59,.35);background:rgba(155,59,59,.03)}
.pg-brief .loss h4{margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7a2c2c}
.pg-brief .loss div{font-size:13.5px;color:var(--ink-2);padding:4px 0}
.pg-brief .deal{margin-top:24px;padding:18px 20px;border-radius:14px;background:var(--ivory-2);border:1px solid var(--line)}
.pg-brief .deal ul{margin:0;padding:0;list-style:none}
.pg-brief .deal li{position:relative;padding:0 0 10px 24px;font-size:14px;color:var(--ink-2);line-height:1.5}
.pg-brief .deal li:last-child{padding-bottom:0}
.pg-brief .deal li::before{content:"✓";position:absolute;left:0;top:0;color:var(--good);font-weight:700}
`;

const getCampaign = (slug) => env.DB.prepare("SELECT * FROM campaigns WHERE slug=? AND status IN ('open','closed')").bind(slug).first();
const isOpen = (k) => k.status === "open" && Number(k.is_open) === 1 && (!k.deadline || k.deadline >= new Date().toISOString().slice(0, 10));
const myApplication = (k, c) => env.DB.prepare("SELECT * FROM campaign_applications WHERE campaign_id=? AND (creator_id=? OR handle=?) ORDER BY created_at DESC LIMIT 1").bind(k.id, c.id, c.handle).first();
/** Private campaigns (a brand booked one creator's idea) are visible only to creators already on them. */
async function canSee(k, c) {
  if (Number(k.is_open) === 1) return true;
  if (!c) return false;
  if (await myApplication(k, c)) return true;
  return Boolean(await env.DB.prepare("SELECT id FROM creator_deals WHERE campaign_id=? AND creator_id=?").bind(k.id, c.id).first());
}
const EARLY_HOURS = 24;
const isFresh = (k) => { const t = Date.parse(String(k.created_at || "").replace(" ", "T") + "Z"); return Number.isFinite(t) && Date.now() - t < EARLY_HOURS * 36e5; };

export async function generateMetadata({ params }) {
  const k = await getCampaign(params.slug).catch(() => null);
  return { title: `${k?.title ?? "Brief"}`, description: (k?.brief || "").slice(0, 150), robots: { index: false } };
}

async function apply(fd) {
  "use server";
  const slug = String(fd.get("slug") ?? "");
  const path = `/creator/o/${slug}`;
  const k = await getCampaign(slug);
  const me = await currentCreator();
  if (!k) redirect("/creator");
  if (!me) redirect(`/creator/login?next=${encodeURIComponent(path)}`);
  if (me.claimPending) redirect(flashUrl(path, "err", "We are still verifying this profile is yours. You can apply once that's done."));
  const c = me.creator;
  if (!(await canSee(k, c))) redirect("/creator");
  const m = match(c, k);
  let dest = path;
  try {
    if (!isOpen(k)) throw new Error("This brief is closed.");
    if (!m.eligible) throw new Error("Your profile doesn't meet this brief's requirements.");
    const prior = await myApplication(k, c);
    if (prior && prior.status !== "withdrawn") throw new Error("You've already applied.");
    // Icon early access is enforced here too, not only by hiding the brief in the feed.
    if (isFresh(k) && (await colatchScore(env, c.id)).tier !== "Icon") throw new Error("This brief is in its Icon early-access window. It opens to you within 24 hours.");
    const pitch = str(scrubContacts(str(fd.get("pitch"))?.slice(0, 600)).text);
    if (!pitch || pitch.length < 20) throw new Error("Tell the brand in a sentence or two why you fit.");
    const quote = int(fd.get("rate_quote")) ?? c.rate_reel;
    if (quote != null && (quote < 0 || quote > 1e8)) throw new Error("Enter your quote in rupees.");
    const appId = crypto.randomUUID();
    try {
      if (prior) {
        // Re-applying after withdrawing reuses the same row (one application per creator per brief).
        await env.DB.prepare("UPDATE campaign_applications SET status='new', pitch=?, rate_quote=?, match_score=?, match_reasons=? WHERE id=? AND status='withdrawn'").bind(pitch, quote, m.score, m.reasons.join(" · "), prior.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO campaign_applications (id, campaign_id, creator_id, handle, name, email, phone, city, followers, rate_quote, pitch, match_score, match_reasons) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
        ).bind(appId, k.id, c.id, c.handle, c.name, me.email, c.phone, c.city, c.followers, quote, pitch, m.score, m.reasons.join(" · ")).run();
      }
    } catch (e) {
      if (e?.code === "23505") throw new Error("You've already applied.");
      throw e;
    }
    const id = prior?.id || appId;
    await audit({ kind: "creator", id: c.id }, "application.create", "application", id, { campaign: k.id });
    await notify({ template: "new_application", to: teamInbox(), toKind: "team", payload: { creator: c.name || c.handle, title: k.title, score: m.score, campaignId: k.id }, dedupeKey: `new_application:${id}:${prior ? "again" : "first"}` });
  } catch (e) {
    if (!(e instanceof Error) || /^(NEXT_REDIRECT)/.test(e.message)) throw e;
    dest = flashUrl(path, "err", e.message.length < 200 && !e.code ? e.message : "Something went wrong. Try again.");
    if (e.code) console.error("[apply]", e);
  }
  redirect(dest);
}

async function withdraw(fd) {
  "use server";
  const slug = String(fd.get("slug") ?? "");
  const path = `/creator/o/${slug}`;
  const me = await currentCreator();
  if (!me) redirect(`/creator/login?next=${encodeURIComponent(path)}`);
  if (me.claimPending) redirect(path);
  const k = await getCampaign(slug);
  if (!k) redirect("/creator");
  // Only the creator's own application, and only before the brand has picked them.
  const r = await env.DB.prepare("UPDATE campaign_applications SET status='withdrawn' WHERE campaign_id=? AND creator_id=? AND status IN ('new','shortlisted') RETURNING id").bind(k.id, me.creator.id).first();
  if (!r) redirect(flashUrl(path, "err", "This application can't be withdrawn any more. Message the Colatch team."));
  await audit({ kind: "creator", id: me.creator.id }, "application.withdraw", "application", r.id, { campaign: k.id });
  redirect(flashUrl(path, "ok", "Application withdrawn."));
}

const statusLabel = { new: "Applied: the Colatch team is reviewing", shortlisted: "Shortlisted: the brand decides next", accepted: "You're in! Your deal shows up under Applications once it's ready", rejected: "Not selected this time", withdrawn: "You withdrew this application" };

export default async function Page({ params, searchParams }) {
  const k = await getCampaign(params.slug);
  if (!k) notFound();
  const me = await currentCreator();
  const pendingClaim = Boolean(me?.claimPending);
  const c = pendingClaim ? null : me?.creator;
  if (!(await canSee(k, c))) notFound();
  const m = c ? match(c, k) : null;
  const open = isOpen(k);
  const existing0 = c ? await myApplication(k, c) : null;
  const existing = existing0 && existing0.status !== "withdrawn" ? existing0 : null;
  const err = searchParams?.err || "";
  const ok = searchParams?.ok || "";
  const chips = requirementChips(k);
  const accepted = c ? await env.DB.prepare("SELECT id FROM creator_deals WHERE campaign_id=? AND creator_id=? AND sow_accepted_at IS NOT NULL").bind(k.id, c.id).first() : null;
  const brandShown = accepted ? (k.brand || blindBrand(k)) : blindBrand(k);
  const trust = await brandTrust(env, k);
  const left = daysLeft(k.deadline);
  const when = !open ? " · Closed" : left == null ? "" : left <= 0 ? " · last day to apply" : left === 1 ? " · 1 day left" : " · " + left + " days left";
  const pay = k.pay_type || "cash";
  const revs = k.revisions ?? 2;
  const next = encodeURIComponent(`/creator/o/${k.slug}`);

  const hero = (
    <section className="hero"><div className="hero-in">
      <div className="eb">{brandShown} · {PAY_LABEL[pay]}{when}</div>
      <h1>{k.title}</h1>
      <div className="row" style={{ marginTop: 18, gap: 8 }}>{chips.map((r) => <span key={r} className="tag" style={{ background: "rgba(255,255,255,.1)", color: "#F4EFE3" }}>{r}</span>)}</div>
    </div></section>
  );

  let side;
  if (pendingClaim) {
    side = <><h2>Want this one?</h2><ClaimNote status="pending" /></>;
  } else if (!c) {
    side = (
      <>
        <h2>Want this one?</h2>
        <p className="muted" style={{ margin: "0 0 18px" }}>Join Colatch's creator network free to apply. You'll also see every other brief that fits you.</p>
        <a className="btn-foil" href={`/join?next=${next}`}>Join and apply →</a>
        <p className="hint" style={{ margin: "14px 0 0" }}>Already a member? <a className="link" href={`/creator/login?next=${next}`}>Log in</a></p>
      </>
    );
  } else if (existing) {
    side = <><h2>Your application</h2>
      {err && <div className="note bad" style={{ marginBottom: 12 }}>{err}</div>}
      <div className={`note ${existing.status === "accepted" ? "good" : existing.status === "rejected" ? "bad" : "info"}`}>{statusLabel[existing.status] || existing.status}</div>
      {["new", "shortlisted"].includes(existing.status) && <form action={withdraw} style={{ marginTop: 12 }}><input type="hidden" name="slug" value={k.slug} /><button className="btn sm">Withdraw application</button></form>}</>;
  } else if (m && !m.eligible) {
    side = (
      <><h2>Not a fit yet</h2>
        <div className="why opp" style={{ padding: 0, border: 0, boxShadow: "none" }}>{m.blockers.map((b) => <span key={b} className="no" style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "rgba(155,59,59,.08)", color: "#7a2c2c", display: "inline-block", margin: "0 6px 6px 0" }}>{b}</span>)}</div>
        {m.blockers.some((b) => b.startsWith("Add your")) && <a className="btn plum" style={{ marginTop: 12 }} href="/creator/profile">Update profile</a>}
      </>
    );
  } else if (!open) {
    side = <><h2>Closed</h2><p className="muted">This brief has stopped taking applications.</p></>;
  } else {
    side = (
      <form action={apply}>
        <input type="hidden" name="slug" value={k.slug} />
        <div className="row" style={{ gap: 14, marginBottom: 14 }}><div className="score" style={{ "--v": m.score }}><i>{m.score}</i></div><div><div className="lbl">Your match</div><div className="small muted">{m.reasons.join(" · ")}</div></div></div>
        {err && <div className="note bad" style={{ marginBottom: 12 }}>{err}</div>}
        {ok && <div className="note good" style={{ marginBottom: 12 }}>{ok}</div>}
        {existing0?.status === "withdrawn" && <p className="hint">You withdrew earlier. You can apply again while the brief is open.</p>}
        <div className="stack">
          <div className="fld"><label htmlFor="f-creator-o-slug-pitch-1">Why you're right for this</label><textarea id="f-creator-o-slug-pitch-1" name="pitch" rows={4} required minLength={20} maxLength={600} placeholder="I've done 3 festive dance reels for fashion brands; my audience is 70% Delhi-NCR women 18–30…" /></div>
          <div className="fld"><label htmlFor="f-creator-o-slug-rate-quote-2">Your quote for this brief ₹</label><input id="f-creator-o-slug-rate-quote-2" name="rate_quote" defaultValue={c.rate_reel ?? ""} placeholder="Total for all deliverables" /><span className="hint">{c.rate_reel ? `Your usual reel rate is ${inr(c.rate_reel)}.` : ""}</span></div>
        </div>
        <button className="btn-foil" style={{ marginTop: 18, width: "100%", justifyContent: "center" }}>Apply</button>
      </form>
    );
  }

  return (
    <PublicShell creatorName={c ? c.name || c.handle : pendingClaim ? me.creator.name || me.creator.handle : null} path={`/creator/o/${k.slug}`} hero={hero}>
      <div className="pg-brief">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", alignItems: "start" }}>
          <div className="panel pad">
            <div className="trust">
              <span className={trust.funded ? "ok" : ""}>{trust.funded ? "✓ Brand has paid Colatch" : "Brand pays Colatch before you start"}</span>
              {trust.verified && <span className="ok">✓ Verified brand</span>}
              {isFeatured(k) && <span>Featured brief</span>}
              {!NON_CASH.includes(k.pay_type || "cash") && <span className="ok">{payByLine(k)}</span>}
              <span>{trust.avgPayDays != null ? `Pays creators in ${trust.avgPayDays} days on average` : `Paid within ${k.payment_days ?? 30} days of going live`}</span>
              {trust.onTimePct != null && <span>{trust.onTimePct}% of payouts on time</span>}
              <span>{trust.rating != null ? `★ ${trust.rating} from ${trust.ratings} ${trust.ratings === 1 ? "creator" : "creators"}` : "New brand on Colatch"}</span>
              <span>{trust.campaigns > 1 ? `${trust.campaigns} campaigns on Colatch` : "Brief checked by the Colatch team"}</span>
            </div>
            {!accepted && <p className="hint" style={{ margin: "-4px 0 16px" }}>The brand's name and contact stay hidden until you're selected and accept the terms. All talk happens through Colatch, so nobody can pull you off-platform or skip your payment.</p>}
            <h2>The brief</h2>
            <p style={{ whiteSpace: "pre-line", margin: 0, color: "var(--ink-2)", fontSize: 15.5 }}>{k.brief || "Details shared on shortlisting."}</p>
            <div className="grid2" style={{ marginTop: 22, gap: 14 }}>
              {k.deliverables && <div><div className="lbl">Deliverables</div><b>{k.deliverables}</b></div>}
              <div><div className="lbl">Reward</div><b>{rewardLine(k)}</b></div>
              {k.shoot_date && <div><div className="lbl">Shoot / go-live</div><b>{k.shoot_date}</b></div>}
              {k.creators_needed ? <div><div className="lbl">Creators needed</div><b>{k.creators_needed}</b></div> : null}
            </div>
            <div className="deal">
              <div className="lbl" style={{ marginBottom: 10 }}>Deal terms, locked before you apply</div>
              <ul>
                <li><b>{PAY_LABEL[pay]}</b>{NON_CASH.includes(pay) ? ". " + rewardLine(k) + ". No fixed cash fee." : ". Paid within " + (k.payment_days ?? 30) + " days of your post going live."}</li>
                <li><b>{revs} revision {revs === 1 ? "round" : "rounds"}</b> included. Anything more is paid extra or needs your OK.</li>
                <li><b>Usage:</b> {k.usage_rights || "Organic posting only"}. Any other use of your content needs a new agreement and fee.</li>
                <li><b>Disclosure:</b> {DISCLOSURE_LINE}</li>
                <li><b>Tax:</b> TDS is deducted where the law requires it, and you get the certificate. If you're GST-registered, GST is paid on top of your fee.</li>
              </ul>
            </div>
            <div className="loss">
              <h4>What you'd lose going direct</h4>
              {goingDirectLosses({ funded: trust.funded, fee: existing?.rate_quote ?? c?.rate_reel ?? null, payDays: k.payment_days }).map((x) => <div key={x.title}><b>{x.title}.</b> {x.line}</div>)}
            </div>
            <p className="hint" style={{ margin: "14px 0 0" }}>Colatch never charges creators to apply or join. We only contact you from @colatch on Instagram, a @colatch.com email or the WhatsApp number in your portal.</p>
          </div>
          <div className="panel pad">{side}</div>
        </div>
      </div>
    </PublicShell>
  );
}
