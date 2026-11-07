import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import PublicShell, { Hero } from "../../_ui/PublicShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { compact, inr, erBand } from "@/lib/net/creators";
import { requirementChips, PAY_LABEL } from "@/lib/net/campaign";
import { quote, railIndex, RAIL, feePct } from "@/lib/net/deal";
import { dealValue, sumValue, baselines } from "@/lib/net/value";
import { ensureCode } from "@/lib/net/referral";
import { scrubContacts } from "@/lib/net/guard";

export const metadata = { title: "Your shortlist · Colatch", robots: { index: false } };

const CSS = `
.pg-shortlist .dots{display:inline-flex;gap:4px}
.pg-shortlist .dots i{width:10px;height:10px;border-radius:50%;background:var(--line-3);display:inline-block}
.pg-shortlist .dots i.on{background:var(--p700)}
`;

async function campaignFor(token) {
  const t = String(token || "");
  return t.length >= 16 ? env.DB.prepare("SELECT * FROM campaigns WHERE share_token=?").bind(t).first() : null;
}
const back = (token, msg) => flashUrl(`/shortlist/${encodeURIComponent(token)}`, "ok", msg);

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
  const { token, dealId, own } = await ownDeal(f);
  if (own) {
    await env.DB.prepare("UPDATE creator_deals SET brand_signoff_at=COALESCE(brand_signoff_at, datetime('now')), proof_public=? WHERE id=?").bind(f.get("public") ? 1 : 0, dealId).run();
    await env.DB.prepare("INSERT INTO deal_events (id, deal_id, actor, kind, note) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), dealId, "brand", "approved", "Brand signed off the proof of work").run();
  }
  redirect(back(token, "Signed off. Thank you!"));
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

async function decide(f, d) {
  const token = String(f.get("token") ?? "");
  const k = await campaignFor(token);
  if (!k) notFound();
  const app = String(f.get("app") ?? "");
  const note = String(f.get("note") ?? "").trim().slice(0, 500) || null;
  if (app) {
    await env.DB.prepare("UPDATE campaign_applications SET client_decision=?, client_note=COALESCE(?, client_note) WHERE id=? AND campaign_id=?").bind(d || null, note, app, k.id).run();
  }
  redirect(back(token, d === "approved" ? "Approved. The Colatch team will lock this creator in." : d === "declined" ? "Noted. We will suggest a replacement." : "Saved."));
}
async function approve(f) { "use server"; await decide(f, "approved"); }
async function decline(f) { "use server"; await decide(f, "declined"); }

const initials = (s) => String(s || "").replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

export default async function Page({ params, searchParams }) {
  const token = params.token;
  const k = await campaignFor(token);
  if (!k) notFound();

  const rows = (await env.DB.prepare(
    `SELECT a.*, c.profile_pic, c.followers AS cf, c.engagement_rate, c.quality_score, c.verified, c.skills, c.niche AS cniche, c.city AS ccity, c.language, c.portfolio_links, c.bio_pitch, c.avg_views
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
  const promiseLine = actualCpv == null ? "Shows once posts are live" : promise ? (actualCpv > promise ? "vs ₹" + promise.toFixed(2) + " promised: we will add posts free to close the gap" : "vs ₹" + promise.toFixed(2) + " promised ✓") : "across live posts";
  const ranked = [...live].filter((d) => d.fee && d.actual_views).sort((a, b) => a.fee / a.actual_views - b.fee / b.actual_views);
  const pct = feePct(env);
  const values = deals.map((d) => dealValue(env, d, pct));
  const tot = sumValue(values);
  const base = baselines(env);
  const brandEmail = String(k.client_email || "").toLowerCase();
  const myCode = brandEmail ? await ensureCode(env, "brand", brandEmail, k.client_company || k.brand).catch(() => null) : null;
  const rated = new Set(((await env.DB.prepare("SELECT deal_id FROM ratings WHERE by_side='brand' AND deal_id IN (SELECT id FROM creator_deals WHERE campaign_id=?)").bind(k.id).all()).results ?? []).map((r) => r.deal_id));
  const dotOn = (i, at) => (i > at ? "" : "on");
  const allIn = (fee) => (fee ? quote(env, fee, false) : null);
  const origin = `https://${headers().get("host")}`;
  const darkTag = { background: "rgba(255,255,255,.1)", color: "#F4EFE3" };
  const lblDim = { color: "rgba(244,239,227,.6)" };

  const hero = (
    <Hero eyebrow={`Your Colatch shortlist · ${k.brand || k.client_company || ""}`} title={escapeHtml(k.title)}>
      <p>{rows.length} {rows.length === 1 ? "creator" : "creators"} picked for this brief. Approve the ones you want, or tell us why one isn't right and we'll replace them. Fees shown are the creator's quote, before Colatch's fee and GST.</p>
      <div className="row" style={{ marginTop: 16, gap: 8 }}>{requirementChips(k).map((r) => <span key={r} className="tag" style={darkTag}>{r}</span>)}<span className="tag" style={darkTag}>{PAY_LABEL[k.pay_type || "cash"]}</span></div>
    </Hero>
  );

  return (
    <PublicShell mode="client" hero={hero}>
      <div className="pg-shortlist">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ marginBottom: 16 }}><Flash sp={searchParams} /></div>

        {deals.length > 0 && <div className="panel pad" style={{ marginBottom: 22, background: "linear-gradient(135deg,#2E1B36,#1E1128)", color: "#F4EFE3", border: 0 }}>
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

        {deals.length > 0 && <div style={{ marginBottom: 34 }}>
          <div className="spread" style={{ marginBottom: 12 }}><div className="h2" style={{ margin: 0 }}>Campaign live</div><div className="row" style={{ gap: 8 }}><a className="btn sm" href={`/receipt/${params.token}`}>Value receipt</a><a className="btn sm" href={`/brief?again=${encodeURIComponent(k.slug)}`}>Book again</a></div></div>
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
              const at = railIndex(d);
              return (
                <tr key={d.id}>
                  <td><div className="who"><div className="ava" style={{ width: 32, height: 32, fontSize: 11 }}>{d.profile_pic ? <img src={d.profile_pic} alt="" /> : initials(d.name || d.handle)}</div><div><b>{d.name || d.handle}</b><span>{d.deliverable}</span></div></div></td>
                  <td><span className="dots">{RAIL.map((r, i) => <i key={r.key} className={dotOn(i, at)} title={r.label} />)}</span><div className="hint">{RAIL[Math.max(0, at)].label}</div></td>
                  <td className="num">{compact(d.actual_views)}</td>
                  <td className="num">{d.fee && d.actual_views ? "₹" + (d.fee / d.actual_views).toFixed(2) : "—"}</td>
                  <td className="num">{d.clicks}</td>
                  <td>
                    {d.post_url && d.live_at ? <a className="link" href={d.post_url} target="_blank" rel="noopener">View ↗</a> : <span className="hint">Not live yet</span>}
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

        {myCode && <div className="note info" style={{ marginBottom: 18 }}>Know another brand that needs creators? Share <code className="k">{origin}/r/{myCode}</code>. For 12 months you get credit off your Colatch invoices on every campaign they run.</div>}
        <div className="stack">
          {rows.map((r) => {
            const b = erBand(r.engagement_rate, r.cf ?? r.followers);
            const links = String(r.portfolio_links || "").split(/\s+/).filter((u) => /^https?:\/\//.test(u)).slice(0, 3);
            const q = allIn(r.rate_quote);
            return (
              <div key={r.id} className="panel pad">
                <div className="spread" style={{ alignItems: "flex-start" }}>
                  <div className="who"><div className="ava" style={{ width: 56, height: 56 }}>{r.profile_pic ? <img src={r.profile_pic} alt="" /> : initials(r.name || r.handle)}</div>
                    <div><b style={{ fontSize: 17 }}>{r.name || r.handle}{r.verified ? " ✓" : ""}</b><span><a className="link" href={`https://instagram.com/${r.handle}`} target="_blank" rel="noopener">@{r.handle}</a>{r.ccity || r.city ? ` · ${r.ccity || r.city}` : ""}</span></div></div>
                  <div className="row" style={{ gap: 8 }}>
                    {r.client_decision === "approved" ? <span className="pill good">Approved</span> : r.client_decision === "declined" ? <span className="pill low">Declined</span> : <span className="pill ok">Waiting for you</span>}
                    <div className="score sm" style={{ "--v": r.match_score ?? 50 }} title="Match score"><i>{r.match_score ?? "—"}</i></div>
                  </div>
                </div>
                <div className="grid4" style={{ marginTop: 16 }}>
                  <div><div className="lbl">Followers</div><b>{compact(r.cf ?? r.followers)}</b>{r.verified ? <div className="hint">From Instagram</div> : <div className="hint">Self-reported</div>}</div>
                  <div><div className="lbl">Engagement</div><b>{r.engagement_rate != null ? `${r.engagement_rate}%` : "—"}</b> {r.engagement_rate != null && <span className={`pill ${b.tone}`}>{b.label}</span>}</div>
                  <div><div className="lbl">Avg reel views</div><b>{compact(r.avg_views)}</b></div>
                  <div><div className="lbl">Creator quote</div><b>{inr(r.rate_quote)}</b>{q && <details style={{ marginTop: 4 }}><summary className="hint" style={{ cursor: "pointer" }}>All-in {inr(q.total)}</summary><div className="hint" style={{ marginTop: 4 }}>Creator {inr(q.creatorFee)} · Colatch {q.pct}% {inr(q.colatch)} · GST {inr(q.gstOnColatch)}{r.rate_quote && r.avg_views ? " · ₹" + (r.rate_quote / r.avg_views).toFixed(2) + " per view" : ""}</div></details>}</div>
                </div>
                {r.team_note && <div className="note info" style={{ marginTop: 14 }}><b>Why we picked them:</b> {r.team_note}</div>}
                {!r.team_note && r.match_reasons && <p className="hint" style={{ margin: "12px 0 0" }}>{r.match_reasons}</p>}
                {links.length > 0 && <div className="row" style={{ marginTop: 12, gap: 8 }}>{links.map((u, i) => <a key={u} className="btn sm" href={u} target="_blank" rel="noopener">Sample {i + 1} ↗</a>)}</div>}
                <form action={approve} className="row" style={{ marginTop: 16 }}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="app" value={r.id} />
                  <input className="in" name="note" style={{ flex: 1, minWidth: 200 }} placeholder="Comment for the Colatch team (optional)" defaultValue={r.client_note ?? ""} />
                  <button className="btn" formAction={decline}>Not for us</button>
                  <button className="btn plum">Approve</button>
                </form>
              </div>
            );
          })}
          {!rows.length && <div className="panel empty"><b>Your shortlist is being prepared.</b>The Colatch team will add creators here. This page updates as soon as they do.</div>}
        </div>
      </div>
    </PublicShell>
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
