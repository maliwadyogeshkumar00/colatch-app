"use client";
import { useState, useEffect, useRef } from "react";

/* ---------------- DATA ---------------- */

const CATEGORIES = [
  "Beauty & Skincare", "Fashion & Apparel", "Food & Beverage", "Fintech & BFSI",
  "D2C / E-commerce", "Health & Wellness", "Auto & EV", "Real Estate",
  "Tech / SaaS", "Jewellery & Luxury", "Education", "Other",
];

const IMG = (s) => "https://colatch.com/roster/" + s + ".webp";

// Real Colatch roster with public portraits. "owns" = categories the face is
// already associated with (competitor-conflict signal).
const ROSTER = [
  { n: "Shahid Kapoor", slug: "shahid-kapoor", f: "Film", vibe: "Premium urban", tier: "Flagship", aud: "Premium", types: ["premium","credible","youth"], owns: ["Auto & EV","Fashion & Apparel"] },
  { n: "Kriti Sanon", slug: "kriti-sanon", f: "Film", vibe: "Lifestyle radiance", tier: "Scale", aud: "Lifestyle", types: ["glam","youth","lifestyle"], owns: ["Beauty & Skincare","Fashion & Apparel"] },
  { n: "KL Rahul", slug: "kl-rahul", f: "Cricket", vibe: "Youth energy", tier: "Scale", aud: "Youth", types: ["youth","mass","credible"], owns: ["Fintech & BFSI","D2C / E-commerce"] },
  { n: "Sonu Sood", slug: "sonu-sood", f: "Film", vibe: "Mass trust", tier: "Scale", aud: "Mass", types: ["trust","mass","credible"], owns: ["Education","Health & Wellness"] },
  { n: "Neha Dhupia", slug: "neha-dhupia", f: "Film", vibe: "Family warmth", tier: "Growth", aud: "Family", types: ["trust","lifestyle"], owns: ["Health & Wellness"] },
  { n: "Malaika Arora", slug: "malaika-arora", f: "Lifestyle", vibe: "Glamour icon", tier: "Scale", aud: "Lifestyle", types: ["glam","premium","lifestyle"], owns: ["Fashion & Apparel","Beauty & Skincare"] },
  { n: "Saina Nehwal", slug: "saina-nehwal", f: "Badminton", vibe: "Discipline & grit", tier: "Growth", aud: "Family", types: ["credible","trust"], owns: ["Health & Wellness"] },
  { n: "Paresh Rawal", slug: "paresh-rawal", f: "Film", vibe: "Veteran credibility", tier: "Growth", aud: "Family", types: ["trust","credible"], owns: ["Health & Wellness"] },
  { n: "Jaya Kishori", slug: "jaya-kishori", f: "Culture", vibe: "Values & trust", tier: "Growth", aud: "Mass", types: ["trust","credible"], owns: [] },
  { n: "Shriya Saran", slug: "shriya-saran", f: "Film", vibe: "Pan-India appeal", tier: "Growth", aud: "Mass", types: ["lifestyle","glam"], owns: ["Jewellery & Luxury"] },
  { n: "Sharman Joshi", slug: "sharman-joshi", f: "Film", vibe: "Relatable youth", tier: "Starter", aud: "Youth", types: ["youth","credible"], owns: [] },
  { n: "Adah Sharma", slug: "adah-sharma", f: "Film / OTT", vibe: "Bold & digital", tier: "Growth", aud: "Youth", types: ["youth","glam"], owns: ["D2C / E-commerce"] },
  { n: "Mouni Roy", slug: "mouni-roy", f: "TV / Film", vibe: "Aspirational glam", tier: "Growth", aud: "Lifestyle", types: ["glam","lifestyle"], owns: ["Beauty & Skincare"] },
  { n: "Rasraj Ji Maharaj", slug: "rasraj-ji-maharaj", f: "Devotion", vibe: "Faith & trust", tier: "Growth", aud: "Mass", types: ["trust","credible"], owns: [] },
  { n: "Rakesh Bedi", slug: "rakesh-bedi", f: "Film", vibe: "Veteran charm", tier: "Starter", aud: "Family", types: ["credible","mass"], owns: [] },
];

const FACES = ROSTER.map((c) => c.slug);

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

const WANT_TO_TYPE = { "Mass trust": "trust", "Youth energy": "youth", "Glamour": "glam", "Everyday credibility": "credible" };
const AGE_TO_AUD = { "Gen Z (18–24)": "Youth", "Young adults (25–34)": "Lifestyle", "Families (35–50)": "Family", "All ages / mass": "Mass" };

/* ---------------- HELPERS ---------------- */

function domainToName(url) {
  try {
    let h = url.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    let base = h.split(".")[0] || "Your Brand";
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch { return "Your Brand"; }
}

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

function Logo() {
  return <img className="brandlogo" src="https://colatch.com/colatch-logo-white.svg" alt="Colatch" />;
}

function Wall() {
  const cols = [[0, 3, 6, 9, 12], [1, 4, 7, 10, 13], [2, 5, 8, 11, 14]];
  const cls = ["a", "b", "c"];
  return (
    <div className="wall" aria-hidden="true">
      {cols.map((idxs, ci) => (
        <div className={"wcol " + cls[ci]} key={ci}>
          {[...idxs, ...idxs].map((fi, k) => (
            <div className="wface" key={k}>
              <img src={IMG(FACES[fi])} alt="" loading="eager" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------- SCREEN CSS ---------------- */

const SCREENCSS = `
.veil{position:fixed;inset:0;z-index:2;background:rgba(12,6,16,.78);pointer-events:none;transition:opacity .6s}
.prog{height:4px;background:rgba(212,204,221,.16);border-radius:999px;overflow:hidden;max-width:620px;margin-bottom:26px}
.prog i{display:block;height:100%;background:var(--gg);transition:width .4s cubic-bezier(.16,1,.3,1)}
.qwrap{max-width:640px;animation:fadeup .5s both}
.qnum{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);font-weight:700}
.qtitle{font-family:var(--fd);font-weight:700;font-size:clamp(28px,4vw,44px);color:#fff;margin:10px 0 24px;line-height:1.12;letter-spacing:-.02em}
.opts{display:flex;flex-direction:column;gap:11px}
.opt{text-align:left;background:rgba(30,18,40,.5);border:1px solid rgba(212,204,221,.18);color:var(--cream);padding:16px 20px;border-radius:14px;font-size:16px;font-family:var(--font);cursor:pointer;transition:.2s;display:flex;justify-content:space-between;align-items:center;backdrop-filter:blur(6px)}
.opt:hover{border-color:var(--gold);background:rgba(232,184,75,.12);transform:translateX(5px)}
.opt.sel{border-color:var(--gold);background:rgba(232,184,75,.16)}
.opt .tick{opacity:0;color:var(--gold-b);font-weight:700}
.opt.sel .tick{opacity:1}
.qback{margin-top:20px;background:none;border:none;color:var(--plum-300);cursor:pointer;font-size:14px;font-family:var(--font)}
.qback:hover{color:#fff}
.sec-head{max-width:820px}
.sec-head h2{font-family:var(--fd);font-weight:700;font-size:clamp(34px,5vw,60px);color:#fff;margin:8px 0 8px;letter-spacing:-.035em;line-height:1}
.sec-head p{color:var(--plum-200);font-size:17px;line-height:1.6;max-width:640px}
.repgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px;max-width:760px}
.repf{background:rgba(30,18,40,.5);border:1px solid rgba(212,204,221,.16);border-radius:14px;padding:16px 18px;backdrop-filter:blur(6px)}
.repf label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--plum-400);display:block;margin-bottom:7px}
.repf input,.repf select{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(212,204,221,.22);border-radius:9px;color:#fff;padding:10px 12px;font-size:15px;font-family:var(--font);outline:none}
.repf input:focus,.repf select:focus{border-color:var(--gold)}
.repfull{grid-column:1/-1}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:26px}
.pcard{position:relative;aspect-ratio:3/4;border-radius:18px;overflow:hidden;cursor:pointer;border:1px solid rgba(212,204,221,.14);transition:.3s;background:#241634}
.pcard img{width:100%;height:100%;object-fit:cover;object-position:top center;transition:.5s;filter:grayscale(.1)}
.pcard:hover img{transform:scale(1.06)}
.pcard:hover{border-color:var(--gold);transform:translateY(-5px);box-shadow:0 34px 60px -30px #000}
.pcard.pick{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 34px 60px -30px #000}
.pov{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:16px;background:linear-gradient(180deg,rgba(12,6,16,0) 38%,rgba(12,6,16,.72) 66%,rgba(12,6,16,.96))}
.ptier{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-b);font-weight:700;margin-bottom:auto;align-self:flex-start;background:rgba(12,6,16,.5);padding:5px 9px;border-radius:999px;backdrop-filter:blur(4px)}
.pov h4{font-family:var(--fd);font-size:19px;color:#fff;letter-spacing:-.01em}
.pfld{font-size:12px;color:var(--plum-200);margin-top:1px}
.pfit{display:flex;align-items:center;gap:8px;margin-top:10px}
.pfitbar{flex:1;height:5px;background:rgba(255,255,255,.16);border-radius:999px;overflow:hidden}
.pfitbar i{display:block;height:100%;background:var(--gg)}
.pfitn{font-family:var(--fd);font-weight:700;color:var(--gold-b);font-size:14px}
.pflag{display:inline-flex;align-items:center;gap:5px;margin-top:9px;font-size:11px;padding:4px 9px;border-radius:999px;align-self:flex-start}
.pflag.bad{background:rgba(237,169,179,.16);color:#F3B6BE;border:1px solid rgba(237,169,179,.35)}
.pflag.ok{background:rgba(120,220,150,.14);color:#9CE9B4;border:1px solid rgba(120,220,150,.32)}
.dossier{display:grid;grid-template-columns:260px 1fr;gap:26px;margin-top:30px;max-width:900px}
.dportrait{border-radius:18px;overflow:hidden;aspect-ratio:3/4;border:1px solid var(--gold);box-shadow:0 30px 60px -30px #000}
.dportrait img{width:100%;height:100%;object-fit:cover;object-position:top center}
.card{background:linear-gradient(155deg,rgba(46,27,54,.78),rgba(20,10,26,.85));border:1px solid rgba(232,184,75,.4);border-radius:24px;padding:30px;backdrop-filter:blur(12px);box-shadow:0 40px 90px -40px #000;animation:cardin .7s cubic-bezier(.16,1,.3,1) both}
@keyframes cardin{from{opacity:0;transform:translateY(22px) scale(.98)}to{opacity:1;transform:none}}
.tag{font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold-b);font-weight:700}
.card h3{font-family:var(--fd);font-size:30px;color:#fff;margin:8px 0 4px;letter-spacing:-.02em}
.tl{color:var(--gold-b);font-size:14px}
.match{margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mstat{background:rgba(255,255,255,.05);border:1px solid rgba(212,204,221,.16);border-radius:14px;padding:16px}
.mstat b{font-family:var(--fd);font-size:26px;color:#fff;display:block;letter-spacing:-.02em}
.mstat span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--plum-400)}
.card p{color:var(--plum-200);line-height:1.65;margin-top:16px;font-size:15px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.chips span{background:rgba(232,184,75,.1);border:1px solid rgba(232,184,75,.3);border-radius:999px;padding:6px 13px;font-size:12.5px;color:var(--gold-b);text-transform:capitalize}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
@media(max-width:720px){.repgrid,.match{grid-template-columns:1fr}.dossier{grid-template-columns:1fr}.dportrait{max-width:220px}}
`;

/* ---------------- MAIN ---------------- */

export default function Home() {
  const [stage, setStage] = useState("land");
  const [url, setUrl] = useState("");
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
    parts = Array.from({ length: 42 }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + 0.5,
      s: Math.random() * 0.4 + 0.12, o: Math.random() * 0.5 + 0.15,
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
    setError(""); setStage("scan");
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
      setStage("questions"); setQi(0);
    }, 1900);
  }

  function answer(k, v) {
    const na = { ...answers, [k]: v };
    setAnswers(na);
    if (qi < QUESTIONS.length - 1) {
      setTimeout(() => setQi(qi + 1), 170);
    } else {
      const p = buildProfile(brand, na);
      setReport({
        name: brand.name, archetype: brand.archetype, category: p.category,
        audience: p.audience, tone: p.tone, want: na.want || "Everyday credibility",
        budget: p.budget, personality: (brand.personality || []).join(", "), summary: brand.summary,
      });
      setStage("report");
    }
  }

  function toRoster() { setPicked(null); setStage("roster"); }

  const profile = report && {
    category: report.category, audience: report.audience,
    want: WANT_TO_TYPE[report.want] || "credible", budget: report.budget,
    risk: answers.risk || "Moderate", tone: report.tone, goal: answers.goal || "Awareness / reach",
  };

  const ranked = profile
    ? ROSTER.map((c) => ({ c, ...scoreCeleb(c, profile) })).sort((a, b) => b.fit - a.fit)
    : [];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SCREENCSS }} />
      <div className="stagebg" />
      <Wall />
      <div className="scrim" />
      <div className="veil" style={{ opacity: stage === "land" ? 0 : 0.92 }} />
      <canvas id="embers" ref={canvasRef} />
      <div className="grain" />

      <div className="wrap">
        <nav className="nav">
          <div className="logo" onClick={() => setStage("land")}>
            <Logo />
          </div>
          <a className="navcta" href="https://wa.me/919764140627" target="_blank" rel="noreferrer">Start a partnership</a>
        </nav>

        {/* LANDING */}
        {stage === "land" && (
          <section className="hero">
            <div className="eyebrow">Celebrity &amp; Brand Marketing · AI Matchmaking</div>
            <h1>
              <span className="h1a"><span>Find the face</span></span>
              <span className="h1a"><span>your brand <span className="it">deserves.</span></span></span>
            </h1>
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

        {/* SCAN */}
        {stage === "scan" && (
          <section className="hero">
            <div className="eyebrow">Decoding</div>
            <h1 style={{ fontSize: "clamp(36px,6vw,72px)" }}>Reading <span className="it">{domainToName(url)}</span>…</h1>
            <div className="scan"><span className="spin2" /> Analysing brand signals, tone and audience</div>
            <div className="scan" style={{ opacity: 0.7 }}>Scanning 1500+ faces for fit &amp; competitor conflicts</div>
          </section>
        )}

        {/* QUESTIONS */}
        {stage === "questions" && brand && (
          <section className="hero" style={{ minHeight: "80vh", justifyContent: "center", maxWidth: "100%" }}>
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

        {/* REPORT */}
        {stage === "report" && report && (
          <section style={{ padding: "48px 0 70px" }}>
            <div className="sec-head">
              <div className="eyebrow">Your Brand DNA · editable</div>
              <h2>{report.name}</h2>
              <p>{report.summary}</p>
            </div>
            <div className="repgrid">
              <div className="repf"><label>Brand archetype</label>
                <input value={report.archetype} onChange={(e) => setReport({ ...report, archetype: e.target.value })} /></div>
              <div className="repf"><label>Category</label>
                <select value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <div className="repf"><label>Core audience</label>
                <select value={report.audience} onChange={(e) => setReport({ ...report, audience: e.target.value })}>
                  {["Youth", "Lifestyle", "Family", "Mass", "Premium"].map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <div className="repf"><label>Face type you want</label>
                <select value={report.want} onChange={(e) => setReport({ ...report, want: e.target.value })}>
                  {["Mass trust", "Youth energy", "Glamour", "Everyday credibility"].map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <div className="repf"><label>Budget band</label>
                <select value={report.budget} onChange={(e) => setReport({ ...report, budget: e.target.value })}>
                  {Object.keys(BUDGET_TIERS).map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <div className="repf"><label>Tone of voice</label>
                <input value={report.tone} onChange={(e) => setReport({ ...report, tone: e.target.value })} /></div>
              <div className="repf repfull"><label>Personality</label>
                <input value={report.personality} onChange={(e) => setReport({ ...report, personality: e.target.value })} /></div>
            </div>
            <div className="row">
              <button className="btn" onClick={toRoster}>Reveal my celebrity matches →</button>
              <button className="navcta" onClick={() => setStage("questions")} style={{ padding: "14px 20px" }}>← Edit answers</button>
            </div>
          </section>
        )}

        {/* ROSTER */}
        {stage === "roster" && profile && (
          <section style={{ padding: "48px 0 80px" }}>
            <div className="sec-head">
              <div className="eyebrow">Fit-led shortlist · conflict-checked</div>
              <h2>Faces for <span className="it">{report.name}</span></h2>
              <p>Ranked by fit to your audience, budget and tone — each cross-checked against competitor conflicts in {report.category}.</p>
            </div>

            <div className="pgrid">
              {ranked.map(({ c, fit, conflict }) => (
                <div key={c.n} className={"pcard" + (picked === c.n ? " pick" : "")} onClick={() => setPicked(c.n)}>
                  <img src={IMG(c.slug)} alt={c.n} loading="lazy" onError={(e) => { e.currentTarget.style.opacity = 0.15; }} />
                  <div className="pov">
                    <span className="ptier">{c.tier} · {TIER_PRICE[c.tier].band}</span>
                    <h4>{c.n}</h4>
                    <div className="pfld">{c.f} · {c.vibe}</div>
                    <div className="pfit">
                      <div className="pfitbar"><i style={{ width: fit + "%" }} /></div>
                      <span className="pfitn">{fit}%</span>
                    </div>
                    {conflict
                      ? <span className="pflag bad">⚠ Conflict · {report.category}</span>
                      : <span className="pflag ok">✓ No conflict</span>}
                  </div>
                </div>
              ))}
            </div>

            {picked && (() => {
              const c = ROSTER.find((x) => x.n === picked);
              const sc = scoreCeleb(c, profile);
              const tp = TIER_PRICE[c.tier];
              return (
                <div className="dossier">
                  <div className="dportrait"><img src={IMG(c.slug)} alt={c.n} /></div>
                  <div className="card" style={{ margin: 0 }}>
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
                      <button className="navcta" onClick={() => setPicked(null)} style={{ padding: "14px 20px" }}>← All faces</button>
                    </div>
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
