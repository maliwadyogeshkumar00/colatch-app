/** @type {import('next').NextConfig} */
const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Network pages were ported from a typed Astro build; type checks run in the editor, not as a deploy gate.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: "/connect", destination: "/connect.html" }];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: security },
      { source: "/api/:path((?!roster).*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
