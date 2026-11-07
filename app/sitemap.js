export default function sitemap() {
  return [{ url: process.env.SITE_URL || "https://colatch.in", changeFrequency: "daily", priority: 1 }];
}
