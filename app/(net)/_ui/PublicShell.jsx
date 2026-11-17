// Header + footer for the creator- and brand-facing pages.
// Signed-in creators get a 4-item tab bar on phones (Home, Deals, Earnings, Profile); every other
// destination (Score, Pitch, Settings, Log out) stays in the header on desktop and in the footer menu on phones.
const ICON = {
  home: <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>,
  deals: <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M9 6V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V6M4 11h16" stroke="currentColor" strokeWidth="1.5" /></svg>,
  money: <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 5h10M7 9h10M9 5c3.5 0 5 1.8 5 4s-1.5 4-5 4H7l7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  me: <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
};

export default function PublicShell({ mode = "creator", creatorName = null, brandName = null, path = "", hero = null, narrow = false, moves = 0, children }) {
  const isClient = mode === "client";
  const on = (p, exact = false) => (exact ? path === p : path.startsWith(p)) ? "on" : "";
  const creatorLinks = [
    ["/creator", "Home", true], ["/creator/applications", "My deals"], ["/creator/earnings", "Earnings"], ["/creator/score", "Score"],
    ["/creator/pitch", "Pitch"], ["/creator/profile", "Profile"], ["/creator/settings", "Settings"],
  ];
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top"><div className="bar-in">
        <a className="lock" href={isClient ? "/brief" : "/creator"} aria-label={isClient ? "Colatch for brands" : "Colatch for creators"}>
          <svg className="em" aria-hidden="true"><use href="#emblem-foil" /></svg><svg className="wm" aria-hidden="true"><use href="#wordmark" /></svg>
          <small>{isClient ? "For brands" : "Creators"}</small>
        </a>
        {isClient ? (
          brandName ? (
            <nav className="tnav brand-nav" aria-label="Main">
              <a className={on("/brand", true)} aria-current={on("/brand", true) ? "page" : undefined} href="/brand"><span className="lbl-long">My campaigns</span><span className="lbl-short" aria-hidden="true">Campaigns</span></a>
              <a className={`tnav-full ${on("/brand/settings")}`} href="/brand/settings">Settings</a>
              <a className="tnav-full" href="/brand/logout">Log out</a>
              <a className="cta" href="/brief"><span className="lbl-long">Post a brief</span><span className="lbl-short" aria-hidden="true">+ Brief</span></a>
            </nav>
          ) : (
            <nav className="tnav" aria-label="Main"><a className="tnav-full" href="/pitches">Creator ideas</a><a className="tnav-full" href="/join">I'm a creator</a><a className={on("/brand/login", true)} href="/brand/login">Log in</a><a className="cta" href="/brief">Post a brief</a></nav>
          )
        ) : creatorName ? (
          <nav className="tnav creator-nav" aria-label="Main">
            {creatorLinks.map(([href, label, exact]) => <a key={href} className={on(href, exact)} aria-current={on(href, exact) ? "page" : undefined} href={href}>{label}</a>)}
            <a href="/creator/logout">Log out</a>
          </nav>
        ) : (
          <nav className="tnav" aria-label="Main"><a className="tnav-full" href="/brief">For brands</a><a className={on("/creator/login", true)} href="/creator/login">Log in</a><a className="cta" href="/join">Join free</a></nav>
        )}
      </div></header>
      {hero}
      <main id="main" tabIndex={-1} className={narrow ? "wrap narrow" : "wrap"}>{children}</main>
      <footer className="foot">
        {brandName && isClient && (
          <nav className="bar-in" aria-label="More" style={{ paddingBottom: 0 }}>
            <span className="row" style={{ gap: 16 }}>
              <a className="link" href="/brand">My campaigns</a><a className="link" href="/brand/settings">Settings</a><a className="link" href="/brand/logout">Log out</a>
            </span>
          </nav>
        )}
        {creatorName && !isClient && (
          <nav className="bar-in" aria-label="More" style={{ paddingBottom: 0 }}>
            <span className="row" style={{ gap: 16 }}>
              {creatorLinks.map(([href, label]) => <a key={href} className="link" href={href}>{label}</a>)}
              <a className="link" href="/creator/logout">Log out</a>
            </span>
          </nav>
        )}
        <div className="bar-in">
          <span>Colatch · Celebrity &amp; Influencer Marketing · India</span>
          <span><a className="link" href="/faq">FAQ</a> · marketing@colatch.com · <a className="link" href="https://colatch.com">colatch.com</a></span>
        </div>
      </footer>
      {creatorName && !isClient && (
        <nav className="tabbar" aria-label="Creator">
          <a className={on("/creator", true)} aria-current={on("/creator", true) ? "page" : undefined} href="/creator" style={{ position: "relative" }}>{ICON.home}<span>Home</span>{moves > 0 && <span className="dot">{moves}</span>}</a>
          <a className={on("/creator/applications") || on("/creator/deals")} href="/creator/applications">{ICON.deals}<span>Deals</span></a>
          <a className={on("/creator/earnings")} href="/creator/earnings">{ICON.money}<span>Earnings</span></a>
          <a className={on("/creator/profile") || on("/creator/score") || on("/creator/pitch") || on("/creator/settings")} href="/creator/profile">{ICON.me}<span>Profile</span></a>
        </nav>
      )}
    </>
  );
}

/** Dark hero band used at the top of most public pages. */
export function Hero({ eyebrow, title, children }) {
  return (
    <section className="hero"><div className="hero-in">
      {eyebrow && <div className="eb">{eyebrow}</div>}
      <h1 dangerouslySetInnerHTML={{ __html: title }} />
      {children}
    </div></section>
  );
}
