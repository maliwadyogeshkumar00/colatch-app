// Creator profile fields shared by /join and /creator/profile (ported from CreatorProfileFields.astro).
import { SKILLS, LANGUAGES, CITIES, list } from "@/lib/net/match";
import { NICHES } from "@/lib/net/creators";

export default function CreatorProfileFields({ v = {} }) {
  const has = (k, x) => list(v[k]).map((s) => s.toLowerCase()).includes(x.toLowerCase());
  const chips = (name, items) => (
    <div className="chips">{items.map((s) => <label key={s} className="chip"><input type="checkbox" name={name} value={s} defaultChecked={has(name, s)} /><span>{s}</span></label>)}</div>
  );
  // Checkbox chips are real checkboxes in a fieldset, so screen readers announce the group and each choice.
  const group = (legend, hint, name, items) => (
    <fieldset className="fld full" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="lbl" style={{ padding: 0, marginBottom: 6 }}>{legend}{hint && <span className="opt"> — {hint}</span>}</legend>{chips(name, items)}
    </fieldset>
  );
  const part = (n, title, sub) => (
    <div className="full" style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: n === 1 ? 0 : 16, paddingTop: n === 1 ? 0 : 20, borderTop: n === 1 ? 0 : "1px solid var(--line)" }}>
      <span className="num" style={{ color: "var(--ink-4)", fontSize: 13 }}>{n} of 3</span><b style={{ color: "var(--head)", fontSize: 17 }}>{title}</b>{sub && <span className="hint">{sub}</span>}
    </div>
  );
  return (
    <>
      <div className="form-grid">
        {part(1, "What you make", "Brands search by this first")}
        {group("What do you do?", "pick all that fit", "skills", SKILLS)}
        {group("Your content niche", "", "niche", NICHES)}
        <div className="fld"><label htmlFor="f-ui-city-1">City</label><input id="f-ui-city-1" name="city" list="pcities" autoComplete="address-level2" required defaultValue={v.city ?? ""} placeholder="Delhi" /></div>
        <div className="fld"><label htmlFor="f-ui-gender-2">Gender <span className="opt">— some briefs ask for it</span></label>
          <select id="f-ui-gender-2" name="gender" defaultValue={v.gender ?? ""}>{["", "Female", "Male", "Other"].map((g) => <option key={g} value={g}>{g || "Prefer not to say"}</option>)}</select></div>
        {group("Languages you create in", "", "language", LANGUAGES)}
        {part(2, "Your numbers", "Rough is fine; the team checks them")}
        <div className="fld"><label htmlFor="f-ui-followers-3">Instagram followers <span className="opt">— unlocks most briefs</span></label><input id="f-ui-followers-3" name="followers" inputMode="numeric" defaultValue={v.followers ?? ""} placeholder="e.g. 45K or 1.2L" /></div>
        <div className="fld"><label htmlFor="f-ui-avg-views-4">Avg views per reel <span className="opt">— last 10 reels</span></label><input id="f-ui-avg-views-4" name="avg_views" inputMode="numeric" defaultValue={v.avg_views ?? ""} placeholder="e.g. 30K" /></div>
        <div className="fld"><label htmlFor="f-ui-rate-reel-5">Your rate for 1 reel ₹</label><input id="f-ui-rate-reel-5" name="rate_reel" inputMode="numeric" defaultValue={v.rate_reel ?? ""} placeholder="e.g. 15000" /></div>
        <div className="fld"><label htmlFor="f-ui-rate-story-6">Your rate for 1 story ₹ <span className="opt">— optional</span></label><input id="f-ui-rate-story-6" name="rate_story" inputMode="numeric" defaultValue={v.rate_story ?? ""} /></div>
        {part(3, "Show your work", "")}
        <div className="fld full"><label htmlFor="f-ui-bio-pitch-7">One line about your work</label><input id="f-ui-bio-pitch-7" name="bio_pitch" maxLength={200} defaultValue={v.bio_pitch ?? ""} placeholder="Delhi Bhangra dancer, 6 years, wedding + festive reels that go viral" /></div>
        <div className="fld full"><label htmlFor="f-ui-portfolio-links-8">Links to your 2–3 best reels <span className="opt">— one per line</span></label><textarea id="f-ui-portfolio-links-8" name="portfolio_links" rows={3} defaultValue={v.portfolio_links ?? ""} /></div>
        <div className="fld"><label htmlFor="f-ui-phone-9">WhatsApp number</label><input id="f-ui-phone-9" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required defaultValue={v.phone ?? ""} placeholder="98XXXXXXXX" /></div>
        <div className="fld"><label className="chip" style={{ marginTop: 22 }}><input type="checkbox" name="open_to_barter" value="1" defaultChecked={Boolean(Number(v.open_to_barter) || v.open_to_barter === "1")} /><span>Also show me product, ticket, giveaway and commission deals</span></label></div>
      </div>
      <datalist id="pcities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}
