export const metadata = {
  title: "Colatch — Find the face your brand deserves",
  description: "AI celebrity-brand matchmaking for India. Decode your brand DNA and match to the right celebrity, cross-checked for competitor conflicts.",
};

const CSS = `:root{
  --bg:#160b1c;--plum-900:#2E1B36;--plum-800:#3A2344;--plum-700:#472B53;--plum-500:#6A4A78;--plum-400:#8A6E96;--plum-300:#B4A0BD;--plum-200:#D8CCDD;
  --gold:#E8B84B;--gold-b:#F2D163;--gold-d:#C8962E;
  --gg:linear-gradient(135deg,#B8801F,#E8B84B 38%,#F6DC8A 60%,#D9A93A);
  --cream:#F8F5F9;--muted:#B4A0BD;
  --font:'Ubuntu',sans-serif;--fd:'Ubuntu',sans-serif;--fa:'Ubuntu',sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--cream);font-family:var(--font);overflow-x:hidden;min-height:100vh;-webkit-font-smoothing:antialiased}
::selection{background:rgba(232,184,75,.28);color:#fff}
.bg{position:fixed;inset:0;z-index:0;background:radial-gradient(1000px 720px at 10% -5%,#43225a 0%,transparent 55%),radial-gradient(900px 720px at 95% 105%,#2a1740 0%,transparent 55%),radial-gradient(700px 520px at 82% 14%,rgba(232,184,75,.10),transparent 60%),linear-gradient(180deg,#1c0f26,#140a1b)}
#embers{position:fixed;inset:0;z-index:1;pointer-events:none}
.wrap{position:relative;z-index:3;max-width:1180px;margin:0 auto;padding:0 26px}
.nav{display:flex;align-items:center;justify-content:space-between;padding:26px 0}
.logo{display:flex;align-items:center;gap:12px}
.logo svg{filter:drop-shadow(0 4px 16px rgba(232,184,75,.4));animation:spin 18s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.logo .wm{font-family:var(--fd);font-weight:700;font-size:23px;letter-spacing:.02em;color:#fff}
.navcta{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--plum-300);border:1px solid rgba(212,204,221,.25);padding:9px 17px;border-radius:999px;text-decoration:none;transition:.3s}
.navcta:hover{color:#fff;border-color:var(--gold);background:rgba(232,184,75,.08)}
.hero{min-height:84vh;display:flex;flex-direction:column;justify-content:center;gap:24px;padding:18px 0 60px}
.eyebrow{font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--gold);font-weight:700;display:flex;align-items:center;gap:12px}
.eyebrow:before{content:'';width:34px;height:2px;background:var(--gg)}
h1{font-family:var(--fd);font-weight:700;font-size:clamp(46px,8vw,96px);line-height:1.02;letter-spacing:-.015em;color:#fff;animation:reveal 1.1s cubic-bezier(.16,1,.3,1) both}
.it{font-family:var(--fa);font-style:italic;font-weight:500;background:var(--gg);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
@keyframes reveal{from{opacity:0;clip-path:inset(0 0 100% 0);transform:translateY(30px);filter:blur(12px)}to{opacity:1;clip-path:inset(0 0 -12% 0);transform:none;filter:blur(0)}}
.lead{color:var(--plum-200);font-size:19px;line-height:1.7;max-width:580px;animation:fadeup .9s .28s both}
@keyframes fadeup{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.field{display:flex;gap:10px;background:rgba(255,255,255,.06);border:1px solid rgba(212,204,221,.22);border-radius:999px;padding:9px 9px 9px 24px;max-width:620px;backdrop-filter:blur(12px);box-shadow:0 20px 50px -20px rgba(0,0,0,.6);animation:fadeup .9s .42s both;transition:.35s}
.field:focus-within{border-color:var(--gold);box-shadow:0 0 0 4px rgba(232,184,75,.14),0 20px 50px -20px rgba(0,0,0,.6)}
.field input{flex:1;background:none;border:none;outline:none;color:#fff;font-size:17px;font-family:var(--font)}
.field input::placeholder{color:var(--plum-400)}
.btn{border:none;cursor:pointer;font-family:var(--font);font-weight:700;font-size:15px;border-radius:999px;padding:15px 28px;background:var(--gg);color:#2E1B36;box-shadow:0 12px 30px -8px rgba(232,184,75,.5);position:relative;overflow:hidden;white-space:nowrap;transition:transform .25s}
.btn:hover{transform:translateY(-2px)}
.btn:disabled{opacity:.5;cursor:default;transform:none}
.btn::after{content:'';position:absolute;top:0;left:-120%;width:55%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);transform:skewX(-20deg)}
.btn:hover::after{animation:shine .8s}
@keyframes shine{to{left:130%}}
.hint{font-size:13.5px;color:var(--plum-400);display:flex;gap:8px;flex-wrap:wrap;animation:fadeup .9s .52s both}
.hint b{color:var(--gold);cursor:pointer;font-weight:600;border-bottom:1px dashed rgba(232,184,75,.4)}
.stats{display:flex;gap:40px;flex-wrap:wrap;align-items:center;margin-top:14px;animation:fadeup .9s .62s both}
.stats b{font-family:var(--fd);font-size:30px;color:#fff;font-weight:700;display:block}
.stats span{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--plum-400)}
.stats .sep{width:1px;height:40px;background:rgba(212,204,221,.2)}
.scan{display:flex;align-items:center;gap:14px;color:var(--plum-200);font-size:15px;margin-top:4px}
.spin2{width:20px;height:20px;border:2px solid rgba(212,204,221,.3);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite}
.err{color:#EDA9B3;margin-top:2px}
.card{background:linear-gradient(155deg,rgba(60,36,72,.92),rgba(28,15,34,.94));border:1px solid var(--gold);border-radius:22px;padding:32px;margin-top:4px;max-width:700px;box-shadow:0 30px 80px -30px rgba(0,0,0,.8),0 0 0 1px rgba(232,184,75,.25);animation:cardin .7s cubic-bezier(.16,1,.3,1) both}
@keyframes cardin{from{opacity:0;transform:translateY(22px) scale(.98)}to{opacity:1;transform:none}}
.card .tag{font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold-b);font-weight:700}
.card h3{font-family:var(--fd);font-size:31px;color:#fff;margin:8px 0 4px}
.card .tl{color:var(--gold-b);font-size:14px}
.card p{color:var(--plum-200);line-height:1.7;margin-top:14px}
.chips{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}
.chips span{background:rgba(232,184,75,.1);border:1px solid rgba(232,184,75,.3);border-radius:999px;padding:7px 14px;font-size:13px;color:var(--gold-b);text-transform:capitalize}
footer{position:relative;z-index:3;border-top:1px solid rgba(212,204,221,.14);margin-top:40px;padding:30px 0;color:var(--plum-400);font-size:13px}
@media(max-width:640px){.stats{gap:22px}.stats .sep{display:none}}`;

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
