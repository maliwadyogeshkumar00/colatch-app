"use client";
import { useState, useEffect, useRef } from "react";

/* ---------------- DATA ---------------- */

const CATEGORIES = [
  "Beauty & Skincare", "Fashion & Apparel", "Food & Beverage", "Fintech & BFSI",
  "D2C / E-commerce", "Health & Wellness", "Auto & EV", "Real Estate",
  "Tech / SaaS", "Jewellery & Luxury", "Education", "Other",
];

// Real Colatch roster (public names) + fields used for fit scoring & conflict check.
// "owns" = categories the celebrity is already associated with (competitor-conflict signal).
const ROSTER = [
  { n: "Shahid Kapoor",     f: "Film",       vibe: "Premium urban",     tier: "Flagship", aud: "Premium",  types: ["premium","credible","youth"],   owns: ["Auto & EV","Fashion & Apparel"] },
  { n: "Kriti Sanon",       f: "Film",       vibe: "Lifestyle radiance", tier: "Scale",    aud: "Lifestyle",types: ["glam","youth","lifestyle"],     owns: ["Beauty & Skincare","Fashion & Apparel"] },
  { n: "KL Rahul",          f: "Cricket",    vibe: "Youth energy",      tier: "Scale",    aud: "Youth",    types: ["youth","mass","credible"],       owns: ["Fintech & BFSI","D2C / E-commerce"] },
  { n: "Sonu Sood",         f: "Film",       vibe: "Mass trust",        tier: "Scale",    aud: "Mass",     types: ["trust","mass","credible"],       owns: ["Education","Health & Wellness"] },
  { n: "Neha Dhupia",       f: "Film",       vibe: "Family warmth",     tier: "Growth",   aud: "Family",   types: ["trust","lifestyle"],             owns: ["Health & Wellness"] },
  { n: "Malaika Arora",     f: "Lifestyle",  vibe: "Glamour icon",      tier: "Scale",    aud: "Lifestyle",types: ["glam","premium","lifestyle"],    owns: ["Fashion & Apparel","Beauty & Skincare"] },
  { n: "Saina Nehwal",      f: "Badminton",  vibe: "Discipline & grit", tier: "Growth",   aud: "Family",   types: ["credible","trust"],              owns: ["Health & Wellness"] },
  { n: "Paresh Rawal",      f: "Film",       vibe: "Veteran credibility",tier: "Growth",  aud: "Family",   types: ["trust","credible"],              owns: ["Health & Wellness"] },
  { n: "Jaya Kishori",      f: "Culture",    vibe: "Values & trust",    tier: "Growth",   aud: "Mass",     types: ["trust","credible"],              owns: [] },
  { n: "Shriya Saran",      f: "Film",       vibe: "Pan-India appeal",  tier: "Growth",   aud: "Mass",     types: ["lifestyle","glam"],              owns: ["Jewellery & Luxury"] },
  { n: "Sharman Joshi",     f: "Film",       vibe: "Relatable youth",   tier: "Starter",  aud: "Youth",    types: ["youth","credible"],              owns: [] },
  { n: "Adah Sharma",       f: "Film / OTT", vibe: "Bold & digital",    tier: "Growth",   aud: "Youth",    types: ["youth","glam"],                  owns: ["D2C / E-commerce"] },
  { n: "Mouni Roy",         f: "TV / Film",  vibe: "Aspirational glam",  tier: "Growth",   aud: "Lifestyle",types: ["glam","lifestyle"],             owns: ["Beauty & Skincare"] },
  { n: "Rannvijay Singha",  f: "Creator",    vibe: "Wellness & travel", tier: "Starter",  aud: "Youth",    types: ["youth","credible","mass"],       owns: ["Health & Wellness"] },
  { n: "Gulshan Grover",    f: "Film",       vibe: "Iconic character",  tier: "Starter",  aud: "Mass",     types: ["mass","credible"],               owns: [] },
  { n: "Sonu Nigam",        f: "Music",      vibe: "Timeless voice",    tier: "Growth",   aud: "Family",   types: ["trust","mass"],                  owns: ["Education"] },
];

const TIER_PRICE = {
  Starter:  { band: "₹8–25 L",     reach: "20–40M",  recall: "+15–25%" },
  Growth:   { band: "₹25–60 L",    reach: "60–90M",  recall: "+30–45%" },
  Scale:    { band: "₹60L–1.2 Cr", reach: "90–160M", recall: "+40–55%" },
  Flagship: { band: "₹1.2 Cr+",    reach: "150M+",   recall: "+50%+" },
};

const BUDGET_TIERS = {
  "Starter (₹8–25 L)":  ["Starter", "Growth"],
  "Growth (₹25–60 L)":  ["Growth", "Scale", "Starter"],
  "Scale (₹60L–1.2 Cr)":["Scale", "Flagship", "Growth"],
  "Flagship (₹1.2 Cr+)":["Flagship", "Scale"],
};

// 20-question confirmation flow. Each maps into the brand profile used for matching.
const QUESTIONS = [
  { k: "category", q: "What category is the brand in?", o: CATEGORIES },
  { k: "model", q: "What's the business model?", o: ["D2C / online-first", "Retail / offline", "Marketplace", "Service / B2B"] },
  { k: "age", q: "Who's the core audience?", o: ["Gen Z (18–24)", "Young adults (25–34)", "Families (35–50)", "All ages / mass"] },
  { k: "gender", q: "Audience skew?", o: ["Mostly women", "Mostly men", "Balanced"] },
  { k: "geo", q: "Where do you need reach?", o: ["Metro cities", "Tier 2 & 3", "Pan-India", "Regional focus"] },
  { k: "price", q: "Where do you sit on price?", o: ["Value / mass", "Mid-market", "Premium", "Luxury"] },
  { k: "arch", q: "Which brand feeling fits best?", o: ["Trustworthy & dependable", "Bold & aspirational", "Warm & everyday", "Glamorous & premium"] },
  { k: "tone", q: "Your tone of voice?", o: ["Confident", "Friendly", "Playful", "Refined"] },
  { k: "value", q: "Core value you lead with?", o: ["Trust & safety", "Innovation", "Affordability", "Status & taste"] },
  { k: "stage", q: "Growth stage?", o: ["Just launched", "Scaling fast", "Established leader"] },
  { k: "budget", q: "Working budget band?", o: Object.keys(BUDGET_TIERS) },
  { k: "goal", q: "Primary campaign goal?", o: ["Awareness / reach", "Trust / credibility", "Sales / conversion", "Repositioning"] },
  { k: "risk", q: "Tolerance for celebrity controversy risk?", o: ["Very low — safest faces only", "Moderate", "Higher — bolder bets ok"] },
  { k: "compete", q: "Do competitors already use celebrities?", o: ["Yes, heavily", "A little", "Not really"] },
  { k: "platform", q: "Where will this mostly run?", o: ["Instagram / Reels", "YouTube", "TV + digital", "On-ground + digital"] },
  { k: "ctype", q: "Campaign type?", o: ["Brand film", "Always-on content", "Product launch", "Festive / seasonal"] },
  { k: "want", q: "What face type do you want?", o: ["Mass trust", "Youth energy", "Glamour", "Everyday credibility"] },
  { k: "lang", q: "Regional language priority?", o: ["Hindi-first", "English-first", "Multi-language", "Specific regional"] },
  { k: "time", q: "Timeline to launch?", o: ["ASAP (< 1 month)", "1–3 months", "Flexible"] },
  { k: "matter", q: "What matters most in the face?", o: ["Credibility", "Reach", "Aspiration", "Cultural relevance"] },
];

// Map an answer choice into a celebrity "type" bucket for scoring.
const WANT_TO_TYPE = {
  "Mass trust": "trust", "Youth energy": "youth", "Glamour": "glam", "Everyday credibility": "credible",
};
const AGE_TO_AUD = {
  "Gen Z (18–24)": "Youth", "Young adults (25–34)": "Lifestyle", "Families (35–50)": "Family", "All ages / mass": "Mass",
};

/* ---------------- HELPERS ---------------- */

function domainToName(url) {
  try {
    let h = url.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    let base = h.split(".")[0] || "Your Brand";
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch { return "Your Brand"; }
}

// Deterministic local decode so the whole flow works before an API key is added.
function mockDecode(url) {
  const name = domainToName(url);
  const seed = name.length;
  const archetypes = ["The Trusted Guide", "The Bold Challenger", "The Everyday Hero", "The Refined Icon"];
  const personalities = [
    ["Warm", "Credible", "Grounded", "Reassuring"],
    ["Confident", "Disruptive", "Energetic", "Sharp"],
    ["Friendly", "Honest", "Approachable", "Practical"],
    ["Elegant", "Premium", "Aspirational", "Understated"],
  ];
  const i = seed % 4;
  return {
    name,
    category: CATEGORIES[seed % (CATEGORIES.length - 1)],
    archetype: archetypes[i],
    personality: personalities[i],
    values: ["Trust", "Quality", "Relevance"],
    audience: ["Youth", "Lifestyle", "Family", "Mass"][i],
    tone: ["Confident", "Friendly", "Warm", "Refined"][i],
    summary:
      `${name} reads as a ${archetypes[i].toLowerCase()} brand — it should be represented by a face that feels ${personalities[i][0].toLowerCase()} and ${personalities[i][1].toLowerCase()}, not just famous. The right ambassador amplifies credibility without overshadowing the product.`,
  };
}

function buildProfile(brand, answers) {
  return {
    category: answers.category || brand.category,
    audience: AGE_TO_AUD[answers.age] || brand.audience,
    want: WANT_TO_TYPE[answers.want] || "credible",
    budget: answers.budget || "Growth (₹25–60 L)",
    risk: answers.risk || "Moderate",
    tone: answers.tone || brand.tone,
    goal: answers.goal || "Awareness / reach",
  };
}

function scoreCeleb(c, p) {
  let s = 52;
  const notes = [];
  if (c.aud === p.audience) { s += 16; notes.push("audience match"); }
  else if ((p.audience === "Youth" && c.aud === "Lifestyle") || (p.audience === "Lifestyle" && c.aud === "Youth")) { s += 8; }
  if (c.types.includes(p.want)) { s += 15; notes.push("right face type"); }
  const okTiers = BUDGET_TIERS[p.budget] || ["Growth"];
  if (okTiers[0] === c.tier) { s += 12; notes.push("fits budget"); }
  else if (okTiers.includes(c.tier)) { s += 6; }
  else { s -= 14; notes.push("above budget"); }
  if (p.risk.startsWith("Very low") && c.types.includes("trust")) { s += 8; notes.push("low crisis-risk"); }
  const conflict = c.owns.includes(p.category);
  if (conflict) { s -= 22; }
  s = Math.max(30, Math.min(97, Math.round(s)));
  return { fit: s, conflict, notes };
}

function safetyScore(c, p) {
  let s = 78;
  if (c.types.includes("trust")) s += 12;
  if (c.types.includes("credible")) s += 6;
  if (c.tier === "Flagship") s += 2;
  if (p.risk.startsWith("Higher")) s -= 4;
  return Math.max(60, Math.min(99, s));
}

/* ---------------- LOGO ---------------- */

function Logo() {
  return <span className="emb" aria-hidden="true" />;
}

/* ---------------- SCREEN CSS ---------------- */

const SCREENCSS = `
.prog{height:4px;background:rgba(212,204,221,.16);border-radius:999px;overflow:hidden;max-width:620px;margin-bottom:26px}
.prog i{display:block;height:100%;background:var(--gg);transition:width .4s cubic-bezier(.16,1,.3,1)}
.qwrap{max-width:620px;animation:fadeup .5s both}
.qnum{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);font-weight:700}
.qtitle{font-family:var(--fd);font-weight:700;font-size:clamp(26px,4vw,40px);color:#fff;margin:10px 0 22px;line-height:1.15}
.opts{display:flex;flex-direction:column;gap:11px}
.opt{text-align:left;background:rgba(255,255,255,.05);border:1px solid rgba(212,204,221,.2);color:var(--cream);padding:16px 20px;border-radius:14px;font-size:16px;font-family:var(--font);cursor:pointer;transition:.2s;display:flex;justify-content:space-between;align-items:center}
.opt:hover{border-color:var(--gold);background:rgba(232,184,75,.09);transform:translateX(4px)}
.opt.sel{border-color:var(--gold);background:rgba(232,184,75,.14)}
.opt .tick{opacity:0;color:var(--gold-b);font-weight:700}
.opt.sel .tick{opacity:1}
.qback{margin-top:20px;background:none;border:none;color:var(--plum-300);cursor:pointer;font-size:14px;font-family:var(--font)}
.qback:hover{color:#fff}
.rep{max-width:760px;animation:fadeup .6s both}
.repgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}
.repf{background:rgba(255,255,255,.05);border:1px solid rgba(212,204,221,.18);border-radius:14px;padding:16px 18px}
.repf label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--plum-400);display:block;margin-bottom:7px}
.repf input,.repf select{width:100%;background:rgba(0,0,0,.25);border:1px solid rgba(212,204,221,.22);border-radius:9px;color:#fff;padding:10px 12px;font-size:15px;font-family:var(--font);outline:none}
.repf input:focus,.repf select:focus{border-color:var(--gold)}
.repfull{grid-column:1/-1}
.rosgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:22px}
.celeb{background:linear-gradient(160deg,rgba(60,36,72,.7),rgba(28,15,34,.75));border:1px solid rgba(212,204,221,.16);border-radius:16px;padding:18px;cursor:pointer;transition:.25s;position:relative;overflow:hidden}
.celeb:hover{border-color:var(--gold);transform:translateY(-3px);box-shadow:0 20px 40px -22px rgba(0,0,0,.8)}
.celeb.pick{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 20px 40px -22px rgba(0,0,0,.8)}
.celeb h4{font-family:var(--fd);font-size:19px;color:#fff}
.celeb .fld{font-size:12.5px;color:var(--plum-300);margin-top:2px}
.fit{display:flex;align-items:center;gap:9px;margin-top:14px}
.fitbar{flex:1;height:6px;background:rgba(212,204,221,.16);border-radius:999px;overflow:hidden}
.fitbar i{display:block;height:100%;background:var(--gg)}
.fitn{font-family:var(--fd);font-weight:700;color:var(--gold-b);font-size:15px}
.flag{display:inline-flex;align-items:center;gap:6px;margin-top:12px;font-size:12px;padding:5px 10px;border-radius:999px}
.flag.bad{background:rgba(237,169,179,.12);color:#EDA9B3;border:1px solid rgba(237,169,179,.3)}
.flag.ok{background:rgba(120,220,150,.1);color:#8fe3a8;border:1px solid rgba(120,220,150,.28)}
.match{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.mstat{background:rgba(255,255,255,.05);border:1px solid rgba(212,204,221,.18);border-radius:14px;padding:18px}
.mstat b{font-family:var(--fd);font-size:26px;color:#fff;display:block}
.mstat span{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--plum-400)}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}
@media(max-width:640px){.repgrid,.match{grid-template-columns:1fr}}
`;

/* ---------------- MAIN ---------------- */

export default function Home() {
  const [stage, setStage] = useState("land");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState(null);
  const [error, setError] = useState("");
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState({});
  const [report, setReport] = useState(null);
  const [picked, setPicked] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let w, h, parts, raf;
    const resize = () => { w = cv.width = window.innerWidth; h = cv.height = window.innerHeight; };
    resize();
    parts = Array.from({ length: 46 }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2 + 0.6,
      s: Math.random() * 0.4 + 0.15, o: Math.random() * 0.5 + 0.2,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.s; if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3);
        ctx.fillStyle = `rgba(232,184,75,${p.o})`; ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  async function decode(u) {
    if (!u || !u.includes(".")) { setError("Enter a valid website, e.g. yourbrand.in"); return; }
    setError(""); setLoading(true); setStage("scan");
    let data = null;
    try {
      const r = await fetch("/api/decode", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      if (r.ok) { const j = await r.json(); if (j && (j.name || j.archetype)) data = j; }
    } catch (e) {}
    if (!data) data = mockDecode(u);
    if (!data.name) data.name = domainToName(u);
    setTimeout(() => {
      setBrand(data);
      setAnswers((a) => ({ ...a, category: data.category }));
      setStage("questions"); setQi(0); setLoading(false);
    }, 1800);
  }

  function answer(k, v) {
    const na = { ...answers, [k]: v };
    setAnswers(na);
    if (qi < QUESTIONS.length - 1) {
      setTimeout(() => setQi(qi + 1), 180);
    } else {
      const p = buildProfile(brand, na);
      setReport({
        name: brand.name,
        archetype: brand.archetype,
        category: p.category,
        audience: p.audience,
        tone: p.tone,
        want: na.want || "Everyday credibility",
        budget: p.budget,
        personality: (brand.personality || []).join(", "),
        summary: brand.summary,
      });
      setStage("report");
    }
  }

  function toRoster() {
    setPicked(null);
    setStage("roster");
  }

  const profile = report && {
    category: report.category,
    audience: report.audience,
    want: WANT_TO_TYPE[report.want] || "credible",
    budget: report.budget,
    risk: answers.risk || "Moderate",
    tone: report.tone,
    goal: answers.goal || "Awareness / reach",
  };

  const ranked = profile
    ? ROSTER.map((c) => ({ c, ...scoreCeleb(c, profile) })).sort((a, b) => b.fit - a.fit)
    : [];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SCREENCSS }} />
      <div className="bg" />
      <canvas id="embers" ref={canvasRef} />

      <div className="wrap">
        <nav className="nav">
          <div className="logo" onClick={() => setStage("land")} style={{ cursor: "pointer" }}>
            <Logo /><span className="wm">Colatch</span>
          </div>
          <a className="navcta" href="https://wa.me/919764140627" target="_blank" rel="noreferrer">Start a partnership</a>
        </nav>

        {stage === "land" && (
          <section className="hero">
            <span className="brandmark" aria-hidden="true" />
            <div className="eyebrow">Celebrity &amp; Brand Marketing · AI Matchmaking</div>
            <h1>Find the face<br />your brand <span className="it">deserves.</span></h1>
            <p className="lead">
              Drop in your website. Colatch decodes your brand DNA, then matches you to the right
              celebrity from our 1500+ roster — cross-checked so no competitor already owns them.
            </p>
            <div className="field">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && decode(url)}
                placeholder="yourbrand.in"
                aria-label="Your website"
              />
              <button className="btn" onClick={() => decode(url)}>Decode my brand →</button>
            </div>
            {error && <div className="err">{error}</div>}
            <div className="hint">
              Try a sample:&nbsp;
              <b onClick={() => { setUrl("vaeda-beauty.in"); decode("vaeda-beauty.in"); }}>vaeda-beauty.in</b> ·
              <b onClick={() => { setUrl("atlas-athleisure.in"); decode("atlas-athleisure.in"); }}>atlas-athleisure.in</b>
            </div>
            <div className="stats">
              <div><b>1500+</b><span>Celebrities</span></div>
              <div className="sep" />
              <div><b>500+</b><span>Brands in India</span></div>
              <div className="sep" />
              <div><b>₹8L–1.2Cr+</b><span>Transparent bands</span></div>
            </div>
          </section>
        )}

        {stage === "scan" && (
          <section className="hero">
            <div className="eyebrow">Decoding</div>
            <h1 style={{ fontSize: "clamp(34px,6vw,64px)" }}>Reading <span className="it">{domainToName(url)}</span>…</h1>
            <div className="scan"><span className="spin2" /> Analysing brand signals, tone and audience</div>
            <div className="scan" style={{ opacity: 0.7 }}>Scanning 1500+ faces for fit &amp; competitor conflicts</div>
          </section>
        )}

        {stage === "questions" && brand && (
          <section className="hero" style={{ minHeight: "80vh", justifyContent: "center" }}>
            <div className="prog"><i style={{ width: `${((qi + 1) / QUESTIONS.length) * 100}%` }} /></div>
            <div className="qwrap" key={qi}>
              <div className="qnum">Question {qi + 1} of {QUESTIONS.length}</div>
              <div className="qtitle">{QUESTIONS[qi].q}</div>
              <div className="opts">
                {QUESTIONS[qi].o.map((op) => (
                  <button
                    key={op}
                    className={"opt" + (answers[QUESTIONS[qi].k] === op ? " sel" : "")}
                    onClick={() => answer(QUESTIONS[qi].k, op)}
                  >
                    {op} <span className="tick">✓</span>
                  </button>
                ))}
              </div>
              {qi > 0 && <button className="qback" onClick={() => setQi(qi - 1)}>← Back</button>}
            </div>
          </section>
        )}

        {stage === "report" && report && (
          <section style={{ padding: "40px 0 60px" }}>
            <div className="rep">
              <div className="eyebrow">Your Brand DNA · editable</div>
              <h1 style={{ fontSize: "clamp(34px,6vw,60px)", margin: "8px 0 6px" }}>{report.name}</h1>
              <p className="lead" style={{ animation: "none" }}>{report.summary}</p>

              <div className="repgrid">
                <div className="repf">
                  <label>Brand archetype</label>
                  <input value={report.archetype} onChange={(e) => setReport({ ...report, archetype: e.target.value })} />
                </div>
                <div className="repf">
                  <label>Category</label>
                  <select value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="repf">
                  <label>Core audience</label>
                  <select value={report.audience} onChange={(e) => setReport({ ...report, audience: e.target.value })}>
                    {["Youth", "Lifestyle", "Family", "Mass", "Premium"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="repf">
                  <label>Face type you want</label>
                  <select value={report.want} onChange={(e) => setReport({ ...report, want: e.target.value })}>
                    {["Mass trust", "Youth energy", "Glamour", "Everyday credibility"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="repf">
                  <label>Budget band</label>
                  <select value={report.budget} onChange={(e) => setReport({ ...report, budget: e.target.value })}>
                    {Object.keys(BUDGET_TIERS).map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="repf">
                  <label>Tone of voice</label>
                  <input value={report.tone} onChange={(e) => setReport({ ...report, tone: e.target.value })} />
                </div>
                <div className="repf repfull">
                  <label>Personality</label>
                  <input value={report.personality} onChange={(e) => setReport({ ...report, personality: e.target.value })} />
                </div>
              </div>

              <div className="row">
                <button className="btn" onClick={toRoster}>Find my celebrity matches →</button>
                <button className="navcta" onClick={() => setStage("questions")} style={{ padding: "14px 20px" }}>← Edit answers</button>
              </div>
            </div>
          </section>
        )}

        {stage === "roster" && profile && (
          <section style={{ padding: "40px 0 70px" }}>
            <div className="eyebrow">Fit-led shortlist · conflict-checked</div>
            <h1 style={{ fontSize: "clamp(32px,5vw,54px)", margin: "8px 0 4px" }}>
              Faces for <span className="it">{report.name}</span>
            </h1>
            <p className="lead" style={{ animation: "none" }}>
              Ranked by fit to your audience, budget and tone — each cross-checked against competitor conflicts in {report.category}.
            </p>

            <div className="rosgrid">
              {ranked.map(({ c, fit, conflict }) => (
                <div key={c.n} className={"celeb" + (picked === c.n ? " pick" : "")} onClick={() => setPicked(c.n)}>
                  <h4>{c.n}</h4>
                  <div className="fld">{c.f} · {c.vibe}</div>
                  <div className="fit">
                    <div className="fitbar"><i style={{ width: fit + "%" }} /></div>
                    <span className="fitn">{fit}%</span>
                  </div>
                  <div className="fld" style={{ marginTop: 8 }}>{c.tier} · {TIER_PRICE[c.tier].band}</div>
                  {conflict
                    ? <span className="flag bad">⚠ Competitor conflict in {report.category}</span>
                    : <span className="flag ok">✓ No competitor conflict</span>}
                </div>
              ))}
            </div>

            {picked && (() => {
              const c = ROSTER.find((x) => x.n === picked);
              const sc = scoreCeleb(c, profile);
              const tp = TIER_PRICE[c.tier];
              return (
                <div className="card" style={{ marginTop: 30, maxWidth: 820 }}>
                  <div className="tag">Match dossier</div>
                  <h3>{c.n} × {report.name}</h3>
                  <div className="tl">{c.f} · {c.vibe} · {c.tier} tier</div>
                  <div className="match">
                    <div className="mstat"><b>{sc.fit}%</b><span>Brand fit</span></div>
                    <div className="mstat"><b>{safetyScore(c, profile)}/100</b><span>Brand-safety</span></div>
                    <div className="mstat"><b>{tp.reach}</b><span>Est. reach</span></div>
                    <div className="mstat"><b>{tp.recall}</b><span>Recall lift</span></div>
                  </div>
                  <p>
                    Indicative all-in band <b style={{ color: "var(--gold-b)" }}>{tp.band}</b> (talent + production + usage).{" "}
                    {sc.conflict
                      ? `Heads up — ${c.n.split(" ")[0]} is already associated with ${report.category}, so a competitor may effectively own this face. We'd flag this before you commit.`
                      : `Clean slate — ${c.n.split(" ")[0]} has no competing ${report.category} association, so the equity works fully for you.`}
                  </p>
                  <div className="chips">
                    <span>{report.audience} audience</span>
                    <span>{report.want}</span>
                    <span>{report.tone} tone</span>
                    {sc.notes.map((n) => <span key={n}>{n}</span>)}
                  </div>
                  <div className="row">
                    <a className="btn" href={`https://wa.me/919764140627?text=${encodeURIComponent(`Hi Colatch — we'd like to explore ${c.n} for ${report.name}.`)}`} target="_blank" rel="noreferrer">
                      Request {c.n.split(" ")[0]} on WhatsApp →
                    </a>
                    <button className="navcta" onClick={() => setStage("report")} style={{ padding: "14px 20px" }}>← Back to report</button>
                  </div>
                </div>
              );
            })()}

            {!picked && <div className="row"><button className="navcta" onClick={() => setStage("report")} style={{ padding: "14px 20px" }}>← Back to report</button></div>}
          </section>
        )}

        <footer>© Colatch · Celebrity &amp; Brand Marketing · Mumbai · Delhi NCR · Bengaluru</footer>
      </div>
    </>
  );
}
