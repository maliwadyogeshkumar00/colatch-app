import { NextResponse } from "next/server";
export const runtime = "nodejs";

async function readWebsite(raw){
  let url=(raw||"").trim();
  if(!/^https?:\/\//i.test(url)) url="https://"+url;
  try{
    const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 ColatchBot"}});
    const html=await r.text();
    const text=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
    return {url,text:text.slice(0,12000)};
  }catch(e){return {url,text:"",error:String(e)};}
}

async function askAI(prompt){
  const key=process.env.GEMINI_API_KEY;
  const url="https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key="+key;
  const body={contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}};
  const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok) throw new Error("Gemini error: "+(await r.text()));
  const data=await r.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function parseJSON(text,fallback){
  try{const m=text.match(/\{[\s\S]*\}/);return m?JSON.parse(m[0]):fallback;}catch{return fallback;}
}

export async function POST(req){
  try{
    const { url }=await req.json();
    if(!url) return NextResponse.json({error:"Missing url"},{status:400});
    if(!process.env.GEMINI_API_KEY) return NextResponse.json({error:"Add GEMINI_API_KEY in Vercel env vars to enable AI decode."},{status:503});
    const site=await readWebsite(url);
    const prompt="You are Colatch Intelligence, a brand strategist for a celebrity-marketing agency. Read the website content and return ONLY a JSON object with keys brandName, tagline, summary, archetype, tone, audience, priceTier, category. WEBSITE ("+site.url+"): "+(site.text||"No readable content.");
    const text=await askAI(prompt);
    const dna=parseJSON(text,{summary:text});
    return NextResponse.json({ok:true,source:site.url,dna});
  }catch(e){return NextResponse.json({error:String(e.message||e)},{status:500});}
}
