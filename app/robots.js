export default function robots() {
  const base = (process.env.SITE_URL || "https://colatch-app.vercel.app").replace(/\/$/, "");
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/creator/login"],
      // Logged-in areas and private-link pages. Private pages also send noindex themselves.
      disallow: ["/api/", "/s?", "/team", "/creator", "/shortlist", "/receipt", "/roster", "/reset", "/r/", "/go/", "/c/"],
    }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
