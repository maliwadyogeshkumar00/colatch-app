import { notFound } from "next/navigation";
import { headers } from "next/headers";
import PublicShell from "../../_ui/PublicShell";
import PrintButton from "./PrintButton";
import { env } from "@/lib/net/env";
import { inr, compact } from "@/lib/net/creators";
import { quote, feePct } from "@/lib/net/deal";
import { dealValue, sumValue, baselines } from "@/lib/net/value";
import { ensureCode } from "@/lib/net/referral";

export const metadata = { title: "Value receipt · Colatch", robots: { index: false, follow: false } };

const CSS = `
.pg-receipt{padding:10px 0 40px}
.pg-receipt .paper{position:relative;max-width:640px;margin:0 auto;background:#fffdf8;color:#1F1524;padding:44px 40px 40px;box-shadow:0 30px 60px -30px rgba(31,21,36,.35),0 2px 6px rgba(31,21,36,.06);
  -webkit-mask:radial-gradient(circle 7px at 50% 0,#0000 98%,#000) top/18px 51% repeat-x,radial-gradient(circle 7px at 50% 100%,#0000 98%,#000) bottom/18px 51% repeat-x;
  mask:radial-gradient(circle 7px at 50% 0,#0000 98%,#000) top/18px 51% repeat-x,radial-gradient(circle 7px at 50% 100%,#0000 98%,#000) bottom/18px 51% repeat-x}
.pg-receipt .mono{font-family:ui-monospace,"SFMono-Regular","Roboto Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.pg-receipt .head{text-align:center;border-bottom:1px dashed rgba(31,21,36,.3);padding-bottom:18px;margin-bottom:18px}
.pg-receipt .head svg.em{width:34px;height:34px}
.pg-receipt .head .ttl{margin:10px 0 2px;font-size:13px;letter-spacing:.32em;text-transform:uppercase;font-weight:700}
.pg-receipt .head .sub{font-size:12px;color:#5A5664}
.pg-receipt .meta{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:12.5px;margin-bottom:18px}
.pg-receipt .meta span{color:#8A8694;text-transform:uppercase;letter-spacing:.1em;font-size:10.5px;padding-top:2px}
.pg-receipt .sect{font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:#8A8694;font-weight:700;margin:22px 0 8px}
.pg-receipt .ln{display:flex;justify-content:space-between;gap:14px;font-size:14px;padding:5px 0}
.pg-receipt .ln .l{flex:1;min-width:0}
.pg-receipt .ln .l small{display:block;color:#8A8694;font-size:11.5px}
.pg-receipt .ln .dots{flex:1;border-bottom:1px dotted rgba(31,21,36,.28);margin:0 6px 5px;min-width:20px;align-self:flex-end}
.pg-receipt .rule{border-top:1px dashed rgba(31,21,36,.3);margin:12px 0}
.pg-receipt .tot{display:flex;justify-content:space-between;font-weight:700;font-size:15px;padding:6px 0}
.pg-receipt .grand{margin:22px -40px 0;padding:22px 40px;background:#1E1128;color:#F4EFE3;text-align:center}
.pg-receipt .grand .k{font-size:10.5px;letter-spacing:.28em;text-transform:uppercase;color:#E8B84B}
.pg-receipt .grand .v{font-size:46px;font-weight:300;letter-spacing:-.03em;margin-top:4px}
.pg-receipt .grand .s{font-size:12.5px;opacity:.75;margin-top:4px}
.pg-receipt .proofs{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:6px}
.pg-receipt .proofs div{border:1px solid rgba(31,21,36,.12);border-radius:10px;padding:10px 12px;font-size:12.5px;color:#5A5664}
.pg-receipt .proofs b{display:block;font-size:20px;font-weight:500;color:#1F1524}
.pg-receipt .foot-note{font-size:11.5px;color:#8A8694;line-height:1.5;margin-top:18px}
.pg-receipt .thanks{text-align:center;font-size:12px;letter-spacing:.2em;text-transform:uppercase;margin-top:22px;color:#5A5664}
.pg-receipt .bar{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:640px;margin:22px auto 0}
.pg-receipt .refer{max-width:640px;margin:16px auto 0;padding:16px 18px;border-radius:14px;background:var(--ivory-2);border:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.pg-receipt .refer code{font-size:12.5px;background:#fff;border:1px solid var(--line);padding:2px 8px;border-radius:6px;word-break:break-all}
@media(max-width:600px){.pg-receipt .paper{padding:34px 20px 30px}.pg-receipt .grand{margin:22px -20px 0;padding:20px}.pg-receipt .grand .v{font-size:36px}}
@media print{
  .net:has(.pg-receipt) .top,.net:has(.pg-receipt) .foot,.pg-receipt .noprint{display:none!important}
  .net:has(.pg-receipt){background:#fff!important}
  .pg-receipt .paper{box-shadow:none;-webkit-mask:none;mask:none;border:1px dashed #999;max-width:none}
  .pg-receipt .grand{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

const day = (s) => String(s || "").slice(0, 10);

export default async function Page({ params }) {
  const token = String(params?.token || "");
  const k = token.length >= 16 ? await env.DB.prepare("SELECT * FROM campaigns WHERE share_token=?").bind(token).first() : null;
  if (!k) notFound();

  const deals = (await env.DB.prepare("SELECT d.*, c.name, c.handle FROM creator_deals d JOIN creators c ON c.id=d.creator_id WHERE d.campaign_id=? AND d.stage <> ? ORDER BY d.created_at ASC").bind(k.id, "dropped").all()).results ?? [];
  const pct = feePct(env);
  const base = baselines(env);
  const tot = sumValue(deals.map((d) => dealValue(env, d, pct)));

  // What the brand spends: creator fees, Colatch's fee, GST on Colatch's fee.
  const q = deals.reduce((a, d) => { const x = quote(env, d.fee || 0, false); return { colatch: a.colatch + x.colatch, gst: a.gst + x.gstOnColatch }; }, { colatch: 0, gst: 0 });
  const spend = tot.fee + q.colatch + q.gst;
  const received = tot.saved + tot.adsEquivalent + tot.sales;
  const multiple = spend > 0 ? received / spend : null;

  // Proof lines that are not money.
  const live = deals.filter((d) => d.live_at);
  const onTime = live.filter((d) => !d.go_live_date || day(d.live_at) <= day(d.go_live_date)).length;
  const firstTime = deals.filter((d) => d.draft_status === "approved" && !(d.revisions_used > 0)).length;
  const signed = deals.filter((d) => d.brand_signoff_at).length;
  const fiveStar = (await env.DB.prepare("SELECT COUNT(*) n FROM ratings WHERE by_side='brand' AND stars=5 AND deal_id IN (SELECT id FROM creator_deals WHERE campaign_id=?)").bind(k.id).first())?.n ?? 0;
  const clicks = deals.reduce((a, d) => a + (d.clicks || 0), 0);
  const orders = deals.reduce((a, d) => a + (d.orders || 0), 0);

  const brandEmail = String(k.client_email || "").toLowerCase();
  const code = brandEmail ? await ensureCode(env, "brand", brandEmail, k.client_company || k.brand).catch(() => null) : null;
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const receiptNo = "CLT-" + String(k.id).replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase();
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
  const brand = k.client_company || k.brand || "Your brand";

  const Line = ({ l, sub, v, mono = true }) => (
    <div className="ln"><div className="l">{l}{sub && <small>{sub}</small>}</div><span className={mono ? "mono" : ""}>{v}</span></div>
  );

  const mailBody = [
    `Colatch value receipt ${receiptNo} for "${k.title}" (${brand}).`,
    "",
    `Total spend: ${inr(spend)} (creator fees ${inr(tot.fee)}, Colatch fee ${inr(q.colatch)}, GST ${inr(q.gst)})`,
    `Value received: ${inr(received)}`,
    `  Saved vs creators' market rates: ${inr(tot.savedVsMarket)}`,
    `  Saved vs a ${base.agencyPct}% agency markup: ${inr(tot.savedVsAgency)}`,
    `  ${compact(tot.views)} views, worth ${inr(tot.adsEquivalent)} as paid ads`,
    `  Sales from creator codes: ${inr(tot.sales)}`,
    multiple ? `Return on Colatch: ${multiple.toFixed(1)}x` : "",
    "",
    `Full receipt: ${origin}/receipt/${token}`,
  ].join("\n");
  const mailto = `mailto:?subject=${encodeURIComponent(`Colatch value receipt: ${k.title}`)}&body=${encodeURIComponent(mailBody)}`;

  return (
    <PublicShell mode="client">
      <div className="pg-receipt">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="paper">
          <div className="head">
            <svg className="em"><use href="#emblem-foil" /></svg>
            <div className="ttl">Value receipt</div>
            <div className="sub">Every rupee you spent, and everything it bought you.</div>
          </div>

          <div className="meta mono">
            <span>Receipt</span><b>{receiptNo}</b>
            <span>Date</span><b>{today}</b>
            <span>Brand</span><b>{brand}</b>
            <span>Campaign</span><b>{k.title}</b>
            <span>Creators</span><b>{deals.length}</b>
          </div>

          {deals.length === 0 ? (
            <p className="foot-note">This receipt fills in as soon as your first creator is confirmed. Every fee, saving and view will show here line by line.</p>
          ) : (<>
            <div className="sect">What you spent</div>
            {deals.map((d) => <Line key={d.id} l={d.name || "@" + d.handle} sub={d.deliverable} v={inr(d.fee || 0)} />)}
            <Line l={`Colatch fee (${pct}%)`} v={inr(q.colatch)} />
            <Line l="GST on Colatch fee (18%)" v={inr(q.gst)} />
            <div className="rule" />
            <div className="tot mono"><span>Total spend</span><span>{inr(spend)}</span></div>

            <div className="sect">Value received</div>
            <Line l="Saved vs creators' market rates" sub="Each creator's own rate card, or the typical rate for their size" v={inr(tot.savedVsMarket)} />
            <Line l={`Saved vs a ${base.agencyPct}% agency markup`} sub={`Colatch charges ${pct}%`} v={inr(tot.savedVsAgency)} />
            <Line l={`${compact(tot.views)} views, valued as paid ads`} sub={`At ₹${base.cpm} per 1,000 views`} v={inr(tot.adsEquivalent)} />
            <Line l="Sales from creator codes and links" sub={clicks ? `${compact(clicks)} clicks${orders ? `, ${orders} orders` : ""}` : "Tracked links and discount codes"} v={inr(tot.sales)} />
            <div className="rule" />
            <div className="tot mono"><span>Total value received</span><span>{inr(received)}</span></div>
            {tot.rewards > 0 && <Line l="Paid in product, tickets or giveaways instead of cash" sub="At retail value, already inside your creator deals" v={inr(tot.rewards)} />}

            <div className="sect">Proof, not promises</div>
            <div className="proofs">
              <div><b className="mono">{live.length}/{deals.length}</b>posts checked live by Colatch</div>
              <div><b className="mono">{live.length ? Math.round((onTime / live.length) * 100) + "%" : "—"}</b>went live on or before the date</div>
              <div><b className="mono">{firstTime}</b>drafts approved first time</div>
              <div><b className="mono">{signed}</b>signed off by you{fiveStar ? `, ${fiveStar} rated 5★` : ""}</div>
            </div>

            <div className="grand">
              <div className="k">Return on Colatch</div>
              <div className="v mono">{multiple != null ? multiple.toFixed(1) + "×" : "—"}</div>
              <div className="s">{inr(received)} of value for {inr(spend)} spent</div>
            </div>
            <p className="foot-note">How we count: market rate is each creator's own rate card, or the typical rate for their follower size. The agency baseline is a {base.agencyPct}% markup (the usual range is 15 to 30%). Paid-ads value prices your views at ₹{base.cpm} per 1,000. Sales come only from your tracked Colatch codes and links. Nothing is counted twice.</p>
          </>)}
          <div className="thanks">Thank you for booking through Colatch</div>
        </div>

        <div className="bar noprint">
          <a className="btn-foil" href={mailto}>Forward to your CFO</a>
          <PrintButton />
          <a className="btn" href={`/shortlist/${token}`}>Back to your campaign</a>
        </div>
        {code && <div className="refer noprint">Give another brand ₹ credit, get 10% of our fee back for 12 months: <code>{origin}/r/{code}</code></div>}
      </div>
    </PublicShell>
  );
}
