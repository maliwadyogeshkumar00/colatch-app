"use client";
// Live "what creators will see" card for the brief form. Reads the form's own fields as the brand types
// (no network, nothing stored). Budget and contact details are never shown: creators only see the brief.
import { useEffect, useState } from "react";

const SIZE = { nano: "1K–10K followers", micro: "10K–1L followers", mid: "1L–5L followers", macro: "5L+ followers" };
// Same idea as the server's contact scrub: phone numbers, emails and handles never reach creators.
const hide = (s) => String(s || "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[hidden]").replace(/(\+?\d[\d\s-]{8,}\d)/g, "[hidden]").replace(/(^|\s)@[a-z0-9._]{3,}/gi, "$1[hidden]");
const dayText = (v) => { const t = Date.parse(`${v}T00:00:00+05:30`); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : ""; };

function read(form) {
  const f = new FormData(form);
  const all = (k) => f.getAll(k).map(String).filter(Boolean);
  return {
    raw: String(f.get("raw") || ""), talent: all("talent"), cities: all("cities"), languages: all("languages"),
    size: String(f.get("size") || ""), count: String(f.get("count") || ""), when: String(f.get("when") || ""),
    mandatories: String(f.get("mandatories") || ""), rush: Boolean(f.get("rush")), featured: Boolean(f.get("featured")),
  };
}

export default function BriefPreview({ form, initial = {} }) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const el = document.getElementById(form);
    if (!el) return;
    const on = () => setV(read(el));
    on();
    el.addEventListener("input", on); el.addEventListener("change", on);
    return () => { el.removeEventListener("input", on); el.removeEventListener("change", on); };
  }, [form]);
  const raw = hide(v.raw || "").trim();
  const chips = [...(v.talent || []), ...(v.cities || []), ...(v.languages || []), v.size && SIZE[v.size]].filter(Boolean);
  const musts = String(v.mandatories || "").split(/\n+/).map((x) => hide(x).trim()).filter(Boolean).slice(0, 4);
  return (
    <div className="v2b-prev" aria-live="polite">
      <div className="v2b-prev__card">
        <div className="v2b-prev__top">
          <span className="v2b-prev__eb">{v.featured ? "Featured brief" : "New brief"}{v.rush ? " · Rush" : ""}</span>
          {v.count && <span className="v2b-prev__n">{v.count} {v.count === "1" ? "creator" : "creators"}</span>}
        </div>
        {raw ? <p className="v2b-prev__body">{raw.length > 320 ? raw.slice(0, 320).trimEnd() + "…" : raw}</p>
          : <p className="v2b-prev__body v2b-prev__empty">Start describing the campaign and it shows up here, the way matching creators will read it.</p>}
        {chips.length > 0 && <div className="v2b-prev__chips">{chips.slice(0, 10).map((c) => <span key={c} className="tag">{c}</span>)}{chips.length > 10 && <span className="hint">+{chips.length - 10}</span>}</div>}
        {musts.length > 0 && <ul className="v2b-prev__musts">{musts.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        {v.when && dayText(v.when) && <p className="v2b-prev__when">Goes live {dayText(v.when)}</p>}
      </div>
      <p className="hint v2b-prev__note">Creators see only this. Your budget, name, email and phone stay with the Colatch team, and contact details typed into the brief are hidden.</p>
    </div>
  );
}
