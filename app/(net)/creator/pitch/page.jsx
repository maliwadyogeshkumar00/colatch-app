import { redirect } from "next/navigation";
import PublicShell, { Hero } from "../../_ui/PublicShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { currentCreator } from "@/lib/net/creatorAuth";
import { inr } from "@/lib/net/creators";
import { scrubContacts } from "@/lib/net/guard";
import { checkBrief } from "@/lib/net/compliance";
import { PITCH_CATEGORIES, PITCH_FORMATS, PITCH_OCCASIONS, MAX_LIVE_PITCHES } from "../../_ui/pitch";

export const metadata = { title: "Pitch an idea · Colatch", robots: { index: false } };

const CSS = `
.pg-pitch .mine{display:grid;gap:14px}
.pg-pitch .card-p{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:var(--sh-1)}
.pg-pitch .card-p h3{margin:0 0 6px;font-size:17px;color:var(--p900)}
.pg-pitch .card-p p{margin:0 0 10px;color:var(--ink-2);font-size:14px;white-space:pre-line}
.pg-pitch .tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.pg-pitch .tags span{font-size:11.5px;padding:3px 10px;border-radius:999px;background:var(--ivory-2);color:var(--ink-3);font-weight:600}
.pg-pitch .acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pg-pitch .acts form{margin:0}
.pg-pitch .tip{font-size:13px;color:var(--ink-3);line-height:1.6}
.pg-pitch .tip li{margin-bottom:6px}
`;

const back = (kind, msg) => flashUrl("/creator/pitch", kind, msg);
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

async function createPitch(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/pitch");
  const live = (await env.DB.prepare("SELECT COUNT(*) n FROM creator_pitches WHERE creator_id=? AND status='live'").bind(me.creator.id).first())?.n ?? 0;
  if (live >= MAX_LIVE_PITCHES) redirect(back("err", `You can keep ${MAX_LIVE_PITCHES} ideas live at a time. Pause one to add another.`));
  const title = String(fd.get("title") ?? "").trim().slice(0, 90);
  const idea = String(fd.get("idea") ?? "").trim().slice(0, 700);
  if (title.length < 6 || idea.length < 30) redirect(back("err", "Give the idea a clear title and at least a couple of lines on what you'd shoot."));
  const t = scrubContacts(title), i = scrubContacts(idea);
  if (t.found || i.found) redirect(back("err", "Please remove phone numbers, emails, handles and links. Brands book you through Colatch, so your payment is protected."));
  const block = checkBrief(`${title}\n${idea}`).find((f) => f.level === "block");
  if (block) redirect(back("err", `We can't list this idea: ${block.title}. ${block.detail}`));
  const category = String(fd.get("category") ?? "").trim().slice(0, 40) || null;
  const format = pick(String(fd.get("format") ?? ""), PITCH_FORMATS, "Reel");
  const occasion = pick(String(fd.get("occasion") ?? ""), PITCH_OCCASIONS, "Any time");
  const price = Math.round(Number(String(fd.get("price") ?? "").replace(/[^\d]/g, "")));
  if (!Number.isFinite(price) || price < 500) redirect(back("err", "Set your price for this idea, at least ₹500."));
  await env.DB.prepare("INSERT INTO creator_pitches (id, creator_id, title, idea, category, format, occasion, price) VALUES (?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), me.creator.id, title, idea, category, format, occasion, price).run();
  redirect(back("ok", "Your idea is live on the Colatch idea board. Brands can book it today."));
}

async function togglePitch(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/pitch");
  const id = String(fd.get("id") ?? "");
  const p = await env.DB.prepare("SELECT status FROM creator_pitches WHERE id=? AND creator_id=?").bind(id, me.creator.id).first();
  if (!p) redirect(back("err", "That idea was not found."));
  if (p.status === "paused") {
    const live = (await env.DB.prepare("SELECT COUNT(*) n FROM creator_pitches WHERE creator_id=? AND status='live'").bind(me.creator.id).first())?.n ?? 0;
    if (live >= MAX_LIVE_PITCHES) redirect(back("err", `You already have ${MAX_LIVE_PITCHES} ideas live. Pause one first.`));
  }
  await env.DB.prepare("UPDATE creator_pitches SET status=? WHERE id=? AND creator_id=?").bind(p.status === "paused" ? "live" : "paused", id, me.creator.id).run();
  redirect(back("ok", p.status === "paused" ? "Idea is live again." : "Idea paused. Brands won't see it until you switch it back on."));
}

async function removePitch(fd) {
  "use server";
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/pitch");
  // Kept as 'deleted' rather than removed, so any booking that came from it still has its source.
  await env.DB.prepare("UPDATE creator_pitches SET status='deleted' WHERE id=? AND creator_id=?").bind(String(fd.get("id") ?? ""), me.creator.id).run();
  redirect(back("ok", "Idea removed."));
}

export default async function Page({ searchParams }) {
  const me = await currentCreator();
  if (!me) redirect("/creator/login?next=/creator/pitch");
  const c = me.creator;
  const mine = (await env.DB.prepare("SELECT * FROM creator_pitches WHERE creator_id=? AND status <> 'deleted' ORDER BY created_at DESC").bind(c.id).all()).results ?? [];
  const liveN = mine.filter((p) => p.status === "live").length;
  const requests = mine.reduce((a, p) => a + (p.requests || 0), 0);

  const hero = (
    <Hero eyebrow="Creator idea board" title="Don't wait for a brief. <b>Pitch one.</b>">
      <p>Post the content idea you're dying to make, name your price, and brands book it straight from the Colatch idea board. Your handle and contact stay hidden until a brand books, so nobody can take the idea off-platform.</p>
    </Hero>
  );

  return (
    <PublicShell creatorName={c.name || c.handle} path="/creator/pitch" hero={hero}>
      <div className="pg-pitch">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>
        <div className="grid2" style={{ alignItems: "start" }}>
          <form className="panel pad" action={createPitch}>
            <h2>New idea</h2>
            <div className="stack">
              <div className="fld"><label>Title</label><input name="title" required maxLength={90} placeholder="Diwali GRWM in Hinglish, with your festive skincare" /></div>
              <div className="fld"><label>The idea <span className="opt">what you'd shoot, the hook, why your audience will love it</span></label><textarea name="idea" required rows={6} maxLength={700} placeholder={"Open on the diya, mirror shot, 3 steps of my festive routine with your product as the glow step. Ends on the family photo. My audience is 70% women 18–30 in Delhi NCR."} /></div>
              <div className="form-grid">
                <div className="fld"><label>Suits which kind of brand</label><input name="category" list="pitch-cats" maxLength={40} placeholder="Skincare" /><datalist id="pitch-cats">{PITCH_CATEGORIES.map((x) => <option key={x} value={x} />)}</datalist></div>
                <div className="fld"><label>Format</label><select name="format" defaultValue="Reel">{PITCH_FORMATS.map((x) => <option key={x}>{x}</option>)}</select></div>
                <div className="fld"><label>Best for</label><select name="occasion" defaultValue="Any time">{PITCH_OCCASIONS.map((x) => <option key={x}>{x}</option>)}</select></div>
                <div className="fld"><label>Your price (₹)</label><input name="price" inputMode="numeric" required placeholder="25000" /></div>
              </div>
            </div>
            <button className="btn-foil" style={{ marginTop: 18 }}>Put it on the idea board</button>
            <p className="hint" style={{ margin: "12px 0 0" }}>{liveN} of {MAX_LIVE_PITCHES} ideas live. Colatch's fee is added on the brand's side, your price is what you take home before TDS.</p>
          </form>
          <div className="panel pad">
            <h2>What gets booked</h2>
            <ul className="tip">
              <li><b>A moment, not just a product.</b> Ideas tied to Diwali, weddings, IPL or exam season get booked first.</li>
              <li><b>Say who watches you.</b> "70% women in Delhi NCR" beats "big audience".</li>
              <li><b>Price it like you mean it.</b> Brands see your rating and past Colatch work next to the price.</li>
              <li><b>No contact details.</b> They're hidden automatically, and your payment is only protected on Colatch.</li>
            </ul>
            <p className="small muted" style={{ margin: "14px 0 0" }}>{requests} {requests === 1 ? "brand has" : "brands have"} asked to book your ideas so far. <a className="link" href="/pitches">See the idea board</a></p>
          </div>
        </div>

        <div className="sec">
          <div className="h2">Your ideas</div>
          {mine.length === 0 ? <div className="panel empty"><b>No ideas yet.</b>Your first one takes two minutes.</div> : (
            <div className="mine">{mine.map((p) => (
              <div key={p.id} className="card-p">
                <div className="spread"><h3>{p.title}</h3><span className={`pill ${p.status === "live" ? "good" : ""}`}>{p.status === "live" ? "Live" : "Paused"}</span></div>
                <p>{p.idea}</p>
                <div className="tags"><span>{inr(p.price)}</span><span>{p.format}</span><span>{p.occasion}</span>{p.category && <span>{p.category}</span>}<span>{p.requests || 0} {p.requests === 1 ? "booking request" : "booking requests"}</span></div>
                <div className="acts">
                  <form action={togglePitch}><input type="hidden" name="id" value={p.id} /><button className="btn sm">{p.status === "live" ? "Pause" : "Make live"}</button></form>
                  <form action={removePitch}><input type="hidden" name="id" value={p.id} /><button className="btn sm danger">Remove</button></form>
                </div>
              </div>
            ))}</div>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
