// Sidebar shell for the Colatch team pages (ported from AdminShell.astro, minus the old work-showcase links).
const I = {
  home: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  finder: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  crm: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  campaigns: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1Z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
  cpv: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 6h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01M9 18h6"/>',
  insights: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  referrals: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  connect: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
};
const NAV = [
  { key: "home", href: "/team", label: "Network overview" },
  { key: "campaigns", href: "/team/campaigns", label: "Open campaigns" },
  { key: "finder", href: "/team/creators", label: "Influencer finder" },
  { key: "crm", href: "/team/crm", label: "Creator CRM" },
  { key: "cpv", href: "/team/cpv", label: "CPV calculator" },
  { key: "insights", href: "/team/insights", label: "Marketplace health" },
  { key: "referrals", href: "/team/referrals", label: "Affiliate program" },
];

export default function TeamShell({ active, eyebrow = "Colatch Connect", title, email = "", actions = null, children }) {
  const initial = (email?.[0] ?? "C").toUpperCase();
  const ico = (k) => <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: I[k] }} />;
  return (
    <div className="app">
      <aside className="rail"><div className="jali" />
        <div className="rail__brand">
          <svg className="em"><use href="#emblem-foil" /></svg>
          <div><svg className="wm"><use href="#wordmark" /></svg><div className="tg">Connect · Network</div></div>
        </div>
        <div className="navlabel">Creator network</div>
        <nav className="nav">
          {NAV.map((n) => <a key={n.key} className={n.key === active ? "on" : ""} href={n.href}>{ico(n.key)}<span>{n.label}</span></a>)}
        </nav>
        <div className="navlabel">Workspace</div>
        <nav className="nav">
          <a href="/connect">{ico("connect")}<span>Connect workspace</span></a>
          <a href="/">{ico("finder")}<span>Celebrity match</span></a>
        </nav>
        <div className="rail__user">
          <div className="rail__ava">{initial}</div>
          <div className="rail__uinfo"><div className="rail__uemail">{email}</div><div className="rail__urole">Colatch team</div></div>
          <a className="rail__out" href="/team/logout" aria-label="Sign out" title="Sign out"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg></a>
        </div>
      </aside>
      <main className="main">
        <div className="bar">
          <div><p className="eyebrow dash">{eyebrow}</p><h1 dangerouslySetInnerHTML={{ __html: title }} /></div>
          <div className="bar__right">{actions}</div>
        </div>
        {children}
      </main>
    </div>
  );
}
