"use client";
// CPV comparison for up to three creators (was an inline script on the Astro page).
import { useState } from "react";

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
    return { n: c.name || `Creator ${i + 1}`, cpv, cpm: cpv * 1000, cpe: eng ? fee / eng : null, tv: views, t };
  });
  const res = out.filter(Boolean).sort((a, b) => a.cpv - b.cpv);
  return (
    <>
      <div className="grid3">
        {cs.map((c, i) => (
          <div key={i} className="panel pad">
            <h2>Creator {i + 1}</h2>
            <div className="stack">
              <div className="fld"><label>Name <span className="opt">— optional</span></label><input value={c.name} onChange={(e) => set(i, "name", e.target.value)} placeholder={i === 0 ? "@priya.dances" : ""} /></div>
              <div className="fld"><label>Fee ₹ (all deliverables)</label><input value={c.fee} onChange={(e) => set(i, "fee", e.target.value)} inputMode="numeric" placeholder="25000" /></div>
              <div className="fld"><label>Avg views per reel</label><input value={c.views} onChange={(e) => set(i, "views", e.target.value)} inputMode="numeric" placeholder="60000" /></div>
              <div className="fld"><label>Reels in the deal</label><input value={c.reels} onChange={(e) => set(i, "reels", e.target.value)} inputMode="numeric" /></div>
              <div className="fld"><label>Avg likes + comments <span className="opt">— optional</span></label><input value={c.eng} onChange={(e) => set(i, "eng", e.target.value)} inputMode="numeric" placeholder="3200" /></div>
            </div>
            <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <div className="spread"><span className="lbl">CPV</span><b style={{ fontSize: 24, fontWeight: 300 }}>{out[i] ? rs(out[i].cpv, 2) : "—"}</b></div>
              <div className="spread"><span className="lbl">CPM</span><b>{out[i] ? rs(out[i].cpm) : "—"}</b></div>
              <div className="spread"><span className="lbl">Cost per engagement</span><b>{out[i]?.cpe ? rs(out[i].cpe, 2) : "—"}</b></div>
              <div className="spread"><span className="lbl">Total views</span><b>{out[i] ? Math.round(out[i].tv).toLocaleString("en-IN") : "—"}</b></div>
              {out[i] && <div style={{ marginTop: 10 }}><span className={`pill ${out[i].t[0]}`}>{out[i].t[1]}</span></div>}
            </div>
          </div>
        ))}
      </div>
      {res.length > 1 && <div className="note info sec"><b>{res[0].n}</b> gives the cheapest view at {rs(res[0].cpv, 2)}, {Math.round((res[res.length - 1].cpv / res[0].cpv - 1) * 100)}% cheaper than {res[res.length - 1].n}.</div>}
    </>
  );
}
