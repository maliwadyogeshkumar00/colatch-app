// Colatch Score visuals: tier badge, compact strip for the feed, shared styles.
export const TIER_STYLE = {
  Rising: { bg: "rgba(106,74,120,.12)", fg: "#472B53", ring: "#8A6E96", mark: "◆" },
  Trusted: { bg: "rgba(31,122,80,.12)", fg: "#16573a", ring: "#1F7A50", mark: "✦" },
  Gold: { bg: "linear-gradient(135deg,#F2D163,#C8962E)", fg: "#2E1B36", ring: "#C8962E", mark: "★" },
  Icon: { bg: "linear-gradient(135deg,#2E1B36,#1E1128)", fg: "#F2D163", ring: "#E8B84B", mark: "♛" },
};

export function TierBadge({ tier, size = "md" }) {
  const t = TIER_STYLE[tier] || TIER_STYLE.Rising;
  const pad = size === "sm" ? "2px 9px" : "4px 12px";
  const fs = size === "sm" ? 11 : 12.5;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: pad, borderRadius: 999, background: t.bg, color: t.fg, fontSize: fs, fontWeight: 700, letterSpacing: ".02em", whiteSpace: "nowrap", border: tier === "Icon" ? "1px solid rgba(232,184,75,.55)" : "0" }}>
      <span aria-hidden="true">{t.mark}</span>{tier}
    </span>
  );
}

export function ScoreRing({ score, tier, size = 64 }) {
  const t = TIER_STYLE[tier] || TIER_STYLE.Rising;
  const inner = Math.round(size * 0.78);
  return (
    <div aria-label={`Colatch Score ${score} of 100`} style={{ width: size, height: size, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: `conic-gradient(${t.ring} ${score * 3.6}deg, rgba(31,21,36,.08) 0)` }}>
      <i style={{ fontStyle: "normal", width: inner, height: inner, borderRadius: "50%", background: "var(--paper)", display: "grid", placeItems: "center", fontSize: Math.round(size * 0.3), fontWeight: size > 80 ? 300 : 700, color: "var(--p900)", fontVariantNumeric: "tabular-nums" }}>{score}</i>
    </div>
  );
}

/** Compact strip for the top of the creator feed. */
export function ScoreStrip({ s }) {
  return (
    <a href="/creator/score" className="panel" style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", marginBottom: 20, textDecoration: "none", color: "inherit", flexWrap: "wrap" }}>
      <ScoreRing score={s.score} tier={s.tier} size={56} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600 }}>Colatch Score</span>
          <TierBadge tier={s.tier} size="sm" />
        </div>
        <div style={{ marginTop: 4, fontSize: 14, color: "var(--ink-2)" }}>{s.next ? <>Next: <b>{s.next.need}</b></> : <b>You're at the top tier. Every brand sees you first.</b>}</div>
      </div>
      <span className="link small" style={{ flex: "none" }}>See how it works →</span>
    </a>
  );
}
