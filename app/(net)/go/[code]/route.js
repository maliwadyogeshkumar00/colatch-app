import { env } from "@/lib/net/env";

export const dynamic = "force-dynamic";

const away = (to) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });

/** Tracked creator link: counts the click, then sends the visitor to the brand with UTM tags. */
export async function GET(req, { params }) {
  const code = String(params.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  if (!code) return away("https://colatch.com");
  const row = await env.DB.prepare(
    "SELECT d.id, k.brand_url, k.slug FROM creator_deals d LEFT JOIN campaigns k ON k.id = d.campaign_id WHERE d.track_code = ?"
  ).bind(code).first().catch(() => null);
  if (!row) return away("https://colatch.com");
  await env.DB.prepare("UPDATE creator_deals SET clicks = clicks + 1 WHERE id = ?").bind(row.id).run().catch(() => null);
  let dest = "https://colatch.com";
  try {
    if (row.brand_url) {
      const u = new URL(row.brand_url);
      if (u.protocol === "https:" || u.protocol === "http:") {
        u.searchParams.set("utm_source", "instagram");
        u.searchParams.set("utm_medium", "influencer");
        u.searchParams.set("utm_campaign", row.slug || "colatch");
        u.searchParams.set("utm_content", code);
        dest = u.toString();
      }
    }
  } catch { /* bad URL on the campaign: fall back */ }
  return away(dest);
}
