import { env } from "@/lib/net/env";

// Public, indexable pages only. Private link pages (shortlist, receipt, roster, reset) and logged-in areas are left out.
export const revalidate = 3600;

export default async function sitemap() {
  const base = (process.env.SITE_URL || "https://colatch-app.vercel.app").replace(/\/$/, "");
  const page = (path, priority, changeFrequency = "weekly", lastModified) => ({ url: base + path, priority, changeFrequency, ...(lastModified ? { lastModified } : {}) });
  const out = [
    page("/", 1, "daily"),
    page("/brief", 0.9),
    page("/join", 0.9),
    page("/pitches", 0.7, "daily"),
    page("/creator/login", 0.3, "monthly"),
  ];
  // Database pages are best-effort: if the database is unreachable the static pages still go out.
  try {
    const kits = (await env.DB.prepare(
      "SELECT c.handle FROM creators c JOIN creator_accounts a ON a.creator_id = c.id WHERE c.status <> 'blacklisted' AND COALESCE(a.claim_status, 'own') <> 'pending' ORDER BY c.handle LIMIT 5000"
    ).all()).results ?? [];
    for (const k of kits) out.push(page(`/m/${encodeURIComponent(k.handle)}`, 0.5));
    const proofs = (await env.DB.prepare(
      "SELECT id, brand_signoff_at FROM creator_deals WHERE proof_public = 1 AND brand_signoff_at IS NOT NULL ORDER BY brand_signoff_at DESC LIMIT 5000"
    ).all()).results ?? [];
    for (const p of proofs) out.push(page(`/proof/${encodeURIComponent(p.id)}`, 0.4, "monthly", String(p.brand_signoff_at).slice(0, 10)));
  } catch (e) {
    console.error("[sitemap]", e?.message);
  }
  return out;
}
