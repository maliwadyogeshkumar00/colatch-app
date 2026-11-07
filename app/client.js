// Browser helpers: resilient fetch, shortlist share links, local history, CSV export.

// POST JSON or FormData with a timeout and one retry on network / 5xx errors. Throws Error with a readable message.
export async function api(path, { body, form, timeout = 25000, retry = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(path, {
        method: "POST", signal: ctrl.signal,
        ...(form ? { body: form } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }),
      });
      let j = null;
      try { j = await r.json(); } catch {}
      if (!r.ok) {
        const e = new Error((j && j.error) || (r.status === 429 ? "Too many requests. Try again in a minute." : `Something went wrong (${r.status}). Try again.`));
        e.status = r.status; e.data = j; throw e;
      }
      return j || {};
    } catch (e) {
      const transient = e.name === "AbortError" || !e.status || e.status >= 500;
      if (attempt < retry && transient && e.status !== 429) { await new Promise((res) => setTimeout(res, 800)); continue; }
      if (e.name === "AbortError") { const x = new Error("That took too long. Check your connection and try again."); x.status = 0; throw x; }
      if (!e.status) { const x = new Error(typeof navigator !== "undefined" && navigator.onLine === false ? "You're offline. Reconnect and try again." : "Couldn't reach Colatch just now. Try again."); x.status = 0; throw x; }
      throw e;
    } finally { clearTimeout(t); }
  }
}

// base64url JSON — shortlist links need no database and carry no personal data, only names and fit scores.
export function encodeShare(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const HKEY = "colatch.history.v1";
export function loadHistory() {
  try { const a = JSON.parse(localStorage.getItem(HKEY) || "[]"); return Array.isArray(a) ? a.slice(0, 6) : []; } catch { return []; }
}
export function saveHistory(entry) {
  try {
    const all = loadHistory().filter((h) => h.brand?.name !== entry.brand?.name || JSON.stringify(h.answers) !== JSON.stringify(entry.answers));
    const next = [{ ...entry, at: Date.now() }, ...all].slice(0, 6);
    localStorage.setItem(HKEY, JSON.stringify(next));
    return next;
  } catch { return []; }
}
export function clearHistory() { try { localStorage.removeItem(HKEY); } catch {} }

export function csvDownload(name, rows) {
  const csv = rows.map((r) => r.map((v) => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now"; if (m < 60) return m + " min ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24); return d === 1 ? "yesterday" : d + " days ago";
}
