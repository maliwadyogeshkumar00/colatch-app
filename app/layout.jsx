export const metadata = {
  title: "Colatch — Find the face your brand deserves",
  description: "AI celebrity-brand matchmaking for India. Decode your brand DNA and match to the right celebrity, cross-checked for competitor conflicts.",
};

const CSS = `
:root{
  --bg:#160b1c;--plum-900:#2E1B36;--plum-800:#3A2344;--plum-700:#472B53;--plum-600:#543661;--plum-500:#6A4A78;--plum-400:#8A6E96;--plum-300:#B4A0BD;--plum-200:#D8CCDD;
  --gold-d:#C8962E;--gold:#E8B84B;--gold-b:#F2D163;--gold-pale:#F9EAB7;
  --gg:linear-gradient(115deg,#B8801F,#E8B84B 26%,#F6DC8A 46%,#FFF7DE 56%,#E8B84B 70%,#B8801F);
  --emblem:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzODguMDA0NDggMzg4LjAwNDQ4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImNvbGF0Y2hGb2lsIiB4MT0iMzkuMDEwMDciIHkxPSIxOTQuMDAyMjIiIHgyPSIzMzcuOTYxODIiIHkyPSIxOTQuMDAyMjIiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNjODk0NDIiPjwvc3RvcD48c3RvcCBvZmZzZXQ9Ii4wNSIgc3RvcC1jb2xvcj0iI2QyYTM0YiI+PC9zdG9wPjxzdG9wIG9mZnNldD0iLjExIiBzdG9wLWNvbG9yPSIjZTVjMTYzIj48L3N0b3A+PHN0b3Agb2Zmc2V0PSIuMTYiIHN0b3AtY29sb3I9IiNmMmRiODEiPjwvc3RvcD48c3RvcCBvZmZzZXQ9Ii4yMSIgc3RvcC1jb2xvcj0iI2Y0ZTM4ZCI+PC9zdG9wPjxzdG9wIG9mZnNldD0iLjI2IiBzdG9wLWNvbG9yPSIjZjVlNDhkIj48L3N0b3A+PHN0b3Agb2Zmc2V0PSIuMzIiIHN0b3AtY29sb3I9IiNmMGQ4N2MiPjwvc3RvcD48c3RvcCBvZmZzZXQ9Ii4zNyIgc3RvcC1jb2xvcj0iI2U5Y2I2YSI+PC9zdG9wPjxzdG9wIG9mZnNldD0iLjQyIiBzdG9wLWNvbG9yPSIjZThjYTcwIj48L3N0b3A+PHN0b3Agb2Zmc2V0PSIuNDciIHN0b3AtY29sb3I9IiNlYmQxODQiPjwvc3RvcD48c3RvcCBvZmZzZXQ9Ii41MyIgc3RvcC1jb2xvcj0iI2YzZTJhYyI+PC9zdG9wPjxzdG9wIG9mZnNldD0iLjU4IiBzdG9wLWNvbG9yPSIjZjlmMWNjIj48L3N0b3A+PHN0b3Agb2Zmc2V0PSIuNjMiIHN0b3AtY29sb3I9IiNmNmU3YjYiPjwvc3RvcD48c3RvcCBvZmZzZXQ9Ii42OCIgc3RvcC1jb2xvcj0iI2YwZGE5YSI+PC9zdG9wPjxzdG9wIG9mZnNldD0iLjc0IiBzdG9wLWNvbG9yPSIjZThjOTc5Ij48L3N0b3A+PHN0b3Agb2Zmc2V0PSIuNzkiIHN0b3AtY29sb3I9IiNlMmJjNjEiPjwvc3RvcD48c3RvcCBvZmZzZXQ9Ii44NCIgc3RvcC1jb2xvcj0iI2UzYmQ1YyI+PC9zdG9wPjxzdG9wIG9mZnNldD0iLjg5IiBzdG9wLWNvbG9yPSIjZTdjNjY0Ij48L3N0b3A+PHN0b3Agb2Zmc2V0PSIuOTUiIHN0b3AtY29sb3I9IiNmMWQ5NzciPjwvc3RvcD48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmNGUwN2UiPjwvc3RvcD48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cGF0aCBmaWxsPSIjNTUzNjYxIiBkPSJNMTk0LjAwMjAxLDBDODYuODU4NSwwLDAsODYuODYwODYsMCwxOTQuMDAyMDFzODYuODU4NSwxOTQuMDAyNDYsMTk0LjAwMjAxLDE5NC4wMDI0NiwxOTQuMDAwMDUtODYuODYxMjUsMTk0LjAwMDA1LTE5NC4wMDI0NlMzMDEuMTQzMTcsMCwxOTQuMDAyMDEsMFpNMjU3Ljk2NzQ0LDMzNy40NDE3N2MtNzUuMzk4OTYsMzIuMTY3NDUtMTYxLjkxNjE4LDEuMjE2NTYtMTk5LjgyMTQ1LTcwLjYxNTYzQy45NjAyMSwxNTguNDUxNzIsODMuODQ2NTksMzcuODg1NzYsMTk1Ljg4NTcxLDM3Ljg3MjI1YzE0LjQ0MDI5LS4wMDY3OCwyOS4zNDkwNSwxLjk5NzU1LDQ0LjUyNDkyLDYuMjkxOTQsNDMuMTY5NDUsMTIuMjA1MTEsMTI0LjU0MjQsNzIuNzg0ODMsODcuNjc0ODEsMTIzLjQyMjk5LTI4LjI5MTMsMzguODY5MDEtODMuOTk2MTUsMTIuMDQ1NzktMTA3LjA2OTkxLTE4LjU4ODItMS44NjUzNy0yLjQ3MzI1LTcuMDY1MDktMTEuMzc4NjUtOC40OTkzMi0xNC4zNDA3My04LjQ0MTI0LTE3LjM1Mjk4LTExLjAwMTY3LTM3LjIxMDYtMTYuMDc1MTUtNTUuNjUxOTQtNi41OTUzMywxOC4wODUwMy03Ljc2MDE1LDM3Ljk1NjIyLTE2LjQ3MTI1LDU1LjI2MTQ0LTIyLjQzODQsNDQuNTU4MzMtNTQuMjM2NzYsNDYuNjgwODQtOTYuNjMzNTgsNTguNTg3NzgtMS4zNDI2OS4zNzY5My0zLjk0MTM0LjMyNTE5LTMuNjM3OTYsMi4xOTYxNiwzOC42NjU5Nyw1LjI5ODc3LDc1LjE0MDU5LDE2LjcyNDAxLDk2LjI2MjE0LDUxLjc4MzQ3LDExLjUyMjMzLDE5LjEzNzk2LDE0LjYzODg0LDQxLjU3NjMsMTkuODM4NTcsNjIuOTgyMTJsMTEuMTI3NC00Mi45NzE5NmMxMC45MzQwMS00Mi43NjY2Miw4MC42MTc3NC05MC43MTk0LDExNy4zNDk1NS01MC45MjE2NCw0MS44NjA1MSw0NS4zMzEzNy0yNi41ODY0MywxMDQuNTcwODEtNjYuMzA4NTEsMTIxLjUxODFaIj48L3BhdGg+PHBhdGggZmlsbD0iI2NmOGYyYiIgZD0iTTcyLjA3ODA2LDI4OC44NzExMmMtMTkuMTE1ODgtMjIuNzg3MzgtMjkuODcxNy01Mi4wMTEzNS0zMi41MDUwNS04Mi4zNzcxOS0zLjM3MDA3LTM4Ljg2MTE3LDguNTA2NjgtNzcuNDkzMzQsMzIuNTMyNzQtMTA3LjMwNTE0bC45OTQ0Miw1LjkwMTc1LjAwMTg1LDE3Ny44NjI1NWMuMDAwMDIsMS44OTM4Ni0uOTI4MzgsNC41ODY4NC0xLjAyMzk2LDUuOTE4MDNaIj48L3BhdGg+PHBhdGggZmlsbD0idXJsKCNjb2xhdGNoRm9pbCkiIGQ9Ik0zMzcuMTM0MDMsMjM5LjMyMzg0Yy0zLjEzMTA0LTE0LjgzODI2LTEzLjM5NjE4LTI4LjUwNDM5LTI3LjE1MjIyLTMzLjY3MDc4bC01Ljg3NTc5LTIuMjA2NzNjLTMuMDQwNTMtMS4xNDE5Ny02LjA1ODk2LTEuNTQ4ODktOS40NTMxMi0xLjgzOTc4LTMuMjU0ODgtLjI3ODk5LTYuMzgxMDQtLjI0NDAyLTkuNzA3MzQuMDYyODEtMy4yNjQyOC4zMDEwOS02LjM2MzUzLDEuMTkzMTgtOS40OTU5MSwxLjg3MjUtNS4zNjcwNywxLjE2MzgyLTEwLjgyOTU5LDIuMjkzMDMtMTUuMzE4ODUsNS42MDQ4LTEuODQxOC43NDkzOS00LjA5NTE1LDEuODQ3MTEtNS44NTU2NSwyLjk0ODI0bC00Ljg2NjI3LDMuMDQzNjRjLTIuMDAxMSwxLjI1MTY1LTMuODkwMzIsMi40MTEwNy01Ljc0NzM4LDMuODU1NTNsLTQuODY2MjcsMy43ODUxNi01Ljc3MDA4LDQuOTExMTljLTIuNzIyODQsMi4zMTc1LTUuMDU2NzYsNC42Mzc3Ni03LjMxODMsNy40NTQ2NWwtNi4yOTM2NCw3LjgzOTIzYy0xMi41MDEwNCwxNS41NzA5Mi0xMi4xMzkzNCwyNS4wNzg5OC0xNi43Mjg2NCw0MS45MzA3M2wtNi4yNDU4NSwyMi45MzQ2M2MtMi4yMDc2NC00LjM2MzM0LTMuNzQ3NTYtMTAuMDIzMzItNC43NjA1NitxNS4xMDc5Ny0xLjg4NjU0LTkuNDY5NDItNC4yNzk5MS0xOC43NjAxOS03LjYyMjg2LTI3Ljc3Nzg5LTIuMTMwMTktNS43NDYwMy00LjI0NTkxLTExLjIwMjY0LTcuNjYwNzEtMTYuMjUxNDYtMS45NDE3MS0yLjg3MDkxLTMuMjg2MTMtNy4wMTg1NS02LjI3ODU2LTguOTQwMTItMi4xNjM4Mi01LjU1OTk0LTcuMTQ1NjktOS40NDI4Ny0xMS41OTgwMi0xMy4yNzMxMy0yLjc2MjIxLTIuMzc2MzQtNS44OTIyNy00LjU2MzQyLTguODE4NjYtNi44MjYzNS0zLjY5Mzg1LTIuODU2MzItNy4xMTA2Ni01LjIxMzgxLTExLjUxOTk2LTcuMjQzNTlsLTEwLjUxMDUtNC44MzgyNmMtNS41MzYzOC0yLjU0ODUyLTExLjEwNTEtNS4xNTE0My0xNy4zMTUxMi01LjgyNTk5bC01LjU5ODg4LTEuNzI0MThjLTIuMTY5MjUtLjY2ODAzLTQuNTIzNS0xLjAwMjk5LTYuNzc5NTQtMS4yNDQxNCwtMy45MTQ2Ny0xLjE0NjEyYy0yLjAwOTY0LS41ODgzMi00LjU0NTY1LS42NTg0NS02LjcxOTE4LS45NTI1OGwtNS43MDIwOS0uNzcxNjEtMS42NTEyNS0xLjkwMjQsNC40ODA5LTEuNzU0NTIsMi44Njk5My0xLjE4Mzg0YzIuNjQ4NS0uMDc4NDMsNS4xMjAwNi0xLjExNzY4LDcuNjUwNTctMS44MzcyOGw2Ljc3OTYtMS45Mjc3M2MyLjIzNTE3LS42MzU2Miw1LjQ4OTg3LTEuNTIwMiw3LjcwMzQzLTEuOTcwNTIsNi4xMDA4OS0xLjI0MTAzLDEyLjE2Njc1LTIuODAyLDE3Ljk5NzQ0LTUuMTc3NTVsMTAuNzA5MzUtNC4zNjMyMmMzLjg3NDg4LTEuNTc4NzQsNy4yMDM5OC0zLjU2NTY3LDEwLjYzMzc5LTUuOTAzOTMsMi45NzY0NC0yLjAyOTI0LDYuNTk5MjQtMy41ODUyMSw4Ljg4Mjc0LTYuNjU1NDYsNi44MjkyMi0zLjcwNzAzLDEwLjQ0MDgtMTAuOTkzMjksMTQuNTQzNDYtMTYuOTU3NzYsMi43NzgzOC00LjAzOTE4LDUuMjUxMjItNy45MzI5Miw3LjU2NS0xMi40NzY0NCwzLjc4MTU2LTcuNDI1NjYsNi4xMDM1Mi0xNC45Nzg1Miw4LjEwODgzLTIzLjA1MDIzbDYuMTc1MzUtMjQuODU3MywxLjgzNTIxLTUuNzI1NDZjLjI3OTU0LjEyNjEsMS40MjI2NywxLjU4NDI5LDEuNTg3OTUsMi4xOTg1NWwzLjUzNTEsMTMuMTM4MDZjMS42MzE0MSw2LjA2MzA1LDIuOTQ4ODUsMTIuMTQ0ODQsNC41NTQxNCwxOC4xOTQ0LDIuNTgzMTMsOS43MzQ2OCw1LjcxNjMxLDE5LjMzNzU5LDExLjQ4OTc1LDI3LjU3MTc4LDIuMjU1MzEsMy4yMTY2MSwzLjk3MjExLDYuNzcxMyw2LjU4MDY5LDkuNzUxODksMi4yMjIzNSwyLjUzOTM3LDQuMzYzMjgsNS4xMjYyMiw2Ljc4MjA0LDcuNTQyNjYsMi40ODQ3NCwyLjQ4MjQyLDQuOTE1MTYsNC42NjQyNSw3LjY5ODQzLDYuNzY4NTVsNC45MzY3NywzLjczMjM2YzEuODQ0NDIsMS4zOTQ0MSwzLjcxNTgyLDIuNjQ0NTksNS42ODcwMSwzLjg3ODE3bDQuNjE0NSwyLjg4Nzg4Ljk4Njg4LjcxMTI0Ljg2ODUzLjAyNTE1YzEuMTQzMjUsMS41ODg1Niw0NC40NDIzNywxLjkxODQ2LDUuODUwNTksMi44NTAxNiw0LjQyOTIsMi45MzE1OCw5LjQwNzQxLDMuOTM3NjgsMTQuNTAwNjEsNS4wMDQxNSwzLjE2MzA5LjY2MjI5LDYuMjc5MywxLjQ2NDA1LDkuNTg0MDUsMS44NTIzNiwzLjI2NDEuMzgzNTQsNi4zMDM0MS41MDg0Miw5LjYwOTE5LjE0MzI1LDIuNTcxNzItLjI4NCw1LjExMzc3LS42NDk1NCw3LjY1MDYzLTEuMTUxMDYsMi42Nzg0MS0uNTI5Niw1LjI0NDUxLTEuOTU2MDUsNy43MDU5My0yLjg0MDE1LDYuMjEzMTMtMi4yMzE2MywxMS4zNDMwOC02LjMyNzI3LDE2LjAxNzAzLTExLjYxNjI3LDEyLjE4NDUxLTEzLjc4ODAyLDE1LjI3ODgxLTMyLjA0OTYyLDguMzYzMjgtNDkuMzI2MDUtNS4zOTcwOS0xMy40ODMwOS0xNC41MjA0NS0yNC43MjEzMS0yNC40Nzg0NS0zNC43NDIwN2wtNS43MDIwOS01LjczODFjLTIuNTY5NjQtMi41ODU4Mi01LjQ1ODY4LTQuOTUxNzgtOC41NzIwMi02LjcwMDYyLTIuMTU0OTctMi45NDYzNS01LjkyMDk2LTQuNTkwMjctOC43NzMzOC02Ljc1ODQ4LTMuMzQ1MDMtMi41NDI3Mi02Ljk4OTMyLTQuNTg1NTctMTAuNDgyNzMtNi44MDM3Ny00LjY2OTQzLTIuOTY0NzgtOS4yNDYwMy01LjgyODYxLTE0LjMzNDUzLTguMTUzMzgsMC0uODA0MTIsLS42MjIzMS0xLjIyNzkzNS0uNzQ4OS0xMS4yMTctMS4yNzY5Mi1jLTMuNDg0MjYtLjczNDg2LTcuMDE2MDYtLjgxOTE0LTEwLjU1Njc0LTEuMDQzMTIsLTQuODg2NDIsLS4zMDkxMy01LjczNDcsLS4xMTA1LTQuNzc3MDMsLS4wMTI0OC0yLjIwMjY2LC0uMDA1OTUsNC41MjMwNC4yMTYxNi02LjcyNTI1LjM2NDgsMi41NzU2OC4xNzMzMi01LjE2ODcyLjMzMDUxLTcuNjg1NzYuNjkxMzksLTcuNjEwMTksMS4wOTA0LTQuMjcxMTMsLjYxMjc4LTguNTEwNTcsMS4zMDAyLTEyLjU2OTc1LDIuNzQ3MDdsLTEuODMwMiwzLjA0MzU5LS4wNTIzMS42NjAwMy0wLDI0LjUzMjc3LDEuMDM2NTYsMzQuNzU0ODcsMS44NTc3LTMzLjc1NjIyLTIuNTI2LTdsMTAuNDk0LSwtOS41NTUsNDUuMzc3bDguNzg5Ny8tNS45NjE2NmMzNC40NjItMjYuNTk2LTQzLjEzMSw1MS44NjE3LTQ1LjAyOTMsNzQuODUyLTQ0Ljc1NiAiPjwvcGF0aD48L3N2Zz4g");
  --cream:#F8F5F9;--muted:#B4A0BD;
  --font:'Ubuntu',sans-serif;--fd:'Ubuntu',sans-serif;--fa:'Ubuntu',sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:#0f0814;color:var(--cream);font-family:var(--font);overflow-x:hidden;min-height:100vh;-webkit-font-smoothing:antialiased}
::selection{background:rgba(232,184,75,.28);color:#fff}

/* ---------- cinematic casting wall ---------- */
.stagebg{position:fixed;inset:0;z-index:0;background:radial-gradient(1200px 900px at 12% 30%,#3a1f54 0%,transparent 60%),radial-gradient(900px 700px at 95% 90%,#2a1740 0%,transparent 55%),linear-gradient(180deg,#160b1c,#0f0814)}
.wall{position:fixed;inset:-4% 0;z-index:1;display:flex;gap:18px;justify-content:center;padding:0 14px;overflow:hidden;transform:rotate(-4deg) scale(1.18);transform-origin:center;filter:saturate(.92)}
.wcol{flex:1 1 0;min-width:0;max-width:270px;display:flex;flex-direction:column;gap:18px;will-change:transform}
.wcol.a{animation:wallup 46s linear infinite}
.wcol.b{animation:walldn 54s linear infinite}
.wcol.c{animation:wallup 62s linear infinite}
@keyframes wallup{from{transform:translateY(0)}to{transform:translateY(-50%)}}
@keyframes walldn{from{transform:translateY(-50%)}to{transform:translateY(0)}}
.wface{position:relative;border-radius:16px;overflow:hidden;aspect-ratio:3/4;flex:none;border:1px solid rgba(232,184,75,.12);box-shadow:0 30px 50px -30px #000}
.wface img{width:100%;height:100%;object-fit:cover;object-position:top center;filter:grayscale(.15) contrast(1.04) brightness(.92)}
.scrim{position:fixed;inset:0;z-index:2;pointer-events:none;background:linear-gradient(96deg,#0f0814 0%,rgba(15,8,20,.94) 30%,rgba(15,8,20,.62) 60%,rgba(15,8,20,.4) 78%,rgba(15,8,20,.72) 100%),radial-gradient(1100px 900px at 20% 45%,rgba(74,37,100,.45),transparent 70%),linear-gradient(180deg,rgba(15,8,20,.7),transparent 20%,transparent 72%,#0f0814 98%)}
#embers{position:fixed;inset:0;z-index:3;pointer-events:none}
.grain{position:fixed;inset:0;z-index:4;pointer-events:none;opacity:.42;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

.wrap{position:relative;z-index:5;max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,48px)}
footer{position:relative;z-index:5;border-top:1px solid rgba(212,204,221,.12);margin-top:60px;padding:30px 0;color:var(--plum-400);font-size:13px}

.nav{display:flex;align-items:center;justify-content:space-between;padding:28px 0}
.logo{display:flex;align-items:center;gap:11px;cursor:pointer}\n.brandlogo{height:30px;width:auto;display:block;filter:drop-shadow(0 3px 12px rgba(232,184,75,.35));animation:wmreveal 1s cubic-bezier(.16,1,.3,1) both;transition:transform .4s ease,filter .4s ease}\n.logo:hover .brandlogo{transform:scale(1.04);filter:drop-shadow(0 5px 18px rgba(232,184,75,.6)) brightness(1.08)}
.emb{width:36px;height:36px;flex:none;background:var(--emblem) center/contain no-repeat;transition:transform .5s cubic-bezier(.16,1,.3,1);animation:embin 1.1s cubic-bezier(.16,1,.3,1) both,embpulse 4.5s ease-in-out 1.3s infinite}
.logo:hover .emb{transform:rotate(-8deg) scale(1.06)}\n.lockup{display:inline-flex;align-items:center;gap:11px}\n.wm-svg{height:21px;width:auto;display:block;filter:drop-shadow(0 2px 10px rgba(0,0,0,.45));animation:wmreveal 1s .25s cubic-bezier(.16,1,.3,1) both}\n.wm-svg path{fill:#fff}\n.logo:hover .wm-svg path{fill:var(--gold-pale)}\n@keyframes wmreveal{from{clip-path:inset(0 100% 0 0);opacity:0}to{clip-path:inset(0 0 0 0);opacity:1}}\n@keyframes embin{from{opacity:0;transform:rotate(-160deg) scale(.35)}to{opacity:1;transform:none}}\n@keyframes embpulse{0%,100%{filter:drop-shadow(0 3px 14px rgba(232,184,75,.5))}50%{filter:drop-shadow(0 4px 22px rgba(232,184,75,.95))}}
.logo .wm{font-family:var(--fd);font-weight:700;font-size:22px;letter-spacing:-.02em;color:#fff}
.navcta{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--plum-300);border:1px solid rgba(212,204,221,.25);padding:10px 18px;border-radius:999px;text-decoration:none;transition:.3s;white-space:nowrap}
.navcta:hover{color:#fff;border-color:var(--gold);background:rgba(232,184,75,.08)}

.hero{min-height:82vh;display:flex;flex-direction:column;justify-content:center;gap:22px;padding:12px 0 70px;max-width:680px}
.eyebrow{font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--gold);font-weight:700;display:flex;align-items:center;gap:12px}
.eyebrow:before{content:'';width:36px;height:2px;background:var(--gg)}
h1{font-family:var(--fd);font-weight:700;font-size:clamp(48px,7.4vw,104px);line-height:.98;letter-spacing:-.035em;color:#fff;text-shadow:0 20px 60px rgba(0,0,0,.5)}
.h1a{display:block;overflow:hidden}
.h1a span{display:inline-block;animation:rise 1s cubic-bezier(.16,1,.3,1) both}
.h1a:nth-child(2) span{animation-delay:.08s}
.h1a:nth-child(3) span{animation-delay:.16s}
@keyframes rise{from{transform:translateY(112%) rotate(3deg);opacity:0}to{transform:none;opacity:1}}
.it{font-family:var(--fa);font-style:italic;font-weight:500;background:var(--gg);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.lead{color:var(--plum-200);font-size:19px;line-height:1.65;max-width:540px;animation:fadeup .9s .34s both}
@keyframes fadeup{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.field{display:flex;gap:10px;background:rgba(30,18,40,.55);border:1px solid rgba(232,184,75,.28);border-radius:999px;padding:9px 9px 9px 24px;max-width:560px;backdrop-filter:blur(16px);box-shadow:0 24px 60px -22px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06);animation:fadeup .9s .46s both;transition:.35s}
.field:focus-within{border-color:var(--gold);box-shadow:0 0 0 4px rgba(232,184,75,.16),0 24px 60px -22px rgba(0,0,0,.8)}
.field input{flex:1;min-width:0;background:none;border:none;outline:none;color:#fff;font-size:17px;font-family:var(--font)}
.field input::placeholder{color:var(--plum-400)}
.btn{border:none;cursor:pointer;font-family:var(--font);font-weight:700;font-size:15px;border-radius:999px;padding:15px 26px;background:var(--gg);color:#2E1B36;box-shadow:0 12px 34px -8px rgba(232,184,75,.55);position:relative;overflow:hidden;white-space:nowrap;transition:transform .25s}
.btn:hover{transform:translateY(-2px)}
.btn:disabled{opacity:.5;cursor:default;transform:none}
.btn::after{content:'';position:absolute;top:0;left:-120%;width:55%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);transform:skewX(-20deg)}
.btn:hover::after{animation:shine .8s}
@keyframes shine{to{left:130%}}
@keyframes spin{to{transform:rotate(360deg)}}
.hint{font-size:13.5px;color:var(--plum-400);display:flex;gap:8px;flex-wrap:wrap;align-items:center;animation:fadeup .9s .56s both}
.hint b{color:var(--gold);cursor:pointer;font-weight:600;border-bottom:1px dashed rgba(232,184,75,.4)}
.stats{display:flex;gap:38px;flex-wrap:wrap;align-items:center;margin-top:12px;animation:fadeup .9s .66s both}
.stats b{font-family:var(--fd);font-size:30px;color:#fff;font-weight:700;display:block;letter-spacing:-.02em}
.stats span{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--plum-400)}
.stats .sep{width:1px;height:40px;background:rgba(212,204,221,.18)}
.scan{display:flex;align-items:center;gap:14px;color:var(--plum-200);font-size:15px;margin-top:6px}
.spin2{width:20px;height:20px;border:2px solid rgba(212,204,221,.3);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite}
.err{color:#EDA9B3;margin-top:2px}
@media(max-width:820px){.wall{transform:rotate(-4deg) scale(1.5)}.hero{max-width:100%}}
@media(max-width:560px){.stats{gap:20px}.stats .sep{display:none}}
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
