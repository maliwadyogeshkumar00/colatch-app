// Not found, inside Colatch Connect: shown for a wrong or expired shortlist, receipt, media kit or deal link.
export const metadata = { title: "Link not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main" className="wrap narrow" style={{ paddingTop: 64 }}>
      <p className="eyebrow dash">Link not found</p>
      <h1 style={{ fontSize: "var(--t-h1)", fontWeight: 300, letterSpacing: "-.025em", lineHeight: 1.1, margin: "12px 0 0", color: "var(--ink)", textWrap: "balance" }}>
        This link doesn't open <b style={{ fontWeight: 700, color: "var(--head)" }}>anything here.</b>
      </h1>
      <p style={{ color: "var(--ink-3)", maxWidth: "56ch", margin: "16px 0 0" }}>
        It may be old, mistyped, or for a campaign that was closed. If someone sent it to you, ask them for a fresh link.
      </p>
      <div className="row" style={{ marginTop: 24 }}>
        <a className="btn plum" href="/creator">I'm a creator</a>
        <a className="btn" href="/brief">I'm a brand</a>
        <a className="btn ghost" href="/team">Colatch team</a>
      </div>
    </main>
  );
}
