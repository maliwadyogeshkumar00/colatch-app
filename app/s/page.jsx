import Shared from "./Shared";
import { loadRoster } from "../../lib/roster";

export const revalidate = 3600;
export const metadata = { title: "Shortlist from Colatch", robots: { index: false, follow: false } };

// /s?d=<base64url JSON> — a read-only shortlist anyone with the link can open and vote on. No database:
// the link carries only names, a brand name and fit scores; profiles come from the live roster.
function decode(d) {
  try {
    const j = JSON.parse(Buffer.from(String(d || ""), "base64url").toString("utf8"));
    const n = Array.isArray(j.n) ? j.n.filter((x) => typeof x === "string").slice(0, 30) : [];
    const f = Array.isArray(j.f) ? j.f.slice(0, 30).map((x) => (typeof x === "number" && x >= 0 && x <= 100 ? Math.round(x) : null)) : [];
    return { b: typeof j.b === "string" ? j.b.slice(0, 60) : "", cat: typeof j.cat === "string" ? j.cat.slice(0, 40) : "", n, f };
  } catch { return null; }
}

export default async function Page({ searchParams }) {
  const data = decode(searchParams?.d);
  const r = await loadRoster();
  const byName = Object.fromEntries(r.list.map((c) => [c.n, c]));
  const items = data ? data.n.map((n, i) => ({ c: byName[n] || null, n, fit: data.f[i] ?? null })) : [];
  return <Shared brand={data?.b || ""} category={data?.cat || ""} items={items} valid={!!data && items.length > 0} id={String(searchParams?.d || "").slice(0, 40)} />;
}
