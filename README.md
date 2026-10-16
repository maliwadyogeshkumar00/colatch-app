# Colatch Match — colatch-app

AI celebrity–brand matchmaking for Colatch. Decode a brand's website, run a short brief, and rank every face on the
Colatch roster for fit, budget and known category conflicts.

## Roster sync
The roster is **not** hard-coded. `lib/roster.js` reads the live list from `https://colatch.com/talent` (the
`<script id="rsData">` JSON that page already embeds), enriches each talent (`lib/enrich.js`) and caches it for an hour.
Publish a new name on colatch.com/talent and it appears here automatically. If the site can't be reached, the bundled
`lib/roster-snapshot.json` is used.

- `GET /api/roster` — full synced roster (`?refresh=1` to bypass the cache)
- `POST /api/decode` — `{ url }` → brand DNA (Gemini if `GEMINI_API_KEY` is set, website keyword signals otherwise)
- `POST /api/match` — `{ profile, brand }` → full ranked list with a per-face score split (audience, face type, budget, category, website, reach, safety); with Gemini, the top candidates get an AI shortlist + reasons
- `POST /api/brief` — JSON `{ text, base }` or multipart `file` (PDF, DOCX, TXT/MD, max 4 MB) → structured brief answers + a review table with confidence per field. Regex reader always runs; Gemini refines it when the key is set (and reads scanned PDFs that have no text layer). Also powers plain-words refinement on the results page.
- `POST /api/request` — availability & quote / "propose names" request → forwarded as JSON to `REQUEST_WEBHOOK_URL`. Without a webhook the response says `delivered: false` and the UI offers WhatsApp with the same text.
- `GET /api/health` — roster source, AI on/off, request routing on/off

## Flows
1. **Website** — decode the URL → brief questions → ranked roster.
2. **Brief** — paste or upload a brief → review what was read (fix anything, category + budget required) → ranked roster.
3. **Results** — "ranked on" chips (remove any to re-rank), plain-words refine, shortlist → compare up to 4 side by side, CSV export, share link, send to Colatch.
4. **Dossier** — score split per face + "Request availability & quote" form.
5. **Share** — `/s?d=…` is a read-only shortlist (no database; the link carries names and fit scores only). Viewers vote yes/no and send feedback on WhatsApp. Not indexed.
6. **Recent** — the last 6 briefs are kept in the browser (localStorage) and can be reopened from the landing page.

## Robustness
- Every API route is rate-limited per IP and validates input size and shape; `/api/match` whitelists profile fields and only accepts AI picks that exist on the roster.
- Website decode blocks private/localhost addresses, non-80/443 ports and re-checks every redirect hop (SSRF guard, `lib/guard.js`).
- The client retries once on network/5xx errors with a timeout; if `/api/match` fails, the engine ranks in the browser so the user still gets results (offline notice shown).
- Error, 404 and loading pages; security headers and `no-store` on APIs in `next.config.js`; robots/sitemap.

## Env vars (Vercel)
| var | purpose |
|---|---|
| `GEMINI_API_KEY` | optional — AI decode + AI shortlist reasons |
| `GEMINI_MODEL` | optional, default `gemini-2.5-flash` |
| `ROSTER_SOURCE_URL` | optional, default `https://colatch.com/talent` |
| `ROSTER_TTL` | optional cache seconds, default `3600` |
| `REQUEST_WEBHOOK_URL` | optional — where quote / propose-names requests are POSTed (Make, Zapier, n8n, Apps Script, Slack). Unset → WhatsApp fallback |
| `SITE_URL` | optional, default `https://colatch.in` (sitemap/robots) |

Tiers, fee bands, conflict associations and controversy flags live in `lib/enrich.js`; scoring weights in `lib/engine.js`.
Design follows the Colatch Brand OS (§4 colour rationing, §6 imagery, §8 motion & reduced-motion).
