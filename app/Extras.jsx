"use client";
// Brief input, review table, refinement, request form, compare, offline bar, recent briefs.
import { useEffect, useMemo, useRef, useState } from "react";
import { QUESTIONS, TIER_PRICE, safetyScore, IMG, initials } from "../lib/engine";
import { api, ago, clearHistory } from "./client";

const WA = "919764140627";
const LABELS = { category: "Category", budget: "Budget band", want: "Face type", age: "Core audience", goal: "Campaign goal", platform: "Platform", geo: "Reach", lang: "Language", risk: "Controversy risk", price: "Price position", arch: "Brand feeling", time: "Timeline" };
const OPTS = Object.fromEntries(QUESTIONS.map((q) => [q.k, q.o]));
const MAX = 4 * 1024 * 1024;
const BRIEF_SAMPLES = [
  "Brand: Atlas Athleisure. Launching a running shoe for Gen Z in metro cities, Instagram reels first. Budget ₹45 lakh. Bold is fine.",
  "Kesar Dairy wants a warm, trusted family face for a Navratri push in Gujarat, Gujarati and Hindi, TV + digital. Budget around ₹80 lakh. No controversy.",
  "Fintech app for first-time investors, 25–34, pan-India, YouTube and Instagram. Credible, not glamorous. ₹1.5 Cr for 12 months.",
];

function Face({ c }) {
  const [bad, setBad] = useState(!c?.ph);
  if (!c || bad) return <span className="mono" aria-hidden="true">{initials(c?.n || "?")}</span>;
  return <img src={IMG(c.ph)} alt="" loading="lazy" onError={() => setBad(true)} />;
}

/* ---------- landing: write or upload a brief ---------- */
export function BriefInput({ mode, readBrief, err, setErr }) {
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  function pickFile(f) {
    if (!f) return;
    const ok = /\.(pdf|docx|txt|md)$/i.test(f.name);
    if (!ok) { setErr("Upload a PDF, DOCX or TXT brief. For slides, export them as PDF."); return; }
    if (f.size > MAX) { setErr("That file is over 4 MB. Export a lighter PDF or paste the text."); return; }
    readBrief({ file: f });
  }
  if (mode === "file") {
    return (
      <div className="rise" style={{ "--i": 9 }}>
        <label className={"drop" + (drag ? " on" : "")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => pickFile(e.target.files?.[0])} />
          <b>Drop the client’s brief here</b>
          <span>PDF, DOCX or TXT · up to 4 MB · we read it, you check it before anything runs</span>
          <span className="btn btn-gold btn-sm" aria-hidden="true">Choose a file</span>
        </label>
        {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
        <p className="fine">Files are read once to fill the brief and are not stored.</p>
      </div>
    );
  }
  return (
    <div className="rise" style={{ "--i": 9 }}>
      <form className="bfield" onSubmit={(e) => { e.preventDefault(); if (text.trim().length < 12) { setErr("Add a little more — product, audience and budget help most."); return; } readBrief({ text }); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={6000} rows={4} aria-label="Describe the campaign"
          placeholder="e.g. Launching a vitamin C serum for women 22–35 in metro cities. Instagram first, TVC later. Budget ₹1.2 Cr. No controversy." />
        <div className="brow"><span>{text.length ? `${text.length} / 6000` : "Brand, product, audience, budget, platform"}</span>
          <button className="btn btn-gold btn-sm" type="submit">Read my brief <span className="arr">→</span></button></div>
      </form>
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="samples" style={{ marginTop: 12 }}>Try
        {BRIEF_SAMPLES.map((s, i) => <button key={i} className="chip" onClick={() => setText(s)}>{["Athleisure launch", "Dairy · Navratri", "Fintech · 12 months"][i]}</button>)}
      </div>
    </div>
  );
}

/* ---------- recent briefs (this browser only) ---------- */
export function Recent({ history, restore }) {
  const [h, setH] = useState(history);
  useEffect(() => setH(history), [history]);
  if (!h?.length) return null;
  return (
    <div className="recent rise" style={{ "--i": 10 }}>
      <span>Recent</span>
      {h.slice(0, 4).map((x) => (
        <button key={x.at} className="chip" onClick={() => restore(x)} title={(x.answers?.category || "") + " · " + (x.answers?.budget || "")}>{x.brand?.name}<span className="c">{ago(x.at)}</span></button>
      ))}
      <button className="link" onClick={() => { clearHistory(); setH([]); }}>Clear</button>
    </div>
  );
}

/* ---------- parse review ---------- */
export function Review({ review, onConfirm, onBack, onGuided }) {
  const [name, setName] = useState(review.name || "");
  const [summary, setSummary] = useState(review.summary || "");
  const [vals, setVals] = useState(() => Object.fromEntries(review.rows.map((r) => [r.k, r.value])));
  const missingReq = review.rows.filter((r) => r.required && !vals[r.k]);
  const found = review.rows.filter((r) => r.value).length;
  const picked = () => Object.fromEntries(Object.entries(vals).filter(([, v]) => v));
  return (
    <section className="review">
      <div className="rvhead">
        <div className="eyebrow rise">{review.file ? `${review.file}${review.pages ? ` · ${review.pages} page${review.pages > 1 ? "s" : ""}` : ""} · read` : "Your brief · read"}{review.ai ? " · AI" : ""}</div>
        <h2 className="rise" style={{ "--i": 1 }}>We read <span className="light">{found} of {review.rows.length}</span> fields.</h2>
        <p className="rise" style={{ "--i": 2 }}>Check them before we rank the roster. Change anything that’s off; blank fields simply don’t count towards the score.</p>
      </div>
      <div className="rvgrid rise" style={{ "--i": 3 }}>
        <div className="fld wide"><label htmlFor="rvName">Brand name</label><input id="rvName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your brand" maxLength={60} /></div>
        <div className="fld wide"><label htmlFor="rvSum">Summary</label><input id="rvSum" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={400} /></div>
      </div>
      <div className="rvtable rise" style={{ "--i": 4 }} role="table" aria-label="Fields read from the brief">
        <div className="rvr th" role="row"><span role="columnheader">Field</span><span role="columnheader">Value</span><span role="columnheader">Read as</span></div>
        {review.rows.map((r) => {
          const miss = !vals[r.k];
          const conf = vals[r.k] !== r.value ? "edited" : r.conf;
          return (
            <div key={r.k} className={"rvr" + (miss && r.required ? " req" : "")} role="row">
              <span role="cell">{LABELS[r.k]}{r.required && <em> · needed</em>}</span>
              <span role="cell">
                <select value={vals[r.k] || ""} onChange={(e) => setVals((v) => ({ ...v, [r.k]: e.target.value }))} aria-label={LABELS[r.k]}>
                  <option value="">{r.required ? "Not found — choose" : "Not in brief"}</option>
                  {OPTS[r.k].map((o) => <option key={o}>{o}</option>)}
                </select>
              </span>
              <span role="cell"><i className={"cf " + (miss ? "missing" : conf)}>{miss ? "missing" : conf}</i></span>
            </div>
          );
        })}
      </div>
      <div className="acts rise" style={{ "--i": 5 }}>
        <button className="btn btn-gold" disabled={missingReq.length > 0} onClick={() => onConfirm(name, summary, picked())}>
          {missingReq.length ? `Choose ${missingReq.map((r) => LABELS[r.k].toLowerCase()).join(" and ")} first` : <>Rank the roster <span className="arr">→</span></>}
        </button>
        <button className="link" onClick={() => onGuided(name, picked())}>Answer the guided questions instead</button>
        <button className="link" onClick={onBack}>Start over</button>
      </div>
    </section>
  );
}

/* ---------- results: what we understood + refine ---------- */
export function UnderstoodChips({ answers, onDrop, busy }) {
  const keys = QUESTIONS.map((q) => q.k).filter((k) => answers?.[k]);
  if (!keys.length) return null;
  return (
    <div className="understood" aria-label="Brief in use">
      <span className="lbl">Ranked on</span>
      {keys.map((k) => (
        <span className="uchip" key={k} title={LABELS[k]}>{answers[k].split(" (")[0]}
          {!["category"].includes(k) && <button onClick={() => onDrop(k)} disabled={busy} aria-label={`Remove ${LABELS[k]}`}>×</button>}
        </span>
      ))}
    </div>
  );
}
export function Refine({ refine, busy, answers }) {
  const [t, setT] = useState("");
  const [msg, setMsg] = useState(null);
  const sugg = useMemo(() => {
    const s = [];
    if (answers?.lang !== "South Indian") s.push("Only South Indian faces");
    if (answers?.risk?.startsWith("Very low") !== true) s.push("Safest faces only, no controversy");
    if (answers?.platform !== "Instagram / Reels") s.push("Mostly Instagram reels");
    if (answers?.age !== "Gen Z (18–24)") s.push("Younger, Gen Z audience");
    s.push("Budget under ₹60 lakh");
    return s.slice(0, 4);
  }, [answers]);
  async function go(text) { setMsg(null); const r = await refine(text); if (r) setMsg(r); if (r && !r.err) setT(""); }
  return (
    <div className="refine">
      <form onSubmit={(e) => { e.preventDefault(); go(t); }}>
        <input value={t} onChange={(e) => setT(e.target.value)} maxLength={300} placeholder="Refine in plain words — e.g. only Punjabi faces, budget ₹40 lakh" aria-label="Refine the brief" disabled={busy} />
        <button className="btn btn-plum btn-sm" type="submit" disabled={busy || !t.trim()}>{busy ? "Re-ranking…" : "Refine"}</button>
      </form>
      <div className="rsugg">{sugg.map((s) => <button key={s} className="chip" disabled={busy} onClick={() => go(s)}>{s}</button>)}</div>
      {msg && <div className={"rmsg" + (msg.err ? " err" : "")} role="status">{msg.msg}</div>}
    </div>
  );
}

/* ---------- availability & quote request ---------- */
const ENGAGE = ["Brand ambassador", "Campaign shoot", "Social posts only", "Event appearance", "Not sure yet"];
export function RequestForm({ request, brand, profile, hasBrief, onClose }) {
  const talent = request.talent;
  const [f, setF] = useState({
    engagement: "Campaign shoot", dates: "", term: "12 months", deliverables: "", territory: "India · digital", budget: hasBrief ? profile.budget.split(" (")[0] + " " + (profile.budget.match(/\((.*)\)/)?.[1] || "") : "",
    name: "", company: "", email: "", phone: "", notes: "", brand: brand?.name && brand.name !== "Your brand" ? brand.name : "", website2: "",
  });
  const [errs, setErrs] = useState({});
  const [state, setState] = useState({ busy: false, done: null, error: "" });
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, done: null, error: "" }); setErrs({});
    try {
      const j = await api("/api/request", { body: { ...f, talent: talent || "", category: hasBrief ? profile.category : "", shortlist: request.shortlist || [] }, retry: 0 });
      setState({ busy: false, done: j, error: "" });
    } catch (er) { setErrs(er.data?.errors || {}); setState({ busy: false, done: null, error: er.message }); }
  }
  const waText = state.done?.text || `Hi Colatch — ${talent ? `availability and a quote for ${talent}` : "please propose names"} for ${f.brand || "our brand"}.`;
  return (
    <>
      <div className="scrimall" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={talent ? `Request ${talent}` : "Ask Colatch to propose names"}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        {state.done ? (
          <div className="done">
            <div className="eyebrow">Request {state.done.ref}</div>
            <h3>{state.done.delivered ? "With the talent desk." : "Almost there."}</h3>
            <p>{state.done.delivered
              ? `The Colatch talent desk has it and replies within 3 working days${f.email ? " at " + f.email : ""}. Agent contacts stay with Colatch; no fee is charged for requests.`
              : "We couldn't log it automatically just now. Send the same details on WhatsApp and the desk picks it up from there."}</p>
            <div className="dacts">
              {!state.done.delivered && <a className="btn btn-gold" href={`https://wa.me/${WA}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer">Send on WhatsApp <span className="arr">→</span></a>}
              <button className="btn btn-line" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="eyebrow">{talent ? "Availability & quote" : "Talent desk"}</div>
            <h3>{talent ? <>Request <span className="light">{talent}</span></> : <>Let Colatch <span className="light">propose names</span></>}</h3>
            {request.shortlist?.length > 0 && <p className="fine">With your shortlist: {request.shortlist.join(", ")}</p>}
            <fieldset className="eng"><legend>Engagement</legend>
              {ENGAGE.map((x) => <label key={x}><input type="radio" name="eng" value={x} checked={f.engagement === x} onChange={set("engagement")} /><span>{x}</span></label>)}
            </fieldset>
            <div className="g2">
              <Field label="Preferred dates" v={f.dates} on={set("dates")} ph="e.g. Jan–Mar 2027" />
              <div className="fld"><label htmlFor="rqTerm">Term</label><select id="rqTerm" value={f.term} onChange={set("term")}>{["One-off", "3 months", "6 months", "12 months", "24 months"].map((x) => <option key={x}>{x}</option>)}</select></div>
              <Field label="Deliverables" v={f.deliverables} on={set("deliverables")} ph="e.g. 1 TVC shoot day, 4 IG posts, 1 event" wide />
              <Field label="Usage & territory" v={f.territory} on={set("territory")} ph="Digital + TV · India" />
              <Field label="Budget range" v={f.budget} on={set("budget")} ph="₹ 1.5–2 Cr" />
            </div>
            <div className="g2">
              <Field refEl={first} label="Your name" v={f.name} on={set("name")} err={errs.name} req />
              <Field label="Brand" v={f.brand} on={set("brand")} err={errs.brand} req />
              <Field label="Work email" type="email" v={f.email} on={set("email")} err={errs.email} req />
              <Field label="Phone (WhatsApp)" type="tel" v={f.phone} on={set("phone")} err={errs.phone} ph="+91 98…" />
              <Field label="Company / agency" v={f.company} on={set("company")} />
              <Field label="Anything else" v={f.notes} on={set("notes")} ph="Exclusivity, conflicts to avoid, launch date" />
            </div>
            <input className="hp" tabIndex={-1} autoComplete="off" value={f.website2} onChange={set("website2")} aria-hidden="true" />
            {state.error && <div className="err" role="alert">{state.error}</div>}
            <div className="dacts">
              <button className="btn btn-gold" disabled={state.busy}>{state.busy ? "Sending…" : <>Send to talent desk <span className="arr">→</span></>}</button>
              <span className="fine">Reply within 3 working days. No fee for requests.</span>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
function Field({ label, v, on, ph, err, req, type = "text", wide, refEl }) {
  const id = "rq" + label.replace(/\W/g, "");
  return (
    <div className={"fld" + (wide ? " wide" : "") + (err ? " bad" : "")}>
      <label htmlFor={id}>{label}{req ? " *" : ""}</label>
      <input ref={refEl} id={id} type={type} value={v} onChange={on} placeholder={ph} maxLength={300} aria-invalid={!!err} aria-describedby={err ? id + "e" : undefined} />
      {err && <small id={id + "e"}>{err}</small>}
    </div>
  );
}

/* ---------- compare up to 4 ---------- */
export function Compare({ names, byName, results, profile, hasBrief, brand, onClose, onOpen, toggleSL }) {
  const items = names.map((n) => results?.find((r) => r.c.n === n) || { c: byName[n], fit: null, conflict: false, notes: [], parts: null }).filter((r) => r.c);
  const tierN = { Starter: 0, Growth: 1, Scale: 2, Flagship: 3 };
  const rows = [
    hasBrief && ["Brand fit", (r) => r.fit, (r) => (r.fit ?? 0), "max", (v) => v + "%"],
    ["Brand-safety", (r) => safetyScore(r.c, profile), (r) => safetyScore(r.c, profile), "max", (v) => v + "/100"],
    ["Tier & band", (r) => r.c.tier + " · " + TIER_PRICE[r.c.tier].band, (r) => -tierN[r.c.tier], hasBrief ? null : null],
    ["Est. reach", (r) => TIER_PRICE[r.c.tier].reach, null, null],
    ["Recall lift", (r) => TIER_PRICE[r.c.tier].recall, null, null],
    ["Followers", (r) => (r.c.followers ? (r.c.followers / 1e6).toFixed(1) + "M" : "—"), (r) => r.c.followers || 0, "max"],
    ["Field", (r) => r.c.role, null, null],
    ["Audience", (r) => r.c.aud, null, null],
    hasBrief && ["Category conflict", (r) => (r.conflict ? "Known " + profile.category + " association" : "None on record"), (r) => (r.conflict ? 0 : 1), "max"],
  ].filter(Boolean);
  const best = (row) => { if (!row[2] || !row[3]) return null; const vals = items.map(row[2]); const m = Math.max(...vals); return vals.filter((v) => v === m).length === items.length ? null : m; };
  const rec = useMemo(() => {
    if (items.length < 2) return "";
    const clean = items.filter((r) => !r.conflict);
    const byFit = [...clean].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
    const bySafe = [...items].sort((a, b) => safetyScore(b.c, profile) - safetyScore(a.c, profile));
    const cheap = [...clean].sort((a, b) => tierN[a.c.tier] - tierN[b.c.tier])[0];
    const parts = [];
    if (hasBrief && byFit[0]) parts.push(`${byFit[0].c.n} is the strongest fit for ${brand?.name || "this brief"} at ${byFit[0].fit}%.`);
    if (bySafe[0] && bySafe[0] !== byFit[0]) parts.push(`${bySafe[0].c.n} is the safest pick on brand-safety.`);
    if (cheap && cheap !== byFit[0]) parts.push(`${cheap.c.n} sits in the lowest band here (${TIER_PRICE[cheap.c.tier].band}).`);
    const cf = items.filter((r) => r.conflict); if (cf.length) parts.push(`Check exclusivity on ${cf.map((r) => r.c.n).join(" and ")} before you commit.`);
    return parts.join(" ");
  }, [items, hasBrief, profile, brand]);
  return (
    <>
      <div className="scrimall" onClick={onClose} />
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="Compare faces">
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <div className="eyebrow">Compare · {items.length} faces</div>
        <h3>Side by side{hasBrief ? <> for <span className="light">{brand?.name}</span></> : null}</h3>
        <div className="cmpwrap">
          <table className="cmp">
            <thead><tr><th />{items.map((r) => (
              <th key={r.c.n}><button className="cmpface" onClick={() => onOpen(r)}><span className="ph"><Face c={r.c} /></span><b>{r.c.n}</b></button></th>
            ))}</tr></thead>
            <tbody>
              {rows.map((row) => { const b = best(row); return (
                <tr key={row[0]}><td className="rl">{row[0]}</td>{items.map((r) => {
                  const v = row[1](r); const isBest = b != null && row[2](r) === b;
                  return <td key={r.c.n} className={isBest ? "best" : ""}>{row[4] ? row[4](v) : v}</td>;
                })}</tr>
              ); })}
              <tr><td />{items.map((r) => <td key={r.c.n}><button className="link" onClick={() => toggleSL(r.c.n)}>Remove</button></td>)}</tr>
            </tbody>
          </table>
        </div>
        {rec && <p className="note">{rec}</p>}
        <p className="fine">Bands are indicative, all-in (talent + production + usage) and confirmed per campaign. Bold marks the best value in each row.</p>
      </div>
    </>
  );
}

/* ---------- offline banner ---------- */
export function OfflineBar() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const on = () => setOff(false), offf = () => setOff(true);
    setOff(typeof navigator !== "undefined" && navigator.onLine === false);
    window.addEventListener("online", on); window.addEventListener("offline", offf);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", offf); };
  }, []);
  if (!off) return null;
  return <div className="offline" role="status">You’re offline. Browsing still works; matching and requests resume when you reconnect.</div>;
}
