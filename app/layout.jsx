export const metadata = {
  title: "Colatch — Find the face your brand deserves",
  description: "AI celebrity-brand matchmaking for India. Decode your brand DNA and match to the right celebrity, cross-checked for competitor conflicts.",
};

const CSS = `
:root{
  --plum-900:#2E1B36;--plum-800:#3A2344;--plum-700:#472B53;--plum-600:#543661;--plum-500:#6A4A78;--plum-400:#8A6E96;--plum-300:#B4A0BD;--plum-200:#D8CCDD;
  --gold-d:#C8962E;--gold:#E8B84B;--gold-b:#F2D163;--gold-pale:#F9EAB7;
  --gg:linear-gradient(135deg,#B8801F,#E8B84B 55%,#F6DC8A);
  --cream:#F8F5F9;
  --font:'Ubuntu',sans-serif;--fd:'Ubuntu',sans-serif;--fa:'Ubuntu',sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:#1d1027;color:var(--cream);font-family:var(--font);overflow-x:hidden;min-height:100vh;-webkit-font-smoothing:antialiased}
::selection{background:rgba(232,184,75,.28);color:#fff}
.glow{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(1100px 760px at 80% 8%,rgba(122,74,158,.42),transparent 58%),radial-gradient(900px 700px at 8% 92%,rgba(74,42,94,.5),transparent 60%),radial-gradient(700px 520px at 78% 60%,rgba(232,184,75,.07),transparent 60%),linear-gradient(165deg,#2a1836,#1c1026 60%,#160b1f)}
#embers{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.6}
.wrap{position:relative;z-index:2;max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,48px)}
footer{position:relative;z-index:2;border-top:1px solid rgba(212,204,221,.12);margin-top:70px;padding:28px 0;color:var(--plum-400);font-size:13px}

.nav{display:flex;align-items:center;justify-content:space-between;padding:26px 0}
.logo{display:flex;align-items:center;gap:10px;cursor:pointer}
.brandlogo{height:30px;width:auto;display:block;filter:drop-shadow(0 3px 12px rgba(232,184,75,.28));animation:reveal 1s cubic-bezier(.16,1,.3,1) both;transition:transform .4s ease,filter .4s ease}
.logo:hover .brandlogo{transform:scale(1.04);filter:drop-shadow(0 5px 18px rgba(232,184,75,.5)) brightness(1.07)}
.navcta{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#fff;border:1px solid rgba(255,255,255,.22);padding:11px 20px;border-radius:999px;text-decoration:none;transition:.3s;white-space:nowrap}
.navcta:hover{border-color:var(--gold);background:rgba(232,184,75,.1)}

.hero{display:grid;grid-template-columns:1.02fr .98fr;gap:clamp(24px,4vw,56px);align-items:center;min-height:82vh;padding:16px 0 70px}
.hcopy{max-width:600px;display:flex;flex-direction:column;gap:22px;animation:fadeup .8s .05s both}
.eyebrow{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);font-weight:700;display:flex;align-items:center;gap:12px}
.eyebrow:before{content:'';width:34px;height:2px;background:var(--gg)}
h1{font-family:var(--fd);font-weight:700;font-size:clamp(40px,5.3vw,70px);line-height:1.03;letter-spacing:-.032em;color:#fff}
.it{background:var(--gg);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.lead{color:var(--plum-200);font-size:18px;line-height:1.62;max-width:500px}
.field{display:flex;gap:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:8px 8px 8px 22px;max-width:520px;backdrop-filter:blur(10px);transition:.3s}
.field:focus-within{border-color:var(--gold);box-shadow:0 0 0 4px rgba(232,184,75,.12)}
.field input{flex:1;min-width:0;background:none;border:none;outline:none;color:#fff;font-size:16px;font-family:var(--font)}
.field input::placeholder{color:var(--plum-400)}
.btn{border:none;cursor:pointer;font-family:var(--font);font-weight:700;font-size:15px;border-radius:999px;padding:14px 24px;background:var(--gg);color:#2E1B36;box-shadow:0 10px 26px -10px rgba(232,184,75,.6);white-space:nowrap;transition:transform .22s}
.btn:hover{transform:translateY(-2px)}
.btn2{cursor:pointer;font-family:var(--font);font-weight:600;font-size:15px;border-radius:999px;padding:14px 22px;background:none;color:#fff;border:1px solid rgba(255,255,255,.24);white-space:nowrap;transition:.25s}
.btn2:hover{border-color:var(--gold);background:rgba(232,184,75,.08)}
.hint{font-size:13px;color:var(--plum-400);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.hint b{color:var(--gold);cursor:pointer;font-weight:600;border-bottom:1px dashed rgba(232,184,75,.4)}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.stats{display:flex;gap:clamp(22px,3vw,40px);flex-wrap:wrap;align-items:center;margin-top:4px}
.stats b{font-family:var(--fd);font-size:28px;color:var(--gold);font-weight:700;display:block;letter-spacing:-.02em}
.stats span{font-size:11.5px;letter-spacing:.06em;color:var(--plum-300);margin-top:2px;display:block}
.stats .sep{width:1px;height:38px;background:rgba(212,204,221,.16)}
.err{color:#EDA9B3;font-size:14px}

/* right-side tilted celebrity cluster */
.cluster{position:relative;height:min(560px,60vw);animation:fadeup .9s .18s both}
.ccard{position:absolute;aspect-ratio:4/5;border-radius:22px;overflow:hidden;border:1px solid rgba(255,255,255,.18);box-shadow:0 40px 80px -30px rgba(0,0,0,.7)}
.ccard img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.ccard.c1{width:52%;left:0;top:16%;transform:rotate(-7deg);z-index:1;filter:brightness(.9)}
.ccard.c2{width:60%;right:2%;top:2%;transform:rotate(4deg);z-index:3}
.ccard.c3{width:44%;right:0;bottom:0;transform:rotate(9deg);z-index:2;filter:brightness(.85)}
.cluster:hover .c2{transform:rotate(4deg) translateY(-8px)}
.ccard{transition:transform .5s cubic-bezier(.16,1,.3,1)}

.scan{display:flex;align-items:center;gap:14px;color:var(--plum-200);font-size:15px;margin-top:6px}
.spin2{width:20px;height:20px;border:2px solid rgba(212,204,221,.3);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes reveal{from{clip-path:inset(0 100% 0 0);opacity:0}to{clip-path:inset(0 0 0 0);opacity:1}}
@keyframes fadeup{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}

@media(max-width:900px){.hero{grid-template-columns:1fr;gap:30px;min-height:auto;padding-top:6px}.cluster{height:min(440px,86vw);max-width:460px}.hcopy{max-width:100%}}
@media(max-width:520px){.stats{gap:18px}.stats .sep{display:none}}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Ubuntu:ital,wght@0,300;0,400;0,500;0,700;1,400;1,700&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
