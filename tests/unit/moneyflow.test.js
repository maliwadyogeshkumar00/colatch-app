// Colatch Money Flow: every split of a brand's money. Amounts are minor units (cents, paise).
// Rates here are illustrative test inputs, not commercial decisions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFlow, resolveRules, rulesFromSettings, assertBalanced, formatMinor, MoneyFlowError } from "@/lib/net/moneyflow";

const platform10 = { id: "p", party: "platform", side: "brand", label: "Colatch platform fee", bps: 1000, source: "default" };
const brandAgency10 = { id: "ba", party: "brand_agency", side: "brand", label: "Brand agency fee", bps: 1000, source: "default" };
const creatorAgency15 = { id: "ca", party: "creator_agency", side: "creator", label: "Creator agency commission", bps: 1500, source: "default" };
const ALL = [platform10, brandAgency10, creatorAgency15];

test("the brief's example: $1,000 budget → $100 platform, $100 agency, $800 creator", () => {
  const f = computeFlow({ currency: "USD", mode: "budget", amountMinor: 100000, kind: "brand_agency", rules: [platform10, brandAgency10] });
  assert.equal(f.brandPaysMinor, 100000);
  assert.equal(f.platformMinor, 10000);
  assert.equal(f.brandAgencyMinor, 10000);
  assert.equal(f.creatorNetMinor, 80000);
  assert.equal(f.creatorAgencyMinor, 0);
});

test("fees on top: the creator gets the agreed fee in full and the brand pays the platform fee on top", () => {
  const f = computeFlow({ currency: "INR", mode: "creator_fee", amountMinor: 4000000, kind: "direct", rules: [platform10] });
  assert.equal(f.creatorNetMinor, 4000000);
  assert.equal(f.platformMinor, 400000);
  assert.equal(f.brandPaysMinor, 4400000);
});

test("a direct deal never carries agency fees, even when general agency rules are configured", () => {
  const f = computeFlow({ currency: "INR", mode: "creator_fee", amountMinor: 1000000, kind: "direct", rules: ALL });
  assert.equal(f.brandAgencyMinor, 0);
  assert.equal(f.creatorAgencyMinor, 0);
  assert.deepEqual(f.rulesUsed.map((r) => r.id), ["p"]);
});

test("an agency rule pinned to a deal kind it cannot apply to is refused, not silently charged", () => {
  const bad = { ...brandAgency10, id: "x", appliesTo: ["direct"] };
  assert.throws(() => resolveRules([bad], "direct"), MoneyFlowError);
});

test("hybrid deal: platform and brand agency on top, creator agency deducted from the creator's fee", () => {
  const f = computeFlow({ currency: "EUR", mode: "creator_fee", amountMinor: 200000, kind: "hybrid", rules: ALL });
  assert.equal(f.platformMinor, 20000);
  assert.equal(f.brandAgencyMinor, 20000);
  assert.equal(f.creatorAgencyMinor, 30000);
  assert.equal(f.creatorNetMinor, 170000);
  assert.equal(f.brandPaysMinor, 240000);
  assertBalanced(f);
});

test("two rules of the same rank for the same party are refused: no double charging", () => {
  const dup = { ...platform10, id: "p2" };
  assert.throws(() => computeFlow({ currency: "USD", mode: "creator_fee", amountMinor: 1000, kind: "direct", rules: [platform10, dup] }), /twice/);
});

test("the same party cannot be paid by both the brand and the creator", () => {
  const both = { ...platform10, id: "p-c", side: "creator" };
  assert.throws(() => resolveRules([platform10, both], "direct"), /both the brand and the creator/);
});

test("overrides need a signed agreement; the most specific authorised rule wins", () => {
  const unsigned = { ...platform10, id: "acct", bps: 500, source: "account" };
  const r1 = resolveRules([platform10, unsigned], "direct");
  assert.equal(r1.rules[0].id, "p");
  assert.match(r1.notes[0], /no signed agreement/);

  const signed = { ...platform10, id: "agr", bps: 700, source: "agreement", agreementId: "AGR-2026-014" };
  const country = { ...platform10, id: "de", bps: 800, source: "country", country: "DE" };
  const r2 = resolveRules([platform10, country, signed], "direct", "DE");
  assert.equal(r2.rules[0].id, "agr");
  const r3 = resolveRules([platform10, country], "direct", "DE");
  assert.equal(r3.rules[0].id, "de");
  const r4 = resolveRules([platform10, country], "direct", "IN");
  assert.equal(r4.rules[0].id, "p", "a German rate never applies to an Indian deal");
});

test("taxes: a charge is added to the brand's bill; a withholding comes out of the creator and is shown", () => {
  const gst = { id: "gst", label: "GST on platform fee", on: "platform", bps: 1800, mode: "charge" };
  const tds = { id: "tds", label: "TDS", on: "creator", bps: 100, mode: "withhold" };
  const f = computeFlow({ currency: "INR", mode: "creator_fee", amountMinor: 4000000, kind: "direct", rules: [platform10], taxes: [gst, tds] });
  assert.equal(f.platformMinor, 400000);
  assert.equal(f.brandPaysMinor, 4000000 + 400000 + 72000);
  assert.equal(f.creatorNetMinor, 4000000 - 40000);
  assert.equal(f.taxMinor, 72000 + 40000);
  const tdsLine = f.lines.find((l) => l.key === "tax:tds");
  assert.equal(tdsLine.from, "creator");
  assert.match(tdsLine.why, /withheld/);
});

test("every deduction explains itself in plain words", () => {
  const f = computeFlow({ currency: "INR", mode: "creator_fee", amountMinor: 1000000, kind: "creator_agency", rules: [platform10, creatorAgency15] });
  const ca = f.lines.find((l) => l.key === "creator_agency:creator");
  assert.match(ca.why, /15% of the .*10,000.* creator fee/);
  assert.match(f.lines.find((l) => l.key === "creator:net").why, /commission/);
});

test("rounding never creates or loses money (odd amounts, many combinations)", () => {
  const rates = [1, 333, 999, 1000, 1250, 1500, 2000];
  for (const amt of [1, 7, 99, 101, 12345, 999999, 123456789]) {
    for (const a of rates) for (const b of rates) {
      for (const mode of ["creator_fee", "budget"]) {
        const rules = [{ ...platform10, bps: a }, { ...creatorAgency15, bps: b }];
        let f;
        try { f = computeFlow({ currency: "USD", mode, amountMinor: amt, kind: "creator_agency", rules, taxes: [{ id: "v", label: "VAT", on: "platform", bps: 1900, mode: "charge" }] }); }
        catch (e) { if (e instanceof MoneyFlowError) continue; throw e; }
        assertBalanced(f);
        assert.ok(f.lines.every((l) => Number.isInteger(l.amountMinor) && l.amountMinor >= 0));
      }
    }
  }
});

test("budget mode floors the carved fees so any rounding remainder stays with the creator", () => {
  const f = computeFlow({ currency: "USD", mode: "budget", amountMinor: 999, kind: "direct", rules: [{ ...platform10, bps: 333 }] });
  assert.equal(f.platformMinor, 33); // 33.27 floored
  assert.equal(f.creatorNetMinor, 966);
});

test("large amounts stay exact (no floating point)", () => {
  const f = computeFlow({ currency: "INR", mode: "creator_fee", amountMinor: 9_000_000_000_000, kind: "direct", rules: [{ ...platform10, bps: 1234 }] });
  assert.equal(f.platformMinor, 1_110_600_000_000);
});

test("zero-decimal and three-decimal currencies use their own minor units", () => {
  assert.equal(computeFlow({ currency: "JPY", mode: "creator_fee", amountMinor: 50000, kind: "direct", rules: [platform10] }).platformMinor, 5000);
  assert.equal(formatMinor(123456, "KWD", "en-US").includes("123.456"), true);
});

test("bad input is refused: unknown currency, fractional money, rates over 100%, fees swallowing the budget", () => {
  assert.throws(() => computeFlow({ currency: "XXX", mode: "budget", amountMinor: 1, kind: "direct", rules: [] }), /Unsupported currency/);
  assert.throws(() => computeFlow({ currency: "USD", mode: "budget", amountMinor: 10.5, kind: "direct", rules: [] }), /whole/);
  assert.throws(() => computeFlow({ currency: "USD", mode: "budget", amountMinor: 100, kind: "direct", rules: [{ ...platform10, bps: 10001 }] }), /basis points/);
  assert.throws(() => computeFlow({ currency: "USD", mode: "budget", amountMinor: 100, kind: "direct", rules: [{ ...platform10, bps: 10000 }] }), /whole .* budget/);
});

test("no settings means no fee is guessed", () => {
  const s = rulesFromSettings(null);
  assert.equal(s.configured, false);
  const f = computeFlow({ currency: "USD", mode: "creator_fee", amountMinor: 5000, kind: "direct", rules: s.rules });
  assert.equal(f.brandPaysMinor, 5000);
  assert.equal(f.creatorNetMinor, 5000);
  assert.throws(() => rulesFromSettings("{not json"), MoneyFlowError);
});
