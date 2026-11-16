// Public FAQ. Every answer describes how the app actually works today (lib/net/deal.ts, pricing.ts,
// referral.ts, score.ts, dealflow.ts). Legal terms are left to each agreement, not stated here.
import PublicShell from "../_ui/PublicShell";
import { feePct, RUSH_PCT } from "@/lib/net/deal";
import { env } from "@/lib/net/env";
import { TIERS } from "@/lib/net/score";
import { REF } from "@/lib/net/referral";

const SITE = (process.env.SITE_URL || "https://colatch-app.vercel.app").replace(/\/$/, "");

export const metadata = {
  title: "Questions creators and brands ask",
  description: "How Colatch Connect works: what brands pay, when creators get paid, how payments are recorded, how disputes and the Colatch Score work.",
  alternates: { canonical: "/faq" },
};

function qa() {
  const std = feePct(env);
  return [
    { group: "Brands", q: "What does a brand pay?", a: `The creator's fee, plus Colatch's fee of ${std}% of that creator fee, plus GST at 18% on Colatch's fee. If the creator is GST-registered, their GST is added too. The all-in price is shown under each creator on your shortlist before you approve anyone.` },
    { group: "Brands", q: "Are there lower rates for repeat work?", a: `Yes. Booking a creator you have already paid through Colatch is charged at 12%. Brands also get 1 point off the fee for every ₹5 lakh of creator fees paid in the last 12 months, down to 10%. The lower of the two applies.` },
    { group: "Brands", q: "What does a rush shortlist cost?", a: `A rush shortlist adds ${RUSH_PCT}% of the creator fee on top of Colatch's fee. It is shown as its own line in the price.` },
    { group: "Brands", q: "How do we pay?", a: "By bank transfer to Colatch. There is no card or online payment gateway yet. A member of Colatch's finance team records each payment with its bank reference (UTR), and only then does the work start. Once your payment is recorded, the price for that creator is locked." },
    { group: "Brands", q: "Can we ask for changes to a draft?", a: "Yes. Open the draft from your shortlist link and ask for changes, or approve it. Each deal includes a set number of revision rounds, shown on the deal. If you don't reply within the review window, the draft is approved automatically." },
    { group: "Creators", q: "Is joining free?", a: "Yes. You see only briefs that fit what you do, and you choose what to apply for." },
    { group: "Creators", q: "When do I get paid?", a: "After your post is live and the Colatch team has checked it against the brief. The payout is then approved and sent by bank transfer, and you see the bank reference (UTR) on your earnings page." },
    { group: "Creators", q: "Is TDS deducted?", a: "Your deal shows an estimate of the TDS and of what you take home. The actual TDS, if any, is the amount recorded with your payment. Colatch's CA confirms the section and rate; TDS deducted is credited against your income tax." },
    { group: "Creators", q: "When can I start making the content?", a: "Once you have accepted the terms and the brand's payment has been recorded. Your deal page shows which step it is on and whose move it is." },
    { group: "Creators", q: "What is the Colatch Score?", a: `A score from your verified record on Colatch: brand-approved posts, real views, payouts and ratings. Tiers: ${TIERS.map((t) => `${t.tier} (${t.min}+): ${t.perk}`).join(" ")}` },
    { group: "Creators", q: "How do referrals work?", a: `Bring a creator and you earn ₹${REF.creatorBonus} when their first paid deal clears. Bring a brand and you earn a share of Colatch's fee on that brand's deals for ${REF.months} months. Earnings show as pending until they are paid out.` },
    { group: "Everyone", q: "What if something goes wrong on a deal?", a: "Raise a dispute from the deal. The Colatch team reviews it, writes down the outcome, and both sides are told. What happens to money in a cancellation or refund is set out in your agreement with Colatch." },
    { group: "Everyone", q: "Who can see my information?", a: "Brands see creators' public profiles and the shortlist the team prepares. Payout details such as UPI are shown only to Colatch's finance team, partly hidden. Private links (shortlists, receipts) are not listed in search engines." },
  ];
}

export default function Page() {
  const items = qa();
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", url: `${SITE}/faq`, mainEntity: items.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) };
  const groups = ["Brands", "Creators", "Everyone"];
  const hero = (
    <section className="hero"><div className="hero-in">
      <div className="eb">Colatch Connect · Questions</div>
      <h1>How it <b>works.</b></h1>
      <p>What brands pay, when creators get paid, and what happens if something goes wrong. Answers describe how Colatch Connect works today.</p>
    </div></section>
  );
  return (
    <PublicShell mode="client" hero={hero} narrow>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      {groups.map((g) => (
        <section key={g} className="sec" aria-labelledby={`faq-${g}`}>
          <h2 id={`faq-${g}`} className="h2">{g}</h2>
          <div className="stack">
            {items.filter((x) => x.group === g).map((x) => (
              <details key={x.q} className="box">
                <summary>{x.q}</summary>
                <div className="inner"><p style={{ margin: 0, color: "var(--ink-2)" }}>{x.a}</p></div>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="hint" style={{ marginTop: 32 }}>Still stuck? Write to marketing@colatch.com.</p>
    </PublicShell>
  );
}
