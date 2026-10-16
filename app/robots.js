export default function robots() {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/s?"] }], sitemap: (process.env.SITE_URL || "https://colatch.in") + "/sitemap.xml" };
}
