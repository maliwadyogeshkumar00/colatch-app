// Creator profile fields shared by /join and /creator/profile (ported from CreatorProfileFields.astro).
import { SKILLS, LANGUAGES, CITIES, list } from "@/lib/net/match";
import { NICHES } from "@/lib/net/creators";

export default function CreatorProfileFields({ v = {} }) {
  const has = (k, x) => list(v[k]).map((s) => s.toLowerCase()).includes(x.toLowerCase());
  const chips = (name, items) => (
    <div className="chips">{items.map((s) => <label key={s} className="chip"><input type="checkbox" name={name} value={s} defaultChecked={has(name, s)} /><span>{s}</span></label>)}</div>
  );
  return (
    <>
      <div className="form-grid">
        <div className="fld full"><label>What do you do? <span className="opt">— pick all that fit. Brands search by this first.</span></label>{chips("skills", SKILLS)}</div>
        <div className="fld full"><label>Your content niche</label>{chips("niche", NICHES)}</div>
        <div className="fld"><label htmlFor="f-ui-city-1">City</label><input id="f-ui-city-1" name="city" list="pcities" required defaultValue={v.city ?? ""} placeholder="Delhi" /></div>
        <div className="fld"><label htmlFor="f-ui-gender-2">Gender <span className="opt">— some briefs ask for it</span></label>
          <select id="f-ui-gender-2" name="gender" defaultValue={v.gender ?? ""}>{["", "Female", "Male", "Other"].map((g) => <option key={g} value={g}>{g || "Prefer not to say"}</option>)}</select></div>
        <div className="fld full"><label>Languages you create in</label>{chips("language", LANGUAGES)}</div>
        <div className="fld"><label htmlFor="f-ui-followers-3">Instagram followers <span className="opt">— unlocks most briefs</span></label><input id="f-ui-followers-3" name="followers" defaultValue={v.followers ?? ""} placeholder="e.g. 45K or 1.2L" /></div>
        <div className="fld"><label htmlFor="f-ui-avg-views-4">Avg views per reel <span className="opt">— last 10 reels</span></label><input id="f-ui-avg-views-4" name="avg_views" defaultValue={v.avg_views ?? ""} placeholder="e.g. 30K" /></div>
        <div className="fld"><label htmlFor="f-ui-rate-reel-5">Your rate for 1 reel ₹</label><input id="f-ui-rate-reel-5" name="rate_reel" defaultValue={v.rate_reel ?? ""} placeholder="e.g. 15000" /></div>
        <div className="fld"><label htmlFor="f-ui-rate-story-6">Your rate for 1 story ₹ <span className="opt">— optional</span></label><input id="f-ui-rate-story-6" name="rate_story" defaultValue={v.rate_story ?? ""} /></div>
        <div className="fld full"><label htmlFor="f-ui-bio-pitch-7">One line about your work</label><input id="f-ui-bio-pitch-7" name="bio_pitch" maxLength={200} defaultValue={v.bio_pitch ?? ""} placeholder="Delhi Bhangra dancer, 6 years, wedding + festive reels that go viral" /></div>
        <div className="fld full"><label htmlFor="f-ui-portfolio-links-8">Links to your 2–3 best reels <span className="opt">— one per line</span></label><textarea id="f-ui-portfolio-links-8" name="portfolio_links" rows={3} defaultValue={v.portfolio_links ?? ""} /></div>
        <div className="fld"><label htmlFor="f-ui-phone-9">WhatsApp number</label><input id="f-ui-phone-9" name="phone" required defaultValue={v.phone ?? ""} placeholder="98XXXXXXXX" /></div>
        <div className="fld"><label className="chip" style={{ marginTop: 22 }}><input type="checkbox" name="open_to_barter" value="1" defaultChecked={Boolean(Number(v.open_to_barter) || v.open_to_barter === "1")} /><span>Also show me product, ticket, giveaway and commission deals</span></label></div>
      </div>
      <datalist id="pcities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}
