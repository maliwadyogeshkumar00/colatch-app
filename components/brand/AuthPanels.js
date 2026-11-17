// Editorial panels for SplitAuth on the brand and account screens. Every figure here is a fact about how
// Colatch works today (see /faq), never a made-up metric.
export const BRAND_PANEL = {
  eyebrow: "Colatch for brands",
  title: "Creators who <em>fit the brief</em>, and proof they delivered.",
  lede: "Post a brief in your own words. Colatch matches creators on talent, city, size and language, a strategist sends you a shortlist, and you approve each creator, review every draft and see every rupee in one place.",
  quote: { text: "Your payment is held by Colatch, and each creator is paid only after their post is checked live.", source: "How a Colatch deal works" },
  stats: [{ value: "₹0", label: "To post a brief", gold: true }, { value: "2 days", label: "Usual time to a shortlist" }],
};

export const ACCOUNT_PANEL = {
  eyebrow: "Colatch Connect",
  title: "One account for every <em>brief, deal and payout</em>.",
  lede: "Creators and brands use the same secure sign-in. Links we email you work once and expire, and changing your password signs you out everywhere else.",
  quote: { text: "Private links such as shortlists, receipts and resets are never listed in search engines.", source: "Colatch Connect FAQ" },
  stats: [{ value: "1×", label: "Each link works once", gold: true }, { value: "10+", label: "Characters per password" }],
};
