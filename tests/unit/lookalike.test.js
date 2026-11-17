// Lookalike search scoring: lib/net/lookalike.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lookalikeScore, rankLookalikes, followerCloseness, engagementCloseness, prefilter, whyLine, WEIGHTS } from "@/lib/net/lookalike";

const seed = { id: "s", handle: "seed", skills: "Dancer, Model", niche: "Fashion, Beauty", city: "Mumbai", state: "Maharashtra", language: "Hindi, English",
  followers: 50_000, engagement_rate: 4, platforms: ["youtube"], audience: { gender: { women: 70, men: 29, other: 1 }, age: { "18-24": 60, "25-34": 40 } } };

test("weights add up to 100", () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test("follower closeness is on a log scale", () => {
  assert.equal(followerCloseness(50_000, 50_000), 1);
  assert.equal(followerCloseness(10_000, 100_000), 0, "10x apart scores nothing");
  assert.ok(Math.abs(followerCloseness(10_000, Math.round(10_000 * Math.sqrt(10))) - 0.5) < 0.001);
  assert.equal(followerCloseness(null, 5000), 0);
  assert.ok(followerCloseness(5_000, 10_000) === followerCloseness(500_000, 1_000_000), "same ratio, same closeness at any size");
});

test("engagement closeness falls to 0 at 3x apart", () => {
  assert.equal(engagementCloseness(3, 3), 1);
  assert.equal(engagementCloseness(1, 3), 0);
  assert.equal(engagementCloseness(null, 3), 0);
});

test("an identical creator scores 100; a stranger scores near 0", () => {
  assert.equal(lookalikeScore(seed, { ...seed, id: "twin", handle: "twin" }).score, 100);
  const far = { id: "f", handle: "far", skills: "Gamer", niche: "Gaming", city: "Kochi", language: "Malayalam", followers: 2_000_000, engagement_rate: 0.5, platforms: [] };
  assert.equal(lookalikeScore(seed, far).score, 0);
});

test("missing data scores nothing rather than guessing", () => {
  const bare = { id: "b", handle: "bare" };
  assert.equal(lookalikeScore(seed, bare).score, 0);
  const nicheOnly = lookalikeScore(seed, { id: "n", handle: "n", niche: "fashion" });
  assert.equal(nicheOnly.score, 20, "overlap is a share of the smaller list: their one niche is one of the seed's");
  assert.deepEqual(nicheOnly.reasons, ["Same niche: Fashion"]);
});

test("reasons explain the score, biggest first", () => {
  const c = { id: "c", handle: "c", skills: "Dancer", niche: "Fashion", city: "mumbai", language: "Hindi", followers: 60_000, engagement_rate: 4.2, platforms: ["youtube", "moj"] };
  const r = lookalikeScore(seed, c);
  assert.ok(r.score > 70, `score ${r.score}`);
  assert.equal(r.reasons[0], "Also Dancer");
  assert.ok(r.reasons.includes("Also in mumbai"));
  assert.ok(r.reasons.some((x) => x.startsWith("Similar size")));
  assert.ok(r.reasons.includes("Also on YouTube"));
  assert.equal(whyLine(r.reasons).split(" · ").length, 3);
  assert.match(whyLine([]), /Few shared details/);
});

test("same state counts a little when the city differs", () => {
  const r = lookalikeScore(seed, { id: "p", handle: "p", city: "Pune", state: "maharashtra" });
  assert.equal(r.score, 4);
  assert.deepEqual(r.reasons, ["Same state (maharashtra)"]);
});

test("ranking drops the seed and duplicates, sorts by score, and caps the list", () => {
  const cands = [
    { id: "s", handle: "seed", ...seed },
    { id: "a", handle: "a", niche: "Fashion", followers: 40_000 },
    { id: "b", handle: "b", niche: "Fashion", skills: "Dancer", city: "Mumbai", followers: 45_000 },
    { id: "b", handle: "b-dupe", niche: "Fashion" },
    { id: "z", handle: "z" },
  ];
  const out = rankLookalikes(seed, cands, 8);
  assert.deepEqual(out.map((x) => x.creator.id), ["b", "a"], "zero scores are left out");
  assert.equal(rankLookalikes(seed, cands, 1).length, 1);
  assert.ok(out[0].why.length > 0);
});

test("the SQL prefilter uses niche, city and a ~3x follower window", () => {
  const p = prefilter(seed);
  assert.match(p.sql, /niche LIKE \? OR niche LIKE \? OR city LIKE \? OR \(followers BETWEEN \? AND \?\)/);
  assert.deepEqual(p.args, ["%Fashion%", "%Beauty%", "Mumbai", 15811, 158114]);
  assert.match(p.order, /ln\(\?::float8\)/);
  assert.equal(prefilter({ id: "x", handle: "x" }), null);
});
