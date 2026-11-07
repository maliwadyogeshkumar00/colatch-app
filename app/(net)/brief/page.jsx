import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import PublicShell, { Hero } from "../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { extractNeeds, slugify, shortlistDue, formatIST } from "@/lib/net/brief";
import { rankCreators } from "@/lib/net/campaign";
import { SKILLS, CITIES, LANGUAGES, list } from "@/lib/net/match";
import { int, str, inr, compact, RATE_GUIDE, tierFor } from "@/lib/net/creators";
import { checkBrief } from "@/lib/net/compliance";
import { scrubContacts } from "@/lib/net/guard";
import { readRefCookie, recordReferral, ensureCode } from "@/lib/net/referral";
import { briefScore, isFreeMail } from "@/lib/net/value";
import BriefMeter from "./BriefMeter";

export const metadata = {
  title: "Post a creator brief · Colatch",
  description: "Tell Colatch what you need. We match you with the right creators from India's celebrity and creator network.",
};

const DRAFT = "brief_draft";

async function submitBrief(f) {
  "use server";
  const v = Object.fromEntries([...new Set(f.keys())].map((k) => [k, f.getAll(k).map(String).join(", ")]));
  let id = null;
  try {
    if (str(f.get("website"))) throw new Error("Something went wrong.");
    const name = str(f.get("name")), company = str(f.get("company")), email = str(f.get("email"))?.toLowerCase() ?? null, phone = str(f.get("phone"));
    const raw = String(f.get("raw") ?? "").trim();
    if (!name || !company) throw new Error("Add your name and brand.");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Add a valid work email.");
    if (raw.length < 20) throw new Error("Tell us in a few lines what you need. The more detail, the better the match.");
    const picked = f.getAll("talent").map(String);
    const pickedCities = f.getAll("cities").map(String);
    const pickedLangs = f.getAll("languages").map(String);
    const extra = [
      picked.length ? `Talent: ${picked.join(", ")}.` : "", pickedCities.length ? `Cities: ${pickedCities.join(", ")}.` : "",
      pickedLangs.length ? `Languages: ${pickedLangs.join(", ")}.` : "", str(f.get("count")) ? `Creators needed: ${f.get("count")}.` : "",
      str(f.get("size")) ? `Creator size: ${f.get("size")}.` : "", str(f.get("budget")) ? `Total budget ₹${f.get("budget")}.` : "",
      str(f.get("when")) ? `Go-live: ${f.get("when")}.` : "",
    ].filter(Boolean).join(" ");
    const { needs, engine } = await extractNeeds(env, `${raw}\n${extra}`);
    // What the client ticked always beats what was read from the text.
    if (picked.length) needs.talent_types = picked;
    if (pickedCities.length) needs.city = pickedCities;
    if (pickedLangs.length) needs.languages = pickedLangs;
    if (int(f.get("count"))) needs.creators_needed = int(f.get("count"));
    if (int(f.get("budget"))) needs.budget_total = int(f.get("budget"));
    const size = String(f.get("size") ?? "");
    const ranges = { nano: [1000, 10000], micro: [10000, 100000], mid: [100000, 500000], macro: [500000, null] };
    if (ranges[size]) [needs.min_followers, needs.max_followers] = ranges[size];

    needs.creator_brief = scrubContacts(needs.creator_brief).text;
    needs.title = scrubContacts(needs.title).text;
    const flags = checkBrief(raw);
    if (flags.some((x) => x.level === "block")) throw new Error("Colatch doesn't run campaigns for betting or real-money gaming. Advertising them is an offence under India's Online Gaming Act, for brands and creators alike.");
    const payType = /\b(commission|affiliate|per sale|% of sales)\b/i.test(raw) ? "commission"
      : /\b(giveaway|contest|lucky draw)\b/i.test(raw) ? "giveaway"
      : /\b(event (pass|ticket|entry)|tickets?|passes)\b/i.test(raw) ? "ticket"
      : /\b(barter|product[- ]only|free product|gifting|in exchange for product)\b/i.test(raw) ? "barter" : "cash";
    const rush = f.get("rush") ? 1 : 0;
    const featuredAsk = Boolean(f.get("featured"));
    // #95 Rush: shortlist in 6 working hours instead of 18.
    const due = shortlistDue(new Date(), rush ? 6 : 18);
    const bu = str(f.get("brand_url"));
    const brandUrl = bu ? (/^https?:\/\//.test(bu) ? bu : "https://" + bu) : null;
    const site = str(f.get("site"));
    // #68 Scam brief shield: free webmail and no website at all → held for a quick human check.
    const held = isFreeMail(email) && !brandUrl && !site ? "Unverified brand: free email and no website" : null;
    // #49 Brief quality score from what the brand actually gave.
    const scored = briefScore({ ...needs, deliverables: needs.deliverables, deadline: str(f.get("when")), mandatories: str(f.get("mandatories")), brand_url: brandUrl || site, pay_type: payType });
    const ref = readRefCookie(str(f.get("ref")));
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO campaigns (id, slug, title, brand, brief, raw_brief, deliverables, talent_types, niche, city, languages, gender, min_followers, max_followers,
       creators_needed, budget_total, shoot_date, status, source, client_name, client_company, client_email, client_phone, ai_notes, is_open, pay_type,
       mandatories, exclusions, brand_url, shortlist_due, ref_code, rush, held_reason, brief_score)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','client',?,?,?,?,?,0,?,?,?,?,?,?,?,?,?)`
    ).bind(id, slugify(needs.title), needs.title, company, needs.creator_brief, `${raw}\n\n${extra}`.trim(), needs.deliverables,
      needs.talent_types.join(", ") || null, needs.niche.join(", ") || null, needs.city.join(", ") || null, needs.languages.join(", ") || null,
      needs.gender, needs.min_followers, needs.max_followers, needs.creators_needed, needs.budget_total, str(f.get("when")),
      name, company, email, phone, JSON.stringify({ engine, questions: needs.questions, flags: flags.map((x) => x.title), featured_request: featuredAsk, website: site }), payType,
      str(f.get("mandatories")), str(f.get("exclusions")), brandUrl, due, ref, rush, held, scored.score).run();
    await recordReferral(env, ref, "brand", email).catch(() => false);
  } catch (e) {
    // Keep what they typed so a mistake doesn't wipe the brief.
    cookies().set(DRAFT, JSON.stringify(v).slice(0, 3800), { httpOnly: true, secure: true, sameSite: "lax", path: "/brief", maxAge: 600 });
    redirect(`/brief?err=${encodeURIComponent(e instanceof Error ? e.message : "Something went wrong.")}`);
  }
  cookies().set(DRAFT, "", { path: "/brief", maxAge: 0 });
  redirect(`/brief?done=${id}`);
}

/** Rebuild the "here's what we understood" summary from the saved campaign. */
async function loadDone(id) {
  const k = await env.DB.prepare("SELECT * FROM campaigns WHERE id=? AND source='client'").bind(id).first();
  if (!k) return null;
  let notes = {};
  try { notes = JSON.parse(k.ai_notes || "{}"); } catch {}
  const needs = {
    talent_types: list(k.talent_types), city: list(k.city), languages: list(k.languages), niche: list(k.niche), gender: k.gender,
    min_followers: k.min_followers, max_followers: k.max_followers, deliverables: k.deliverables, budget_total: k.budget_total,
    creators_needed: k.creators_needed, questions: Array.isArray(notes.questions) ? notes.questions : [],
  };
  const pool = (await rankCreators(env, {
    talent_types: k.talent_types, niche: k.niche, city: k.city, languages: k.languages,
    gender: k.gender, min_followers: k.min_followers, max_followers: k.max_followers,
  }, 500)).length;
  const tier = tierFor(needs.min_followers ?? needs.max_followers ?? 50000) || "Micro";
  const [lo, hi] = RATE_GUIDE[tier];
  const n = needs.creators_needed || 1;
  const est = k.pay_type !== "cash" ? null : [lo * n, hi * n];
  const code = k.client_email ? await ensureCode(env, "brand", String(k.client_email).toLowerCase(), k.client_company).catch(() => null) : null;
  const scored = briefScore({ ...k });
  return { needs, pool, est, due: k.shortlist_due, code, low: Boolean(est && needs.budget_total && needs.budget_total < est[0]),
    score: k.brief_score ?? scored.score, missing: scored.missing.slice(0, 3), held: k.held_reason, rush: Number(k.rush) === 1, featured: Boolean(notes.featured_request) };
}

const CSS = `.pg-brief .bscore{display:flex;gap:16px;align-items:flex-start;padding:16px 18px;border-radius:14px;background:var(--ivory-2);border:1px solid var(--line)}
.pg-brief .bscore-ring{flex:none;width:68px;height:68px;border-radius:50%;display:grid;place-content:center;text-align:center;border:3px solid var(--gold);line-height:1}
.pg-brief .bscore-ring b{font-size:22px;color:var(--p900)}.pg-brief .bscore-ring span{font-size:10px;color:var(--ink-4)}
.pg-brief .bscore-ring.lo{border-color:#c98a3a}.pg-brief .bscore-ring.hi{border-color:var(--good)}
.pg-brief .addon{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--paper);cursor:pointer}
.pg-brief .addon input{margin-top:4px}.pg-brief .addon b{display:block}.pg-brief .addon .hint{display:block}
.pg-brief .meter{margin-top:8px;display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-3)}
.pg-brief .meter .bar{flex:1;height:6px;border-radius:99px;background:var(--line);overflow:hidden}.pg-brief .meter .bar i{display:block;height:100%;background:var(--gold-foil);transition:width .3s}`;

export default async function Page({ searchParams }) {
  const sp = searchParams ?? {};
  const done = sp.done ? await loadDone(String(sp.done)) : null;
  const err = sp.err ? String(sp.err) : "";
  let v = {};
  if (err) { try { v = JSON.parse(cookies().get(DRAFT)?.value || "{}"); } catch {} }
  if (!done && !err && sp.again) {
    const prev = await env.DB.prepare("SELECT raw_brief, client_company, mandatories, exclusions, brand_url FROM campaigns WHERE slug=?").bind(String(sp.again)).first();
    if (prev) v = { raw: String(prev.raw_brief || "").split("\n\n")[0], company: prev.client_company || "", mandatories: prev.mandatories || "", exclusions: prev.exclusions || "", brand_url: prev.brand_url || "" };
  }
  // From "Book again" on the roster: name the creator up front so the team rebooks them at the repeat rate.
  if (!done && !err && sp.creator) {
    const h = String(sp.creator).replace(/[^a-z0-9._]/gi, "").slice(0, 40);
    if (h) v = { ...v, raw: `Rebooking @${h} at the Colatch repeat rate. ${v.raw ?? ""}`.trim() };
  }
  const has = (k, x) => (v[k] ?? "").split(", ").includes(x);
  const origin = `https://${headers().get("host")}`;

  const hero = (
    <Hero eyebrow="For brands" title="Tell us who you need. <b>We'll find them.</b>">
      <p>Describe the campaign in your own words, like "4 Bhangra dancers in Delhi for a Lohri reel". Colatch's matching engine reads it and finds creators who fit on talent, city, size and language. Our team then sends you a shortlist within 2 working days.</p>
    </Hero>
  );

  return (
    <PublicShell mode="client" hero={hero}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wrap narrow pg-brief" style={{ padding: 0 }}>
        {done ? (
          <div className="panel pad">
            <h2>Brief received</h2>
            <h3 style={{ fontSize: 24, fontWeight: 300 }}>Thanks. Here's what we understood.</h3>
            {done.held
              ? <div className="note warn" style={{ marginTop: 14 }}><b>We'll quickly confirm your brand first.</b> You used a personal email and no website, so a Colatch strategist will call or WhatsApp you to verify before creators see this brief. It keeps creators safe from fake-brand scams, and verified brands get more applicants.</div>
              : done.due && <div className="note good" style={{ marginTop: 14 }}><b>{done.rush ? "Rush shortlist: " : ""}Your shortlist will be ready by {formatIST(done.due)}.</b> We'll send it to your email and WhatsApp as a private link where you approve each creator.</div>}
            <div className="bscore" style={{ marginTop: 14 }}>
              <div className={`bscore-ring ${done.score >= 75 ? "hi" : done.score >= 50 ? "mid" : "lo"}`}><b>{done.score}</b><span>/100</span></div>
              <div><b>Brief strength</b>
                <div className="hint">{done.score >= 85 ? "Excellent. Creators will know exactly what to make." : "Complete briefs get about twice the applicants. To raise it, add:"}</div>
                {done.score < 85 && done.missing.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{done.missing.map((m) => <li key={m}>{m}</li>)}</ul>}
                {done.score < 85 && <div className="hint" style={{ marginTop: 6 }}>Just reply to our WhatsApp with these and we'll add them.</div>}
              </div>
            </div>
            {done.featured && <div className="note info" style={{ marginTop: 12 }}>You asked to feature this brief (₹1,999 for 7 days at the top of every matching creator's feed). We'll confirm it with your shortlist.</div>}
            <div className="stack" style={{ marginTop: 18 }}>
              <div><div className="lbl">Looking for</div><div>
                {done.needs.talent_types.length ? done.needs.talent_types.map((t) => <span key={t} className="tag">{t}</span>) : <span className="tag">Creators of any kind</span>}
                {done.needs.city.map((t) => <span key={"c" + t} className="tag">{t}</span>)}
                {done.needs.languages.map((t) => <span key={"l" + t} className="tag">{t}</span>)}
                {done.needs.gender && <span className="tag">{done.needs.gender}</span>}
                {(done.needs.min_followers || done.needs.max_followers) ? <span className="tag">{compact(done.needs.min_followers || 0)}{done.needs.max_followers ? `–${compact(done.needs.max_followers)}` : "+"} followers</span> : null}
              </div></div>
              {done.needs.deliverables && <div><div className="lbl">Deliverables</div><b>{done.needs.deliverables}</b></div>}
              {done.needs.budget_total ? <div><div className="lbl">Your budget</div><b>{inr(done.needs.budget_total)}</b></div> : null}
              {done.est && <div><div className="lbl">Typical market cost for this brief</div><b>{inr(done.est[0])} – {inr(done.est[1])}</b>
                <div className="hint">For {done.needs.creators_needed || 1} {(done.needs.creators_needed || 1) === 1 ? "creator" : "creators"} at this size, 1 reel each, before Colatch's fee and GST. Your shortlist will show each creator's exact fee.</div>
                {done.low && <div className="note warn" style={{ marginTop: 10 }}>Your budget is below the usual range. We'll suggest smaller creators or fewer deliverables so it still works.</div>}</div>}
              <div className="note good"><b>{done.pool > 0 ? `${done.pool} ${done.pool === 1 ? "creator" : "creators"} in our network already ${done.pool === 1 ? "fits" : "fit"} this.` : "We will source fresh creators for this."}</b> A Colatch strategist will check the brief, confirm details with you and share a shortlist{done.needs.questions.length ? ". We may ask:" : "."}
                {done.needs.questions.length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{done.needs.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}</div>
            </div>
            {done.code && <div className="panel pad" style={{ marginTop: 18, boxShadow: "none", background: "var(--ivory-2)" }}>
              <h2>Know another brand that needs creators?</h2>
              <p style={{ margin: "0 0 10px" }}>Share your link. For 12 months you earn credit off your own Colatch invoices on every campaign they run.</p>
              <div className="row"><code className="k">{origin}/r/{done.code}</code></div>
            </div>}
            <a className="btn" style={{ marginTop: 18 }} href="/brief">Send another brief</a>
          </div>
        ) : (
          <form className="panel pad" action={submitBrief}>
            <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" /></div>
            {sp.ref && <input type="hidden" name="ref" value={String(sp.ref)} />}
            {err && <div className="note bad" style={{ marginBottom: 16 }}>{err}</div>}
            <h2>What do you need?</h2>
            <div className="fld"><label>Describe the campaign</label><textarea id="brief-raw" name="raw" rows={6} required placeholder="We're launching a festive kurta range and need 4 female Bhangra dancers in Delhi or Chandigarh, 50K+ followers, Punjabi audience. 1 reel + 2 stories each, going live 10 Jan." defaultValue={v.raw ?? ""} /><span className="hint">Write it like a WhatsApp message. Talent, city, audience, dates, what to post.</span></div>
            <BriefMeter target="brief-raw" />

            <details className="box" style={{ marginTop: 18 }} open={Boolean(v.talent || v.cities)}>
              <summary>Add specifics (optional, makes the match sharper)</summary>
              <div className="inner form-grid">
                <div className="fld full"><label>Talent needed</label><div className="chips">{SKILLS.map((s) => <label key={s} className="chip"><input type="checkbox" name="talent" value={s} defaultChecked={has("talent", s)} /><span>{s}</span></label>)}</div></div>
                <div className="fld full"><label>Cities</label><div className="chips">{CITIES.map((s) => <label key={s} className="chip"><input type="checkbox" name="cities" value={s} defaultChecked={has("cities", s)} /><span>{s}</span></label>)}</div></div>
                <div className="fld full"><label>Languages</label><div className="chips">{LANGUAGES.map((s) => <label key={s} className="chip"><input type="checkbox" name="languages" value={s} defaultChecked={has("languages", s)} /><span>{s}</span></label>)}</div></div>
                <div className="fld"><label>Creator size</label><select name="size" defaultValue={v.size ?? ""}>{[["", "Not sure, suggest"], ["nano", "Nano (1K–10K)"], ["micro", "Micro (10K–1L)"], ["mid", "Mid (1L–5L)"], ["macro", "Macro (5L+)"]].map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
                <div className="fld"><label>How many creators</label><input name="count" defaultValue={v.count ?? ""} placeholder="e.g. 5" /></div>
                <div className="fld"><label>Total budget ₹</label><input name="budget" defaultValue={v.budget ?? ""} placeholder="e.g. 300000" /></div>
                <div className="fld"><label>Go-live date</label><input name="when" type="date" defaultValue={v.when ?? ""} /></div>
                <div className="fld full"><label>Must include <span className="opt">— one per line</span></label><textarea name="mandatories" rows={3} placeholder={'Say "festive collection" in the first 5 seconds\nShow the product front-on'} defaultValue={v.mandatories ?? ""} /></div>
                <div className="fld full"><label>Must not <span className="opt">— competitors, words, claims</span></label><textarea name="exclusions" rows={2} defaultValue={v.exclusions ?? ""} /></div>
                <div className="fld full"><label>Where should viewers go? <span className="opt">— we create a tracked link per creator</span></label><input name="brand_url" defaultValue={v.brand_url ?? ""} placeholder="https://yourbrand.com/collection" /></div>
              </div>
            </details>

            <h2 style={{ marginTop: 26 }}>About you</h2>
            <div className="form-grid">
              <div className="fld"><label>Your name</label><input name="name" required defaultValue={v.name ?? ""} /></div>
              <div className="fld"><label>Brand / company</label><input name="company" required defaultValue={v.company ?? ""} /></div>
              <div className="fld"><label>Work email</label><input name="email" type="email" required defaultValue={v.email ?? ""} /></div>
              <div className="fld"><label>Phone / WhatsApp</label><input name="phone" defaultValue={v.phone ?? ""} /></div>
              <div className="fld full"><label>Company website <span className="opt">— helps us verify you faster</span></label><input name="site" defaultValue={v.site ?? ""} placeholder="yourbrand.com" /></div>
            </div>

            <h2 style={{ marginTop: 26 }}>Speed it up <span className="opt" style={{ textTransform: "none", letterSpacing: 0 }}>— optional</span></h2>
            <div className="stack">
              <label className="addon"><input type="checkbox" name="rush" defaultChecked={Boolean(v.rush)} /><span><b>Rush shortlist in 6 working hours</b><span className="hint">Instead of 2 working days. Adds 5% of the creator fees, shown line by line on your shortlist.</span></span></label>
              <label className="addon"><input type="checkbox" name="featured" defaultChecked={Boolean(v.featured)} /><span><b>Feature this brief for 7 days, ₹1,999</b><span className="hint">Pinned at the top of every matching creator's feed, so the best people apply first. We confirm before charging.</span></span></label>
            </div>
            <button className="btn-foil" style={{ marginTop: 22 }}>Find my creators →</button>
            <p className="hint" style={{ margin: "12px 0 0" }}>Your budget and contact details stay with the Colatch team. Creators only see the brief.</p>
          </form>
        )}
      </div>
    </PublicShell>
  );
}
