import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, usageStatus, parseChannels, channelPhrase, prefillFromText, cleanUsage, toDate, UsageError } from "@/lib/net/usage";

const D = (s) => new Date(s);

test("months are calendar months, clamped at month end", () => {
  assert.equal(addMonths(D("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(addMonths(D("2028-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2028-02-29");
  assert.equal(addMonths(D("2026-12-12T10:00:00Z"), 3).toISOString(), "2027-03-12T10:00:00.000Z");
  assert.equal(addMonths(D("2026-05-15T00:00:00Z"), 12).toISOString().slice(0, 10), "2027-05-15");
});

test("database timestamps parse as UTC", () => {
  assert.equal(toDate("2026-11-17 10:00:00").toISOString(), "2026-11-17T10:00:00.000Z");
  assert.equal(toDate(""), null);
  assert.equal(toDate("not a date"), null);
});

test("active rights show channels, end date and days left", () => {
  const now = D("2027-01-26T06:00:00Z");
  const u = usageStatus({ usage_channels: "Paid ads (Meta)", usage_months: 3, usage_starts_at: "2026-12-12 05:00:00" }, now);
  assert.equal(u.state, "active");
  assert.equal(u.daysLeft, 45);
  assert.equal(u.line, "Usage rights: Paid ads on Meta until 12 Mar 2027 (45 days left)");
});

test("expired rights say so; the stored expiry wins over the computed one", () => {
  const u = usageStatus({ usage_channels: "Organic repost, Website", usage_months: 1, usage_starts_at: "2026-01-01 00:00:00", usage_expires_at: "2026-02-01 00:00:00" }, D("2026-02-04T12:00:00Z"));
  assert.equal(u.state, "expired");
  assert.match(u.line, /^Usage rights: Organic repost and Website expired on 1 Feb 2026 \(3 days ago\)$/);
  assert.ok(u.daysLeft < 0);
});

test("rights saved before go-live start on the live date", () => {
  const pending = usageStatus({ usage_channels: "Website", usage_months: 6 }, D("2026-11-17T00:00:00Z"));
  assert.equal(pending.state, "pending");
  assert.match(pending.line, /for 6 months from the day the post goes live/);
  const live = usageStatus({ usage_channels: "Website", usage_months: 6, live_at: "2026-11-01 08:00:00" }, D("2026-11-17T00:00:00Z"));
  assert.equal(live.state, "active");
  assert.equal(live.expires.toISOString(), "2027-05-01T08:00:00.000Z");
  assert.equal(usageStatus({}).state, "none");
});

test("last day reads 'ends today', not 0 days", () => {
  const u = usageStatus({ usage_channels: "Website", usage_expires_at: "2026-11-17 15:00:00", usage_months: 1 }, D("2026-11-17T05:00:00Z"));
  assert.equal(u.state, "active");
  assert.match(u.line, /\(ends today\)$/);
});

test("channels are cleaned and phrased", () => {
  assert.deepEqual(parseChannels(" Organic repost,, paid ads (Meta);Website, organic repost "), ["Organic repost", "paid ads (Meta)", "Website"]);
  assert.equal(channelPhrase(["Organic repost", "Paid ads (Meta)", "Website"]), "Organic repost, Paid ads on Meta and Website");
});

test("the campaign's usage text prefills the form", () => {
  assert.deepEqual(prefillFromText("Paid ads on Meta for 3 months + organic repost"), { channels: "Organic repost, Paid ads (Meta)", months: 3 });
  assert.deepEqual(prefillFromText("Website and YouTube ads, 1 year"), { channels: "Paid ads (Google/YouTube), Website", months: 12 });
  assert.deepEqual(prefillFromText("Organic posting only"), { channels: "Organic repost", months: null });
  assert.deepEqual(prefillFromText("In perpetuity, all media"), { channels: "In perpetuity, all media", months: null });
  assert.deepEqual(prefillFromText(""), { channels: "", months: null });
});

test("the team form is validated", () => {
  assert.throws(() => cleanUsage({ channels: "", months: 3 }), UsageError);
  for (const m of ["0", "61", "2.5", "x", ""]) assert.throws(() => cleanUsage({ channels: "Website", months: m }), UsageError, m);
  assert.throws(() => cleanUsage({ channels: "Website", months: 3, starts: "12/03/2026" }), UsageError);
  const a = cleanUsage({ channels: "Website", months: "3" }, "2026-11-01 08:00:00");
  assert.equal(a.expires.toISOString(), "2027-02-01T08:00:00.000Z");
  const b = cleanUsage({ channels: "Website", months: "2", starts: "2026-12-12" });
  assert.equal(b.starts.toISOString(), "2026-12-11T18:30:00.000Z");
  assert.equal(b.expires.toISOString(), "2027-02-11T18:30:00.000Z");
  const c = cleanUsage({ channels: "Website", months: 2 });
  assert.equal(c.starts, null);
  assert.equal(c.expires, null);
});
