// Header + footer for the creator- and brand-facing pages (ported from PublicShell.astro).
export default function PublicShell({ mode = "creator", creatorName = null, path = "", hero = null, narrow = false, children }) {
  const isClient = mode === "client";
  return (
    <>
      <header className="top"><div className="bar-in">
        <a className="lock" href={isClient ? "/brief" : "/creator"}>
          <svg className="em"><use href="#emblem-foil" /></svg><svg className="wm"><use href="#wordmark" /></svg>
          <small>{isClient ? "For brands" : "Creators"}</small>
        </a>
        <nav className="tnav">
          {isClient ? (
            <><a href="/pitches">Creator ideas</a><a href="/join">I'm a creator</a><a className="cta" href="/brief">Post a brief</a></>
          ) : creatorName ? (
            <>
              <a className={path === "/creator" ? "on" : ""} href="/creator">Opportunities</a>
              <a className={path.startsWith("/creator/applications") ? "on" : ""} href="/creator/applications">My deals</a>
              <a className={path.startsWith("/creator/earnings") ? "on" : ""} href="/creator/earnings">Earnings</a>
              <a className={path.startsWith("/creator/score") ? "on" : ""} href="/creator/score">Score</a>
              <a className={path.startsWith("/creator/pitch") ? "on" : ""} href="/creator/pitch">Pitch</a>
              <a className={path.startsWith("/creator/profile") ? "on" : ""} href="/creator/profile">Profile</a>
              <a href="/creator/logout">Log out</a>
            </>
          ) : (
            <><a href="/brief">For brands</a><a className={path === "/creator/login" ? "on" : ""} href="/creator/login">Log in</a><a className="cta" href="/join">Join free</a></>
          )}
        </nav>
      </div></header>
      {hero}
      <main className={narrow ? "wrap narrow" : "wrap"}>{children}</main>
      <footer className="foot"><div className="bar-in">
        <span>Colatch · Celebrity &amp; Influencer Marketing · India</span>
        <span><a href="mailto:marketing@colatch.com">marketing@colatch.com</a> · <a href="https://colatch.com">colatch.com</a></span>
      </div></footer>
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
