"use client";
import { useState } from "react";
export default function Home(){
  const [url,setUrl]=useState("");
  const [loading,setLoading]=useState(false);
  const [dna,setDna]=useState(null);
  const [error,setError]=useState("");
  async function decode(){
    setLoading(true);setError("");setDna(null);
    try{
      const r=await fetch("/api/decode",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})});
      const data=await r.json();
      if(!r.ok) throw new Error(data.error||"Something went wrong");
      setDna(data.dna);
    }catch(e){setError(String(e.message||e));}finally{setLoading(false);}
  }
  const gg="linear-gradient(135deg,#B8801F,#E8B84B 40%,#D9A93A)";
  return (
    <main style={{maxWidth:1080,margin:"0 auto",padding:"0 24px"}}>
      <section style={{minHeight:"82vh",display:"flex",flexDirection:"column",justifyContent:"center",gap:22,paddingTop:40}}>
        <div style={{fontSize:12,letterSpacing:".34em",textTransform:"uppercase",color:"#C8962E",fontWeight:700}}>Celebrity &amp; Brand Marketing · AI Matchmaking</div>
        <h1 style={{fontFamily:"Georgia,serif",fontSize:"clamp(40px,7vw,76px)",lineHeight:1.03,color:"#2E1B36",margin:0}}>Find the face<br/>your brand <span style={{fontStyle:"italic",color:"#C8962E"}}>deserves.</span></h1>
        <p style={{color:"#574B61",fontSize:18,maxWidth:560,lineHeight:1.6}}>Drop in your website. Colatch reads it and decodes your brand DNA — then matches you to the right celebrity from our roster, cross-checked so no competitor already owns them.</p>
        <div style={{display:"flex",gap:10,background:"#fff",border:"1px solid #D8CCDD",borderRadius:999,padding:"8px 8px 8px 22px",maxWidth:600,boxShadow:"0 10px 30px rgba(46,27,54,.08)"}}>
          <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&decode()} placeholder="yourbrand.in" style={{flex:1,border:"none",outline:"none",fontSize:16,background:"none"}}/>
          <button onClick={decode} disabled={loading||!url} style={{border:"none",cursor:"pointer",fontWeight:700,borderRadius:999,padding:"14px 26px",background:gg,color:"#3A2344",fontSize:15,opacity:(loading||!url)?0.6:1}}>{loading?"Decoding…":"Decode my brand →"}</button>
        </div>
        {error&&<div style={{color:"#C9536B"}}>{error}</div>}
        {dna&&(
          <div style={{background:"#fff",border:"1px solid #E9E3ED",borderRadius:18,padding:26,marginTop:12,maxWidth:640}}>
            <h3 style={{fontFamily:"Georgia,serif",color:"#2E1B36",margin:0}}>{dna.brandName||"Your brand"}</h3>
            {dna.tagline&&<div style={{color:"#8D8595",fontSize:14,marginTop:4}}>{dna.tagline}</div>}
            <p style={{marginTop:12,lineHeight:1.6}}>{dna.summary}</p>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
              {["archetype","tone","audience","priceTier","category"].map(k=>dna[k]?<span key={k} style={{background:"#F8F5F9",border:"1px solid #E9E3ED",borderRadius:999,padding:"6px 13px",fontSize:13,color:"#472B53"}}>{k}: {dna[k]}</span>:null)}
            </div>
          </div>
        )}
        <footer style={{color:"#8D8595",fontSize:13,marginTop:40}}>Colatch · Celebrity &amp; Brand Marketing · Mumbai · Delhi NCR · Bengaluru</footer>
      </section>
    </main>
  );
}
