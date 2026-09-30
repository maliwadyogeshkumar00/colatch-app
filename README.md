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
- `POST /api/match` — `{ profile, brand }` → full ranked list; with Gemini, the top candidates get an AI shortlist + reasons

## Env vars (Vercel)
| var | purpose |
|---|---|
| `GEMINI_API_KEY` | optional — AI decode + AI shortlist reasons |
| `GEMINI_MODEL` | optional, default `gemini-2.5-flash` |
| `ROSTER_SOURCE_URL` | optional, default `https://colatch.com/talent` |
| `ROSTER_TTL` | optional cache seconds, default `3600` |

Tiers, fee bands, conflict associations and controversy flags live in `lib/enrich.js`; scoring weights in `lib/engine.js`.
Design follows the Colatch Brand OS (§4 colour rationing, §6 imagery, §8 motion & reduced-motion).
