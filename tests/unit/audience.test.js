// Audience demographics: lib/net/audience.ts (self-reported from Instagram Insights).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAudience, readAudience, audienceSummary, audienceSourceLabel, audienceSimilarity, formatAudience, audienceFormValues, shortDate, pct, ageField, cityField, cityPctField, genderField, AGE_BANDS } from "@/lib/net/audience";

const form = (o) => ({ get: (k) => (k in o ? o[k] : null) });
const full = {
  [cityField(1)]: "Delhi", [cityPctField(1)]: "18", [cityField(2)]: "Mumbai", [cityPctField(2)]: "31%",
  [genderField("women")]: "62", [genderField("men")]: "36", [genderField("other")]: "2",
  [ageField("13-17")]: "3", [ageField("18-24")]: "45", [ageField("25-34")]: "38", [ageField("35-44")]: "10", [ageField("45+")]: "4",
};

test("percent parser accepts Insights-style numbers and rejects junk", () => {
  assert.equal(pct("31"), 31);
  assert.equal(pct(" 31.5 % "), 31.5);
  assert.equal(pct(""), null);
  assert.ok(Number.isNaN(pct("abc")));
  assert.ok(Number.isNaN(pct("-4")));
  assert.ok(Number.isNaN(pct("1000")));
});

test("a full, correct split is stored with derived top city and core age band", () => {
  const { audience, errors } = parseAudience(form(full));
  assert.deepEqual(errors, []);
  assert.equal(audience.cities[0].name, "Mumbai", "cities are sorted biggest first");
  assert.equal(audience.top_city, "Mumbai");
  assert.equal(audience.core_age, "18-24");
  assert.deepEqual(audience.gender, { women: 62, men: 36, other: 2 });
  assert.equal(audience.age["45+"], 4);
});

test("groups must add up to about 100 (±3)", () => {
  assert.deepEqual(parseAudience(form({ ...full, [genderField("other")]: "5" })).errors, [], "103 is inside the tolerance");
  const g = parseAudience(form({ ...full, [genderField("other")]: "6" }));
  assert.equal(g.audience, null);
  assert.match(g.errors.join(" "), /Gender adds up to 104%/);
  const a = parseAudience(form({ ...full, [ageField("45+")]: "" }));
  assert.match(a.errors.join(" "), /Age groups add up to 96%/);
});

test("numbers must be 0–100 and cities need both a name and a %", () => {
  assert.match(parseAudience(form({ ...full, [genderField("women")]: "162" })).errors.join(" "), /0 to 100/);
  assert.match(parseAudience(form({ [cityField(1)]: "Pune" })).errors.join(" "), /add the % for Pune/);
  assert.match(parseAudience(form({ [cityPctField(1)]: "20" })).errors.join(" "), /add the city name/);
  assert.match(parseAudience(form({ [cityField(1)]: "Pune", [cityPctField(1)]: "60", [cityField(2)]: "Goa", [cityPctField(2)]: "50" })).errors.join(" "), /can't be more than 100%/);
  assert.match(parseAudience(form({ [cityField(1)]: "Pune", [cityPctField(1)]: "20", [cityField(2)]: "pune", [cityPctField(2)]: "10" })).errors.join(" "), /listed twice/);
});

test("an empty form is refused; a single group on its own is fine", () => {
  assert.match(parseAudience(form({})).errors.join(" "), /at least one part/);
  const only = parseAudience(form({ [genderField("women")]: "70", [genderField("men")]: "30" }));
  assert.deepEqual(only.errors, []);
  assert.equal(only.audience.age, null);
  assert.equal(only.audience.core_age, null);
});

test("audienceSummary gives the short line the deal room shows", () => {
  const { audience } = parseAudience(form(full));
  assert.equal(audienceSummary({ audience }), "62% women · 18-24 · Mumbai 31%");
  assert.equal(audienceSummary({ audience: JSON.stringify(audience) }), "62% women · 18-24 · Mumbai 31%", "JSON text from the database works too");
  assert.equal(audienceSummary({ audience: { gender: { women: 30, men: 70, other: 0 } } }), "70% men");
  assert.equal(audienceSummary({ audience: null }), "");
  assert.equal(audienceSummary({}), "");
  assert.equal(audienceSummary({ audience: "not json" }), "");
});

test("readAudience cleans hand-edited or broken rows", () => {
  assert.equal(readAudience({ cities: [{ name: "", pct: 10 }], gender: { women: "x" } }), null);
  const a = readAudience({ cities: [{ name: "Goa<script>", pct: 140 }, { name: "Pune", pct: 12 }] });
  assert.deepEqual(a.cities, [{ name: "Pune", pct: 12 }]);
});

test("the label says where the numbers come from and when", () => {
  const at = new Date("2026-11-16T10:00:00Z");
  assert.equal(audienceSourceLabel({ audience_source: "self_reported", audience_updated_at: at }), "Self-reported from Instagram Insights · updated 16 Nov 2026");
  assert.match(audienceSourceLabel({ audience_source: "team_checked", audience_updated_at: at }), /checked against a screenshot by Colatch · updated 16 Nov 2026/);
  assert.equal(shortDate("2026-11-16 20:00:00"), "17 Nov 2026", "UTC text is shown in India time");
  assert.equal(shortDate(null), "");
});

test("form values round-trip", () => {
  const { audience } = parseAudience(form(full));
  const again = parseAudience(form(audienceFormValues(audience)));
  assert.deepEqual(again.audience, audience);
});

test("similarity is 1 for identical splits and lower for different ones", () => {
  const { audience: a } = parseAudience(form(full));
  assert.equal(audienceSimilarity(a, a), 1);
  const b = parseAudience(form({ [genderField("women")]: "10", [genderField("men")]: "90", [ageField("45+")]: "100" })).audience;
  assert.ok(audienceSimilarity(a, b) < 0.5);
  assert.equal(audienceSimilarity(a, null), null);
  assert.equal(formatAudience(a).age.length, AGE_BANDS.length);
});

test("dates print the same from every source format", () => {
  assert.equal(shortDate("2026-11-16 10:00:00.123+00"), "16 Nov 2026", "Postgres timestamptz text");
  assert.equal(shortDate("2026-11-16T10:00:00Z"), "16 Nov 2026");
  assert.equal(shortDate("2026-11-16"), "16 Nov 2026");
  assert.equal(shortDate("2026-09-05T10:00:00Z"), "5 Sep 2026", "fixed month names, never 'Sept'");
  assert.equal(shortDate("nonsense"), "");
});
