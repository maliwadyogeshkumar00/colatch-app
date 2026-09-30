"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  CATEGORIES, FIELDS, QUESTIONS, QUICK_AFTER, BUDGET_TIERS, TIER_PRICE, WANT_TO_TYPE, AGE_TO_AUD,
  buildProfile, rankAll, safetyScore, IMG, initials, domainToName,
} from "../lib/engine";

const WA = "919764140627";
const SAMPLES = ["atlas-athleisure.in", "mamaearth.in", "zerodha.com"];
const STEP_LABELS = ["Decode", "Brief", "DNA", "Matches"];
const STAGE_STEP = { land: -1, scan: 0, brief: 1, dna: 2, results: 3, browse: -1 };

/* ---------- small helpers ---------- */
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }
function useCountUp(target, dur = 900, run = true) {
  const [v, setV] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) { setV(target); return; }
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf, t0;
    const from = 0;
    const step = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); setV(Math.round(from + (target - from) * e)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur, run]);
  return v;
}
function Count({ to, dur, suffix = "" }) { const v = useCountUp(to, dur); return <>{v.toLocaleString("en-IN")}{suffix}</>; }

function Photo({ c, eager }) {
  const [ok, setOk] = useState(false);
  const [bad, setBad] = useState(!c.ph);
  if (bad) return <span className="mono" aria-hidden="true">{initials(c.n)}</span>;
  return (
    <img src={IMG(c.ph)} alt={c.n} loading={eager ? "eager" : "lazy"} decoding="async" className={ok ? "ok" : ""}
      ref={(el) => { if (el && el.complete && el.naturalWidth && !ok) setOk(true); }}
      onLoad={() => setOk(true)} onError={() => setBad(true)} />
  );
}

function Reveal({ as: Tag = "div", i = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  const [inv, setInv] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInv(true); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal ${inv ? "in" : ""} ${className}`} style={{ "--i": i }} {...rest}>{children}</Tag>;
}

function Words({ text, start = 0 }) {
  return text.split(" ").map((w, k) => <span key={k}><span className="w" style={{ "--i": start + k }}>{w}</span>{" "}</span>);
}

/* ================================================================= */
export default function Match({ roster, source, syncedAt }) {
  const [stage, setStage] = useState("land");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [brand, setBrand] = useState(null);
  const [decodeMeta, setDecodeMeta] = useState(null);
  const [answers, setAnswers] = useState({});
  const [qi, setQi] = useState(0);
  const [results, setResults] = useState(null);
  const [matchMeta, setMatchMeta] = useState(null);
  const [open, setOpen] = useState(null);
  const [shortlist, setShortlist] = useState([]);
  const total = roster.length;

  const go = useCallback((s) => { setStage(s); if (typeof window !== "undefined") window.scrollTo(0, 0); }, []);

  const profile = useMemo(() => buildProfile(brand || {}, answers), [brand, answers]);

  function start(u) {
    const v = (u ?? url).trim();
    if (!v || !v.includes(".")) { setErr("Enter your website, e.g. yourbrand.in"); return; }
    setErr(""); setUrl(v); setBrand(null); setDecodeMeta(null); setAnswers({}); setQi(0); setResults(null); setShortlist([]);
    go("scan");
  }

  async function reveal() {
    go("results"); setResults(null); setOpen(null);
    try {
      const r = await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile, brand }) });
      if (!r.ok) throw new Error("match " + r.status);
      const j = await r.json();
      setResults(j.results); setMatchMeta({ ai: j.ai?.used, total: j.total, source: j.rosterSource });
    } catch {
      setResults(rankAll(roster, profile).map((r) => ({ ...r, reason: null }))); setMatchMeta({ ai: false, total, source });
    }
  }

  const toggleSL = (n) => setShortlist((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const byName = useMemo(() => Object.fromEntries(roster.map((c) => [c.n, c])), [roster]);

  // Esc closes the dossier
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; }, [open]);

  const stepIdx = STAGE_STEP[stage];

  return (
    <>
      <div className="ground" /><div className="grain" />
      <div className="wrap">
        <nav className="nav">
          <button className="logo" onClick={() => go("land")} aria-label="Colatch — home">
            <img src="https://colatch.com/colatch-logo-white.svg" alt="Colatch" />
          </button>
          {stepIdx >= 0 && (
            <div className="steps" aria-label="Progress">
              {STEP_LABELS.map((l, i) => <span key={l} className={i === stepIdx ? "on" : i < stepIdx ? "done" : ""}>{String(i + 1).padStart(2, "0")} {l}</span>)}
            </div>
          )}
          <div className="navr">
            {stage !== "browse" && <button className="btn btn-line btn-sm nav-explore" onClick={() => { setOpen(null); go("browse"); }}>Explore the roster</button>}
            <a className="btn btn-line btn-sm nav-wa" href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer">Start a partnership</a>
          </div>
        </nav>

        {stage === "land" && <Landing {...{ roster, total, source, url, setUrl, start, err }} />}
        {stage === "scan" && <Scan {...{ url, total, roster, onDone: (dna, meta) => { setBrand(dna); setDecodeMeta(meta); setAnswers((a) => ({ ...a, category: dna.category !== "Other" ? dna.category : a.category })); setQi(dna.category && dna.category !== "Other" ? 1 : 0); go("brief"); } }} />}
        {stage === "brief" && brand && <Brief {...{ brand, decodeMeta, answers, setAnswers, qi, setQi, roster, profile, onFinish: () => go("dna") }} />}
        {stage === "dna" && brand && <Dna {...{ brand, decodeMeta, answers, setAnswers, roster, profile, onReveal: reveal, onEdit: () => go("brief") }} />}
        {(stage === "results" || stage === "browse") && (
          <Results key={stage} {...{ stage, brand, profile, results, matchMeta, roster, total, source, syncedAt, setOpen, shortlist, toggleSL, onBack: () => go(brand ? "dna" : "land"), onStart: () => go("land") }} />
        )}

        <footer className="foot">
          <span>© Colatch · Celebrity &amp; Brand Marketing · Mumbai · Delhi NCR · Bengaluru</span>
          <span>{total.toLocaleString("en-IN")} faces · {source === "live" ? "synced from colatch.com/talent" : "roster snapshot"}</span>
        </footer>
      </div>

      <ShortlistBar {...{ shortlist, byName, brand, toggleSL, hidden: !!open || !(stage === "results" || stage === "browse") }} />
      {open && <Dossier {...{ item: open, brand, profile, hasBrief: !!brand && stage === "results", shortlisted: shortlist.includes(open.c.n), toggleSL, onClose: () => setOpen(null) }} />}
    </>
  );
}

/* ================================================================= LANDING */
function Landing({ roster, total, source, url, setUrl, start, err }) {
  const cols = useMemo(() => {
    const pool = roster.filter((c) => c.ph && (c.star || c.tier === "Flagship" || c.tier === "Scale"));
    const rnd = seeded(11); const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const per = 8;
    return [0, 1, 2].map((k) => a.slice(k * per, k * per + per));
  }, [roster]);

  return (
    <>
      <section className="hero">
        <div className="hcopy">
          <div className="eyebrow rise" style={{ "--i": 0 }}>Celebrity &amp; Brand Marketing · India</div>
          <h1 className="words"><Words text="Find the face your brand" start={1} /><span className="w light" style={{ "--i": 6 }}>deserves.</span></h1>
          <p className="lead rise" style={{ "--i": 8 }}>
            Drop in your website. Colatch decodes your brand DNA, then ranks every face on our roster for fit, budget and
            competitor conflicts — so you walk into the first call with a shortlist, not a guess.
          </p>
          <form className="field rise" style={{ "--i": 9 }} onSubmit={(e) => { e.preventDefault(); start(); }}>
            <span className="pre">https://</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourbrand.in" aria-label="Your website" inputMode="url" autoComplete="url" />
            <button className="btn btn-gold" type="submit"><span>Decode<span className="long"> my brand</span></span><span className="arr">→</span></button>
          </form>
          {err && <div className="err">{err}</div>}
          <div className="samples rise" style={{ "--i": 10 }}>
            Try a sample
            {SAMPLES.map((s) => <button key={s} className="chip" onClick={() => start(s)}>{s}</button>)}
          </div>
          <div className="stats rise" style={{ "--i": 11 }}>
            <div><b><Count to={total} dur={1400} /></b><span>Faces on the roster</span></div>
            <div><b><Count to={500} dur={1400} suffix="+" /></b><span>Brands in India</span></div>
            <div><b>8</b><span>Fields · film to creators</span></div>
          </div>
          <span className="live rise" style={{ "--i": 12, alignSelf: "flex-start" }}><i />{source === "live" ? "Live roster · synced from colatch.com/talent" : "Roster snapshot · colatch.com/talent"}</span>
        </div>
        <div className="wall" aria-hidden="true">
          {cols.map((col, k) => (
            <div key={k} className={"col" + (k === 1 ? " down" : "")} style={{ "--t": `${[86, 104, 94][k]}s` }}>
              {[...col, ...col].map((c, i) => (
                <div className="tile" key={c.n + i}><Photo c={c} eager={i < 3} /><span className="nm">{c.n}<small>{c.role}</small></span></div>
              ))}
            </div>
          ))}
        </div>
      </section>
      <section className="how">
        {[["01", "Decode", "We read your website — category, tone, audience and price position — and draft your brand DNA."],
          ["02", "Brief", "Five quick questions on budget, audience and goal. Watch the leading faces change as you answer."],
          ["03", "Match", `Every one of the ${total} faces is ranked for fit and checked against known category associations.`]].map(([n, h, p], i) => (
          <Reveal key={n} i={i}><b>{n}</b><h3>{h}</h3><p>{p}</p></Reveal>
        ))}
      </section>
    </>
  );
}

/* ================================================================= SCAN */
function Scan({ url, total, roster, onDone }) {
  const name = domainToName(url);
  const [step, setStep] = useState(0);
  const [dna, setDna] = useState(null);
  const [meta, setMeta] = useState(null);
  const [tiles, setTiles] = useState(() => roster.filter((c) => c.ph).slice(0, 12));
  const [dim, setDim] = useState([]);
  const done = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/decode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) })
      .then((r) => r.json()).then((j) => { if (!alive) return; setDna(j.dna || { name, category: "Other", personality: [], signals: [], summary: "", source: "domain" }); setMeta({ ai: j.ai, readable: j.readable }); })
      .catch(() => { if (alive) { setDna({ name, category: "Other", archetype: "The Trusted Guide", personality: ["Credible", "Warm"], signals: [], summary: `We couldn't reach ${url}, so this starts from your answers.`, source: "domain" }); setMeta({ ai: false, readable: false }); } });
    return () => { alive = false; };
  }, [url]);

  // face shuffle
  useEffect(() => {
    const pool = roster.filter((c) => c.ph);
    const id = setInterval(() => setTiles((t) => { const n = [...t]; n[Math.floor(Math.random() * n.length)] = pool[Math.floor(Math.random() * pool.length)]; return n; }), 260);
    return () => clearInterval(id);
  }, [roster]);

  // step clock — waits on the decode before passing step 3
  useEffect(() => {
    if (step >= 6) return;
    if (step >= 1 && step <= 3 && !dna) return; // hold until the decode lands
    const id = setTimeout(() => setStep((s) => s + 1), step === 0 ? 700 : 620);
    return () => clearTimeout(id);
  }, [step, dna]);

  useEffect(() => { if (step === 5) setDim([1, 2, 4, 6, 7, 9, 10, 11]); }, [step]);
  useEffect(() => { if (step >= 6 && dna && !done.current) { done.current = true; setTimeout(() => onDone(dna, meta), 450); } }, [step, dna, meta, onDone]);

  const items = [
    ["Reading " + url.replace(/^https?:\/\//, ""), meta ? (meta.readable ? "Site read" : "Limited content") : ""],
    ["Tone & archetype", dna?.archetype || ""],
    ["Audience & price position", dna ? [dna.audience, dna.priceTier].filter(Boolean).join(" · ") : ""],
    ["Category", dna?.category === "Other" ? "Ask in brief" : dna?.category || ""],
    [`Scanning ${total} faces`, "Ranked"],
    ["Competitor conflict check", "Cross-checked"],
  ];
  const narrowed = useCountUp(step >= 5 ? 24 : total, 900, step >= 5);

  return (
    <section className="scan">
      <div className="left">
        <div className="eyebrow rise">Decoding{meta?.ai ? " · AI" : ""}</div>
        <h2 className="rise" style={{ "--i": 1 }}>Reading <span className="light">{dna?.name || name}</span></h2>
        <ul className="checks rise" style={{ "--i": 2 }}>
          {items.map(([l, v], i) => (
            <li key={i} className={i < step ? "done" : i === step ? "active" : ""}>
              <span className="st">{i < step ? "✓" : ""}</span>{l}<span className="v">{v}</span>
            </li>
          ))}
        </ul>
        <div className="bigcount rise" style={{ "--i": 3 }}><b>{step >= 5 ? narrowed : total}</b>{step >= 5 ? "faces in the first cut" : "faces on the roster"}</div>
      </div>
      <div className="scangrid" aria-hidden="true">
        {tiles.map((c, i) => <div key={i} className={"tile" + (dim.includes(i) ? " dim" : "")}><Photo c={c} eager /></div>)}
        <span className="beam" />
      </div>
    </section>
  );
}

/* ================================================================= BRIEF */
function Brief({ brand, decodeMeta, answers, setAnswers, qi, setQi, roster, profile, onFinish }) {
  const q = QUESTIONS[qi];
  const [leaving, setLeaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const answered = Object.keys(answers).filter((k) => QUESTIONS.some((x) => x.k === k)).length;

  const ranked = useMemo(() => rankAll(roster, profile), [roster, profile]);
  const top3 = ranked.filter((r) => !r.conflict && r.c.ph).slice(0, 3);
  const inPlay = ranked.filter((r) => r.fit >= 70 && !r.conflict).length;
  const inPlayN = useCountUp(inPlay, 500);

  const choose = useCallback((v) => {
    if (leaving) return;
    setFlash(v);
    setAnswers((a) => ({ ...a, [q.k]: v }));
    setTimeout(() => setLeaving(true), 160);
    setTimeout(() => {
      setLeaving(false); setFlash(null);
      if (qi < QUESTIONS.length - 1) setQi(qi + 1); else onFinish();
    }, 380);
  }, [leaving, q.k, qi, setAnswers, setQi, onFinish]);

  useEffect(() => {
    const k = (e) => {
      if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= q.o.length) { e.preventDefault(); choose(q.o[n - 1]); }
      else if ((e.key === "Backspace" || e.key === "ArrowLeft") && qi > 0) { e.preventDefault(); setQi(qi - 1); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [q, qi, choose, setQi]);

  const chips = [
    brand.archetype, ...(brand.personality || []).slice(0, 2),
    answers.category, answers.budget?.split(" (")[0], answers.want, answers.age?.split(" (")[0], answers.goal, answers.platform, answers.geo, answers.lang,
  ].filter(Boolean);

  return (
    <section className="brief">
      <div className="qside">
        <div className="segs" aria-hidden="true">{QUESTIONS.map((x, i) => <i key={x.k} className={answers[x.k] && i !== qi ? "f" : i === qi ? "cur" : ""} />)}</div>
        <div className={leaving ? "qexit" : ""} key={qi}>
          <div className="qnum rise">Question {qi + 1} of {QUESTIONS.length} <kbd>press 1–{q.o.length}</kbd></div>
          <div className="qtitle rise" style={{ "--i": 1 }}>{q.q}</div>
          <div className={"opts" + (q.o.length <= 3 ? " one" : "")}>
            {q.o.map((op, i) => (
              <button key={op} className={"opt rise" + (answers[q.k] === op ? " sel" : "") + (flash === op ? " pick" : "")} style={{ "--i": 2 + i * 0.6 }} onClick={() => choose(op)}>
                <span className="k">{i + 1}</span>{op}
              </button>
            ))}
          </div>
        </div>
        <div className="qfoot">
          {qi > 0 && <button className="link" onClick={() => setQi(qi - 1)}>← Back</button>}
          {answered >= QUICK_AFTER && <button className="btn btn-plum btn-sm rise" onClick={onFinish}>See my matches now <span className="arr">→</span></button>}
          {answered < QUICK_AFTER && <span className="link" style={{ textDecoration: "none", color: "var(--plum-400)" }}>{QUICK_AFTER - answered} more to unlock matches</span>}
        </div>
      </div>

      <aside className="panel rise" style={{ "--i": 2 }}>
        <div>
          <h4>Live read</h4>
          <div className="bn">{brand.name}</div>
          <div className="src">{brand.source === "ai" ? "AI-decoded from your website" : brand.source === "signals" ? "Read from your website's signals" : "From your domain — answers lead"}</div>
        </div>
        <div className="dna">{chips.map((c, i) => <span key={c + i}>{c}</span>)}</div>
        <div>
          <h4 style={{ marginBottom: 12 }}>Leading faces right now</h4>
          <div className="lead3">
            {top3.map((r) => <div className="tile" key={r.c.n}><Photo c={r.c} eager /><span className="nm">{r.c.n.split(" ")[0]}</span></div>)}
          </div>
        </div>
        <div className="inplay"><span>Strong fits in play</span><b>{inPlayN}</b></div>
      </aside>
    </section>
  );
}

/* ================================================================= DNA */
function Dna({ brand, decodeMeta, answers, setAnswers, roster, profile, onReveal, onEdit }) {
  const set = (k) => (e) => setAnswers((a) => ({ ...a, [k]: e.target.value }));
  const top = useMemo(() => rankAll(roster, profile).filter((r) => !r.conflict).slice(0, 20), [roster, profile]);
  const mix = ["trust", "youth", "glam", "credible", "mass"].map((t) => [t, Math.round((top.filter((r) => r.c.types.includes(t)).length / Math.max(1, top.length)) * 100)]);
  const label = { trust: "Trust", youth: "Youth", glam: "Glamour", credible: "Credibility", mass: "Mass reach" };

  const Sel = ({ k, label: l, opts, wide }) => (
    <div className={"fld" + (wide ? " wide" : "")}><label>{l}</label>
      <select value={answers[k] || ""} onChange={set(k)}>
        {!answers[k] && <option value="">Not set</option>}
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <section className="report">
      <div className="head">
        <div className="eyebrow rise">Your brand DNA · editable</div>
        <h2 className="rise" style={{ "--i": 1 }}>{brand.name}</h2>
        <span className="badge rise" style={{ "--i": 2 }}>{brand.source === "ai" ? "AI-decoded" : brand.source === "signals" ? "Signal-read" : "Domain only"} · {profile.category}</span>
        <p className="summ rise" style={{ "--i": 3 }}>{brand.summary}</p>
      </div>
      <aside className="archcard rise" style={{ "--i": 3 }}>
        <small>Archetype</small>
        <div className="arch">{brand.archetype || "The Trusted Guide"}</div>
        <small style={{ marginTop: 8 }}>Face-type mix · your top 20</small>
        <div className="bars">
          {mix.map(([t, v], i) => <div className="bar" key={t}><span>{label[t]}</span><i style={{ "--v": v / 100, "--i": i }} /><em>{v}</em></div>)}
        </div>
      </aside>
      <div className="fields rise" style={{ "--i": 4 }}>
        <Sel k="category" label="Category" opts={CATEGORIES} />
        <Sel k="budget" label="Budget band" opts={Object.keys(BUDGET_TIERS)} />
        <Sel k="want" label="Face type" opts={Object.keys(WANT_TO_TYPE)} />
        <Sel k="age" label="Core audience" opts={Object.keys(AGE_TO_AUD)} />
        <Sel k="goal" label="Campaign goal" opts={QUESTIONS.find((q) => q.k === "goal").o} />
        <Sel k="platform" label="Platform" opts={QUESTIONS.find((q) => q.k === "platform").o} />
        <Sel k="lang" label="Language" opts={QUESTIONS.find((q) => q.k === "lang").o} />
        <Sel k="risk" label="Controversy risk" opts={QUESTIONS.find((q) => q.k === "risk").o} />
      </div>
      <div className="acts rise" style={{ "--i": 5 }}>
        <button className="btn btn-gold" onClick={onReveal}>Reveal my celebrity matches <span className="arr">→</span></button>
        <button className="link" onClick={onEdit}>Back to the questions</button>
      </div>
    </section>
  );
}

/* ================================================================= RESULTS / BROWSE */
function Results({ stage, brand, profile, results, matchMeta, roster, total, source, syncedAt, setOpen, shortlist, toggleSL, onBack, onStart }) {
  const browse = stage === "browse";
  const [field, setField] = useState("all");
  const [hide, setHide] = useState(false);
  const [qtext, setQtext] = useState("");
  const [shown, setShown] = useState(24);

  const base = useMemo(() => {
    if (!browse) return results || [];
    return [...roster].sort((a, b) => b.star - a.star || ({ Flagship: 3, Scale: 2, Growth: 1, Starter: 0 }[b.tier] - { Flagship: 3, Scale: 2, Growth: 1, Starter: 0 }[a.tier]) || a.n.localeCompare(b.n))
      .map((c) => ({ c, fit: null, conflict: false, notes: [], reason: null }));
  }, [browse, results, roster]);

  const counts = useMemo(() => base.reduce((m, r) => ((m[r.c.cat] = (m[r.c.cat] || 0) + 1), m), { all: base.length }), [base]);
  const list = useMemo(() => {
    const q = qtext.trim().toLowerCase();
    return base.filter((r) => (field === "all" || r.c.cat === field) && (!hide || !r.conflict) && (!q || (r.c.n + " " + r.c.role + " " + r.c.tags.join(" ")).toLowerCase().includes(q)));
  }, [base, field, hide, qtext]);
  useEffect(() => setShown(24), [field, hide, qtext]);

  const podium = !browse && !qtext ? list.slice(0, 3) : [];
  const rest = list.slice(podium.length, podium.length + shown);
  const conflicts = base.filter((r) => r.conflict).length;

  if (!browse && !results) {
    return (
      <section className="results">
        <div className="rhead"><div><div className="eyebrow rise">Ranking {total} faces</div><h2 className="rise" style={{ "--i": 1 }}>Finding faces for <span className="light">{brand?.name}</span>…</h2></div></div>
        <div className="podium" style={{ marginTop: 40 }}>{[0, 1, 2].map((i) => <div key={i} className="card" style={{ opacity: 0.4, animation: `pulse 1.6s ${i * 0.2}s infinite` }}><div className="ph" /></div>)}</div>
      </section>
    );
  }

  return (
    <section className="results">
      <div className="rhead">
        <div>
          <div className="eyebrow rise">{browse ? `The Colatch roster · ${source === "live" ? "live from colatch.com" : "snapshot"}` : `Fit-led shortlist · conflict-checked${matchMeta?.ai ? " · AI-reviewed" : ""}`}</div>
          <h2 className="rise" style={{ "--i": 1 }}>{browse ? <>Every face, <span className="light">one roster.</span></> : <>Faces for <span className="light">{brand?.name}</span></>}</h2>
          <p className="rise" style={{ "--i": 2 }}>
            {browse
              ? `${total} celebrities, athletes, musicians and creators — the same list as colatch.com/talent. Decode your brand to rank them for fit.`
              : `All ${matchMeta?.total || total} faces ranked for ${profile.category.toLowerCase()} · ${profile.wantLabel.toLowerCase()} · ${profile.budget.split(" (")[0].toLowerCase()} budget.${conflicts ? ` ${conflicts} carry a known ${profile.category} association and are flagged.` : ""}`}
          </p>
        </div>
        <div className="rise" style={{ "--i": 3, display: "flex", gap: 8 }}>
          {browse ? <button className="btn btn-plum" onClick={onStart}>Decode my brand <span className="arr">→</span></button>
                  : <button className="btn btn-line btn-sm" onClick={onBack}>← Adjust brief</button>}
        </div>
      </div>

      <div className="tools">
        {FIELDS.filter(([k]) => k === "all" || counts[k]).map(([k, l]) => (
          <button key={k} className={"chip" + (field === k ? " on" : "")} onClick={() => setField(k)}>{l}<span className="c">{counts[k] || 0}</span></button>
        ))}
        {!browse && conflicts > 0 && <button className={"toggle" + (hide ? " on" : "")} onClick={() => setHide(!hide)} aria-pressed={hide}><i />Hide conflicts</button>}
        <label className="search"><span aria-hidden="true" style={{ color: "var(--plum-400)" }}>⌕</span><input value={qtext} onChange={(e) => setQtext(e.target.value)} placeholder="Search name, sport, language…" aria-label="Search the roster" /></label>
      </div>

      {podium.length > 0 && (
        <div className="podium">
          {podium.map((r, i) => <Card key={r.c.n} r={r} i={i} rank={i + 1} big category={profile.category} {...{ setOpen, shortlist, toggleSL }} />)}
        </div>
      )}

      {rest.length > 0 && (
        <>
          {podium.length > 0 && <div className="sub"><h3>More strong fits</h3><span>{list.length - 3} more ranked</span></div>}
          <div className="grid" style={podium.length ? {} : { marginTop: 8 }}>
            {rest.map((r, i) => <Card key={r.c.n} r={r} i={i % 24} rank={podium.length + i + 1} browse={browse} category={profile.category} {...{ setOpen, shortlist, toggleSL }} />)}
          </div>
        </>
      )}
      {!list.length && <div className="empty">No faces match that filter. <button className="link" onClick={() => { setField("all"); setQtext(""); setHide(false); }}>Clear filters</button></div>}
      {list.length > podium.length + shown && <div className="more"><button className="btn btn-line" onClick={() => setShown((s) => s + 24)}>Show 24 more · {list.length - podium.length - shown} left</button></div>}
    </section>
  );
}

function Card({ r, i, rank, big, browse, category, setOpen, shortlist, toggleSL }) {
  const { c, fit, conflict, reason } = r;
  const on = shortlist.includes(c.n);
  return (
    <div className={"card rise" + (conflict ? " conflict" : "")} style={{ "--i": i }} role="button" tabIndex={0}
      onClick={() => setOpen(r)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(r))} aria-label={`${c.n} — open dossier`}>
      <div className="ph"><Photo c={c} eager={big} /><span className="scrim" /></div>
      {!browse && <span className="rank">{String(rank).padStart(2, "0")}</span>}
      <button className={"addsl" + (on ? " on" : "")} onClick={(e) => { e.stopPropagation(); toggleSL(c.n); }} aria-pressed={on}>{on ? "✓ Shortlisted" : "+ Shortlist"}</button>
      <div className="body">
        <div className="nm">{c.n}</div>
        <div className="rl">{c.role} · {c.tier} · {TIER_PRICE[c.tier].band}</div>
        {fit != null && <div className="fit"><i style={{ "--v": fit / 100, "--i": i }} /><b>{fit}%</b></div>}
        {big && reason && <div className="why">{reason}</div>}
        {conflict && <div className="meta"><span className="warn">⚠ Known {category} association</span></div>}
      </div>
    </div>
  );
}

/* ================================================================= DOSSIER */
function Dossier({ item, brand, profile, hasBrief, shortlisted, toggleSL, onClose }) {
  const { c, fit, conflict, notes, reason } = item;
  const tp = TIER_PRICE[c.tier];
  const first = c.n.split(" ")[0];
  const safety = safetyScore(c, profile);
  const fitN = useCountUp(fit || 0, 900, fit != null);
  const safeN = useCountUp(safety, 900);
  const msg = hasBrief ? `Hi Colatch — we'd like to explore ${c.n} for ${brand.name} (${profile.category}, ${profile.budget.split(" (")[0]} budget).` : `Hi Colatch — we'd like to know more about booking ${c.n}.`;
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  return (
    <>
      <div className="scrimall" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${c.n} dossier`}>
        <div className="dph">
          {c.ph ? <img src={IMG(c.ph)} alt={c.n} /> : <span className="mono">{initials(c.n)}</span>}
          <span className="scrim" />
          <button className="x" onClick={onClose} ref={closeRef} aria-label="Close">×</button>
        </div>
        <div className="dbody">
          <div className="eyebrow rise">{hasBrief ? "Match dossier" : "Talent profile"}</div>
          <h3 className="rise" style={{ "--i": 1 }}>{hasBrief ? <>{c.n} <span style={{ fontWeight: 300 }}>×</span> {brand.name}</> : c.n}<small>{c.role} · {c.field} · {c.tier} tier</small></h3>
          <div className="dstats rise" style={{ "--i": 2 }}>
            {hasBrief && <div><b>{fitN}%</b><span>Brand fit</span></div>}
            <div><b>{safeN}/100</b><span>Brand-safety</span></div>
            <div><b>{tp.band}</b><span>Indicative band</span></div>
            <div><b>{tp.reach}</b><span>Est. reach</span></div>
            {!hasBrief && <div><b>{tp.recall}</b><span>Recall lift</span></div>}
          </div>
          {reason && <p className="note rise" style={{ "--i": 3 }}>{reason}</p>}
          {hasBrief && (
            <p className={"note rise" + (conflict ? " warn" : "")} style={{ "--i": 4 }}>
              {conflict
                ? `Heads up — ${first} already has a known ${profile.category} association, so a competitor may effectively own this face. We'd verify exclusivity before you commit.`
                : `No known ${profile.category} association on record for ${first}, so the equity should work for you. Exclusivity is confirmed with talent-side before contract.`}
            </p>
          )}
          <p className="rise" style={{ "--i": 5, fontSize: 13, color: "var(--plum-300)" }}>
            Band is indicative, all-in (talent + production + usage) and confirmed per campaign. {c.followers ? `${(c.followers / 1e6).toFixed(1)}M followers. ` : ""}
            {notes?.length ? "Why it ranks: " + notes.join(", ") + "." : ""}
          </p>
          <div className="meta rise" style={{ "--i": 6 }}>{c.tags.map((t) => <span key={t} style={{ background: "rgba(216,204,221,.08)" }}>{t}</span>)}</div>
          <div className="dacts rise" style={{ "--i": 7 }}>
            <a className="btn btn-gold" href={`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Request {first} on WhatsApp <span className="arr">→</span></a>
            <button className="btn btn-line" onClick={() => toggleSL(c.n)}>{shortlisted ? "✓ Shortlisted" : "+ Add to shortlist"}</button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ================================================================= SHORTLIST */
function ShortlistBar({ shortlist, byName, brand, toggleSL, hidden }) {
  const show = shortlist.length > 0 && !hidden;
  const msg = `Hi Colatch — ${brand ? `for ${brand.name}, ` : ""}we'd like to explore this shortlist:\n` + shortlist.map((n, i) => `${i + 1}. ${n}`).join("\n");
  return (
    <div className={"slbar" + (show ? " show" : "")} aria-hidden={!show}>
      <div className="av">{shortlist.slice(0, 5).map((n) => { const c = byName[n]; return <span key={n} title={n}>{c?.ph ? <img src={IMG(c.ph)} alt="" /> : initials(n)}</span>; })}</div>
      <span className="t">{shortlist.length} in your shortlist</span>
      <button className="link" onClick={() => shortlist.forEach((n) => toggleSL(n))} tabIndex={show ? 0 : -1}>Clear</button>
      <a className="btn btn-gold btn-sm" href={`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" tabIndex={show ? 0 : -1}>Send to Colatch <span className="arr">→</span></a>
    </div>
  );
}
