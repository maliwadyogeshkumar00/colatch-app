import { SKILLS, LANGUAGES, CITIES, list } from "@/lib/net/match";
import { NICHES } from "@/lib/net/creators";

// Campaign form fields shared by the team's create / edit campaign pages (ported from CampaignFields.astro).
export default function CampaignFields({ v: vIn }) {
  const v = vIn ?? {};
  const has = (k, x) => list(v[k]).map((s) => s.toLowerCase()).includes(x.toLowerCase());
  const extraCities = list(v.city).filter((c) => !CITIES.includes(c)).join(", ");
  const chips = (name, items) => (
    <div className="chips">{items.map((s) => <label key={s} className="chip"><input type="checkbox" name={name} value={s} defaultChecked={has(name, s)} /><span>{s}</span></label>)}</div>
  );
  return (
    <div className="form-grid">
      <div className="fld"><label htmlFor="f-ui-title-1">Opportunity title <span className="opt">— creators see this</span></label><input id="f-ui-title-1" name="title" required defaultValue={v.title ?? ""} placeholder="Bhangra dancers for a festive launch" /></div>
      <div className="fld"><label htmlFor="f-ui-brand-2">Brand <span className="opt">— leave blank to keep it confidential</span></label><input id="f-ui-brand-2" name="brand" defaultValue={v.brand ?? ""} /></div>
      <div className="fld full"><label htmlFor="f-ui-brief-3">Brief for creators</label><textarea id="f-ui-brief-3" name="brief" rows={4} placeholder="What the brand wants, the vibe, what to shoot, dates." defaultValue={v.brief ?? ""} /></div>
      <div className="fld full"><label>Talent needed <span className="opt">— only creators with one of these will see it; none = any creator</span></label>{chips("talent_types", SKILLS)}</div>
      <div className="fld full"><label>Preferred niches <span className="opt">— boosts ranking, doesn't hide anyone</span></label>{chips("niche", NICHES)}</div>
      <div className="fld full"><label>Cities <span className="opt">— none = anywhere in India</span></label>
        <div className="chips">{CITIES.map((s) => <label key={s} className="chip"><input type="checkbox" name="city" value={s} defaultChecked={has("city", s)} /><span>{s}</span></label>)}</div>
        <input name="city" defaultValue={extraCities} placeholder="Other cities, comma separated" style={{ marginTop: 8 }} /></div>
      <div className="fld full"><label>Languages <span className="opt">— boosts ranking</span></label>{chips("languages", LANGUAGES)}</div>
      <div className="fld"><label htmlFor="f-ui-gender-4">Gender</label><select id="f-ui-gender-4" name="gender" defaultValue={v.gender ?? ""}>{["", "Female", "Male"].map((g) => <option key={g} value={g}>{g || "Any"}</option>)}</select></div>
      <div className="fld"><label htmlFor="f-ui-creators-needed-5">Creators needed</label><input id="f-ui-creators-needed-5" name="creators_needed" defaultValue={v.creators_needed ?? ""} placeholder="e.g. 5" /></div>
      <div className="fld"><label htmlFor="f-ui-min-followers-6">Min followers</label><input id="f-ui-min-followers-6" name="min_followers" defaultValue={v.min_followers ?? ""} placeholder="e.g. 50K" /></div>
      <div className="fld"><label htmlFor="f-ui-max-followers-7">Max followers</label><input id="f-ui-max-followers-7" name="max_followers" defaultValue={v.max_followers ?? ""} placeholder="e.g. 5L" /></div>
      <div className="fld"><label htmlFor="f-ui-deliverables-8">Deliverables</label><input id="f-ui-deliverables-8" name="deliverables" defaultValue={v.deliverables ?? ""} placeholder="1 Reel + 2 Stories" /></div>
      <div className="fld"><label htmlFor="f-ui-budget-note-9">Pay shown to creators</label><input id="f-ui-budget-note-9" name="budget_note" defaultValue={v.budget_note ?? ""} placeholder="Paid · ₹15k–30k per reel" /></div>
      <div className="fld"><label htmlFor="f-ui-deadline-10">Apply by</label><input id="f-ui-deadline-10" name="deadline" type="date" defaultValue={v.deadline ?? ""} /></div>
      <div className="fld"><label htmlFor="f-ui-shoot-date-11">Shoot / go-live date</label><input id="f-ui-shoot-date-11" name="shoot_date" type="date" defaultValue={v.shoot_date ?? ""} /></div>
      <div className="fld"><label htmlFor="f-ui-budget-total-12">Client's total budget ₹ <span className="opt">— team only</span></label><input id="f-ui-budget-total-12" name="budget_total" defaultValue={v.budget_total ?? ""} /></div>
      <div className="fld full"><div className="lbl" style={{ margin: "10px 0 4px" }}>Deal terms creators see before applying</div></div>
      <div className="fld"><label htmlFor="f-ui-pay-type-13">Reward <span className="opt">— non-cash briefs are hidden from cash-only creators</span></label><select id="f-ui-pay-type-13" name="pay_type" defaultValue={v.pay_type ?? "cash"}>{[["cash", "Paid (cash)"], ["cash_product", "Paid + product"], ["barter", "Product only (barter)"], ["ticket", "Event tickets / passes"], ["giveaway", "Giveaway for followers"], ["commission", "Commission on sales"]].map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
      <div className="fld"><label htmlFor="f-ui-reward-value-14">Reward value per creator ₹ <span className="opt">— product, ticket or prize value</span></label><input id="f-ui-reward-value-14" name="reward_value" defaultValue={v.reward_value ?? ""} /></div>
      <div className="fld"><label htmlFor="f-ui-commission-pct-15">Commission % <span className="opt">— commission deals</span></label><input id="f-ui-commission-pct-15" name="commission_pct" defaultValue={v.commission_pct ?? ""} placeholder="e.g. 10" /></div>
      <div className="fld"><label htmlFor="f-ui-brand-category-16">What creators see instead of the brand name</label><input id="f-ui-brand-category-16" name="brand_category" defaultValue={v.brand_category ?? ""} placeholder="A D2C skincare brand" /></div>
      <div className="fld"><label className="chip" style={{ marginTop: 22 }}><input type="checkbox" name="funded" value="1" defaultChecked={Boolean(v.funded)} /><span>Brand budget received (shows "Budget funded ✓")</span></label></div>
      <div className="fld"><label htmlFor="f-ui-payment-days-17">Creators paid within (days of going live)</label><input id="f-ui-payment-days-17" name="payment_days" defaultValue={v.payment_days ?? 30} /></div>
      <div className="fld"><label htmlFor="f-ui-revisions-18">Revision rounds included</label><input id="f-ui-revisions-18" name="revisions" defaultValue={v.revisions ?? 2} /></div>
      <div className="fld"><label htmlFor="f-ui-approve-hours-19">Drafts auto-approve after (hours)</label><input id="f-ui-approve-hours-19" name="approve_hours" defaultValue={v.approve_hours ?? 72} /></div>
      <div className="fld full"><label htmlFor="f-ui-mandatories-20">Must include <span className="opt">— one per line; becomes the creator's checklist</span></label><textarea id="f-ui-mandatories-20" name="mandatories" rows={3} placeholder={'Say "festive collection" in the first 5 seconds\nShow the pack front-on\nTag @brand and use #BrandFestive'} defaultValue={v.mandatories ?? ""} /></div>
      <div className="fld full"><label htmlFor="f-ui-exclusions-21">Must not <span className="opt">— banned words, competitor brands, claims</span></label><textarea id="f-ui-exclusions-21" name="exclusions" rows={2} placeholder={'No competitor products in frame\nDon\'t say "cure" or "best in India"'} defaultValue={v.exclusions ?? ""} /></div>
      <div className="fld"><label htmlFor="f-ui-brand-url-22">Brand landing page <span className="opt">— for tracked links</span></label><input id="f-ui-brand-url-22" name="brand_url" defaultValue={v.brand_url ?? ""} placeholder="https://brand.com/festive" /></div>
      <div className="fld"><label htmlFor="f-ui-promised-cpv-23">Promised CPV ₹ <span className="opt">— team only</span></label><input id="f-ui-promised-cpv-23" name="promised_cpv" defaultValue={v.promised_cpv ?? ""} placeholder="e.g. 0.25" /></div>
      <div className="fld"><label htmlFor="f-ui-usage-rights-24">Usage rights</label><select id="f-ui-usage-rights-24" name="usage_rights" defaultValue={v.usage_rights ?? "Organic posting only"}>{["Organic posting only", "Brand can repost on its own handles", "Paid ads (whitelisting) for 1 month", "Paid ads (whitelisting) for 3 months", "Paid ads (whitelisting) for 6 months"].map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
    </div>
  );
}
