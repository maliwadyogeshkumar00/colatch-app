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
        <div className="fld"><label>City</label><input name="city" list="pcities" required defaultValue={v.city ?? ""} placeholder="Delhi" /></div>
        <div className="fld"><label>Gender <span className="opt">— some briefs ask for it</span></label>
          <select name="gender" defaultValue={v.gender ?? ""}>{["", "Female", "Male", "Other"].map((g) => <option key={g} value={g}>{g || "Prefer not to say"}</option>)}</select></div>
        <div className="fld full"><label>Languages you create in</label>{chips("language", LANGUAGES)}</div>
        <div className="fld"><label>Instagram followers <span className="opt">— unlocks most briefs</span></label><input name="followers" defaultValue={v.followers ?? ""} placeholder="e.g. 45K or 1.2L" /></div>
        <div className="fld"><label>Avg views per reel <span className="opt">— last 10 reels</span></label><input name="avg_views" defaultValue={v.avg_views ?? ""} placeholder="e.g. 30K" /></div>
        <div className="fld"><label>Your rate for 1 reel ₹</label><input name="rate_reel" defaultValue={v.rate_reel ?? ""} placeholder="e.g. 15000" /></div>
        <div className="fld"><label>Your rate for 1 story ₹ <span className="opt">— optional</span></label><input name="rate_story" defaultValue={v.rate_story ?? ""} /></div>
        <div className="fld full"><label>One line about your work</label><input name="bio_pitch" maxLength={200} defaultValue={v.bio_pitch ?? ""} placeholder="Delhi Bhangra dancer, 6 years, wedding + festive reels that go viral" /></div>
        <div className="fld full"><label>Links to your 2–3 best reels <span className="opt">— one per line</span></label><textarea name="portfolio_links" rows={3} defaultValue={v.portfolio_links ?? ""} /></div>
        <div className="fld"><label>WhatsApp number</label><input name="phone" required defaultValue={v.phone ?? ""} placeholder="98XXXXXXXX" /></div>
        <div className="fld"><label className="chip" style={{ marginTop: 22 }}><input type="checkbox" name="open_to_barter" value="1" defaultChecked={Boolean(Number(v.open_to_barter) || v.open_to_barter === "1")} /><span>Also show me product, ticket, giveaway and commission deals</span></label></div>
      </div>
      <datalist id="pcities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}
