"use client";
// CPV comparison for up to three creators (was an inline script on the Astro page).
import { useState } from "react";
import ChartCard from "@/components/ui/ChartCard";
import HBars from "@/components/team/HBars";

const num = (v) => { v = String(v || "").toLowerCase().replace(/[,₹\s]/g, ""); const m = v.match(/^([\d.]+)(k|l|lakh|m|cr)?$/); if (!m) return 0; const x = parseFloat(m[1]); return x * ({ k: 1e3, l: 1e5, lakh: 1e5, m: 1e6, cr: 1e7 }[m[2]] || 1); };
const rs = (n, d) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d || 0 });
const blank = { name: "", fee: "", views: "", reels: "1", eng: "" };

export default function Calc() {
  const [cs, setCs] = useState([{ ...blank }, { ...blank }, { ...blank }]);
  const set = (i, k, v) => setCs((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const out = cs.map((c, i) => {
    const reels = num(c.reels) || 1, fee = num(c.fee), views = num(c.views) * reels, eng = num(c.eng) * reels;
    if (!fee || !views) return null;
    const cpv = fee / views;
    const t = cpv <= 0.25 ? ["good", "Great value"] : cpv <= 0.6 ? ["ok", "Fair"] : ["low", "Expensive for the reach"];
    return { i, n: c.name || `Creator ${i + 1}`, cpv, cpm: cpv * 1000, cpe: eng ? fee / eng : null, tv: views, t };
  });
  const res = out.filter(Boolean).sort((a, b) => a.cpv - b.cpv);
  return (
    <>
      <div className="ui-cols ui-cols--3">
        {cs.map((c, i) => (
          <div key={i} className="ui-card ui-card--paper ui-card--pad tr-calc">
            <h3 className="tr-cardh">Creator {i + 1}</h3>
            <div className="stack">
              <div className="fld"><label htmlFor={`cpv-name-${i}`}>Name <span className="opt">— optional</span></label><input id={`cpv-name-${i}`} value={c.name} onChange={(e) => set(i, "name", e.target.value)} placeholder={i === 0 ? "e.g. @priya.dances" : ""} /></div>
              <div className="fld"><label htmlFor={`cpv-fee-${i}`}>Fee ₹ (all deliverables)</label><input id={`cpv-fee-${i}`} value={c.fee} onChange={(e) => set(i, "fee", e.target.value)} inputMode="numeric" placeholder="e.g. 25,000" /></div>
              <div className="fld"><label htmlFor={`cpv-views-${i}`}>Avg views per reel</label><input id={`cpv-views-${i}`} value={c.views} onChange={(e) => set(i, "views", e.target.value)} inputMode="numeric" placeholder="e.g. 60,000" /></div>
              <div className="fld"><label htmlFor={`cpv-reels-${i}`}>Reels in the deal</label><input id={`cpv-reels-${i}`} value={c.reels} onChange={(e) => set(i, "reels", e.target.value)} inputMode="numeric" /></div>
              <div className="fld"><label htmlFor={`cpv-eng-${i}`}>Avg likes + comments <span className="opt">— optional</span></label><input id={`cpv-eng-${i}`} value={c.eng} onChange={(e) => set(i, "eng", e.target.value)} inputMode="numeric" placeholder="e.g. 3,200" /></div>
            </div>
            <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              {!out[i] ? <p className="hint" style={{ margin: 0 }}>{!num(c.fee) && !num(c.views) ? "Enter the fee and avg views to see CPV, CPM and total views." : !num(c.fee) ? "Enter the fee to see the results." : "Enter the avg views per reel to see the results."}</p> : <>
              <div className="spread"><span className="lbl">CPV</span><b style={{ fontSize: 24, fontWeight: 300 }}>{out[i] ? rs(out[i].cpv, 2) : "—"}</b></div>
              <div className="spread"><span className="lbl">CPM</span><b>{out[i] ? rs(out[i].cpm) : "—"}</b></div>
              <div className="spread"><span className="lbl">Cost per engagement</span><b>{out[i].cpe ? rs(out[i].cpe, 2) : <span className="hint">add likes + comments</span>}</b></div>
              <div className="spread"><span className="lbl">Total views</span><b>{out[i] ? Math.round(out[i].tv).toLocaleString("en-IN") : "—"}</b></div>
              <div style={{ marginTop: 10 }}><span className={`pill ${out[i].t[0]}`}>{out[i].t[1]}</span></div>
              </>}
            </div>
          </div>
        ))}
      </div>
      <div className="tr-gap">
        <ChartCard title="Cost per view, compared" period={res.length ? `${res.length} of 3 creators` : "Live"} figure={res.length ? rs(res[0].cpv, 2) : null} featured={res.length > 0}
          foot={res.length ? `Cheapest view: ${res[0].n}. Lower is better. CPV is the fee divided by total views.` : "Updates as you type. Nothing is saved."}>
          {res.length ? <HBars label="Cost per view by creator" best={res[0].i} rows={res.map((r) => ({ key: r.i, label: r.n, value: r.cpv, text: rs(r.cpv, 2), note: `CPM ${rs(r.cpm)} · ${Math.round(r.tv).toLocaleString("en-IN")} views` }))} />
            : <p className="hint" style={{ margin: 0 }}>Enter a fee and avg views for at least one creator to see the comparison.</p>}
        </ChartCard>
      </div>
      {res.length > 1 && <div className="note info tr-gap"><b>{res[0].n}</b> gives the cheapest view at {rs(res[0].cpv, 2)}, {Math.round((1 - res[0].cpv / res[res.length - 1].cpv) * 100)}% cheaper per view than {res[res.length - 1].n}. CPV here is the creator fee divided by views.</div>}
    </>
  );
}
