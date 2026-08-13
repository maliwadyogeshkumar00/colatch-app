"use client";
import { useState, useEffect, useRef } from "react";

function Logo(){
  return (
    <div className="logo">
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
        <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B8801F"/><stop offset="0.4" stopColor="#E8B84B"/><stop offset="0.7" stopColor="#F6DC8A"/><stop offset="1" stopColor="#D9A93A"/>
        </linearGradient></defs>
        <circle cx="17" cy="17" r="15" stroke="url(#cg)" strokeWidth="2.4" fill="none" strokeDasharray="72 22" strokeLinecap="round"/>
        <circle cx="17" cy="17" r="4.6" fill="url(#cg)"/>
      </svg>
      <span className="wm">Colatch</span>
    </div>
  );
}

export default function Home(){
  const [url,setUrl]=useState("");
  const [phase,setPhase]=useState("idle");
  const [dna,setDna]=useState(null);
  const [error,setError]=useState("");
  const cref=useRef(null);

  useEffect(()=>{
    const cv=cref.current; if(!cv) return;
    const ctx=cv.getContext("2d"); let W,H,raf,mx=0,my=0;
    const size=()=>{W=cv.width=window.innerWidth;H=cv.height=window.innerHeight;};
    size(); window.addEventListener("resize",size);
    const move=(e)=>{mx=e.clientX/window.innerWidth-0.5;my=e.clientY/window.innerHeight-0.5;};
    window.addEventListener("pointermove",move,{passive:true});
    const parts=Array.from({length:70},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+0.5,s:Math.random()*0.45+0.12,o:Math.random()*0.4+0.15,d:Math.random()*6.28}));
    const draw=()=>{
      ctx.clearRect(0,0,W,H);
      for(const p of parts){
        p.y-=p.s; p.x+=Math.sin(p.d+p.y*0.01)*0.3;
        if(p.y<-12){p.y=H+12;p.x=Math.random()*W;}
        const px=p.x+mx*46*p.r, py=p.y+my*46*p.r, R=p.r*4;
        const g=ctx.createRadialGradient(px,py,0,px,py,R);
        g.addColorStop(0,"rgba(232,184,75,"+p.o+")"); g.addColorStop(1,"rgba(232,184,75,0)");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,R,0,6.283); ctx.fill();
      }
      raf=requestAnimationFrame(draw);
    };
    draw();
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",size);window.removeEventListener("pointermove",move);};
  },[]);

  async function decode(){
    if(!url) return;
    setPhase("scanning"); setError(""); setDna(null);
    try{
      const r=await fetch("/api/decode",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})});
      const data=await r.json();
      if(!r.ok) throw new Error(data.error||"Something went wrong");
      setDna(data.dna); setPhase("done");
    }catch(e){ setError(String(e.message||e)); setPhase("error"); }
  }

  return (
    <>
      <canvas id="embers" ref={cref}></canvas>
      <div className="bg"></div>
      <div className="wrap">
        <nav className="nav"><Logo/><a className="navcta" href="#">Start a partnership</a></nav>
        <section className="hero">
          <div className="eyebrow">Celebrity &amp; Brand Marketing · AI Matchmaking</div>
          <h1>Find the face<br/>your brand <span className="it">deserves.</span></h1>
          <p className="lead">Drop in your website. Colatch decodes your brand DNA, then matches you to the right celebrity from our 1500+ roster — cross-checked so no competitor already owns them.</p>
          <div className="field">
            <input value={url} onChange={(e)=>setUrl(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&decode()} placeholder="yourbrand.in" spellCheck={false} />
            <button className="btn" onClick={decode} disabled={phase==="scanning"||!url}>{phase==="scanning"?"Decoding…":"Decode my brand →"}</button>
          </div>
          {phase==="idle" && <div className="hint">Try a sample: <b onClick={()=>setUrl("vaeda-beauty.in")}>vaeda-beauty.in</b> · <b onClick={()=>setUrl("atlas-athleisure.in")}>atlas-athleisure.in</b></div>}
          {phase==="scanning" && <div className="scan"><span className="spin2"></span> Reading your website &amp; synthesizing brand DNA…</div>}
          {phase==="error" && <div className="err">{error}</div>}
          {phase==="done" && dna && (
            <div className="card">
              <div className="tag">Brand DNA</div>
              <h3>{dna.brandName||"Your brand"}</h3>
              {dna.tagline && <div className="tl">{dna.tagline}</div>}
              <p>{dna.summary}</p>
              <div className="chips">
                {["archetype","tone","audience","priceTier","category"].map((k)=> dna[k] ? <span key={k}>{dna[k]}</span> : null)}
              </div>
            </div>
          )}
          {phase==="idle" && (
            <div className="stats">
              <div><b>1500+</b><span>Celebrities</span></div><div className="sep"></div>
              <div><b>300+</b><span>Brands in India</span></div><div className="sep"></div>
              <div><b>Mumbai · Delhi · Bengaluru</b><span>&nbsp;</span></div>
            </div>
          )}
        </section>
        <footer>© Colatch · Celebrity &amp; Brand Marketing · Mumbai · Delhi NCR · Bengaluru</footer>
      </div>
    </>
  );
}
