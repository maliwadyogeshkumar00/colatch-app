// Server-only. Keeps the app's roster in sync with https://colatch.com/talent.
// The talent page embeds its full list as <script id="rsData" type="application/json">…</script>,
// so whatever is published there is what the matcher ranks. Cached for ROSTER_TTL seconds; if the
// site can't be reached the bundled snapshot (lib/roster-snapshot.json) keeps the app working.
import snapshot from "./roster-snapshot.json";
import { enrich } from "./enrich";

export const ROSTER_SOURCE = process.env.ROSTER_SOURCE_URL || "https://colatch.com/talent";
const TTL = Number(process.env.ROSTER_TTL || 3600);

let cache = null; // { at, data }

export function extractRoster(html) {
  const m = html.match(/<script[^>]*id=["']rsData["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) throw new Error("rsData block not found on talent page");
  const list = JSON.parse(m[1].trim());
  if (!Array.isArray(list) || list.length < 50) throw new Error("roster looks incomplete (" + (list?.length || 0) + ")");
  return list.filter((x) => x && x.n);
}

export async function loadRoster({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL * 1000) return cache.data;
  let data;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(ROSTER_SOURCE, {
      signal: ctrl.signal,
      headers: { "user-agent": "ColatchMatch/1.0 (+roster sync)", accept: "text/html" },
      next: { revalidate: TTL },
    });
    clearTimeout(t);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const raw = extractRoster(await r.text());
    data = { list: raw.map(enrich), source: "live", syncedAt: new Date().toISOString() };
  } catch (e) {
    data = { list: snapshot.map(enrich), source: "snapshot", syncedAt: null, error: String(e?.message || e) };
  }
  cache = { at: Date.now(), data };
  return data;
}
