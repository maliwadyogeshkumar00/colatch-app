// Validation for other platforms and the shipping address: lib/net/creators.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validPincode, indianMobile, addressFromForm, cleanPlatformHandle, httpUrl, platformFromForm, sortPlatforms, PLATFORMS } from "@/lib/net/creators";

const form = (o) => ({ get: (k) => (k in o ? o[k] : null) });

test("PIN codes are 6 digits and never start with 0", () => {
  assert.equal(validPincode("110001"), "110001");
  assert.equal(validPincode(" 400 050 "), "400050");
  assert.equal(validPincode("011001"), null);
  assert.equal(validPincode("11001"), null);
  assert.equal(validPincode("1100011"), null);
  assert.equal(validPincode("11000a"), null);
  assert.equal(validPincode(""), null);
});

test("Indian mobile numbers are normalised to 10 digits", () => {
  assert.equal(indianMobile("98765 43210"), "9876543210");
  assert.equal(indianMobile("+91 98765-43210"), "9876543210");
  assert.equal(indianMobile("09876543210"), "9876543210");
  assert.equal(indianMobile("12345"), null);
  assert.equal(indianMobile("5876543210"), null, "Indian mobiles start with 6–9");
  assert.equal(indianMobile("98765abcde"), null);
});

test("shipping address: required parts, PIN and phone are checked", () => {
  const ok = { ship_name: "Priya S", line1: "Flat 4, Sea View", line2: "", ship_city: "Mumbai", ship_state: "Maharashtra", pincode: "400050", ship_phone: "+919876543210" };
  const r = addressFromForm(form(ok));
  assert.equal(r.error, null);
  assert.deepEqual(r.value, { name: "Priya S", line1: "Flat 4, Sea View", line2: null, city: "Mumbai", state: "Maharashtra", pincode: "400050", phone: "9876543210" });
  assert.match(addressFromForm(form({ ...ok, pincode: "4000" })).error, /6 digits/);
  assert.match(addressFromForm(form({ ...ok, ship_phone: "123" })).error, /10-digit/);
  assert.equal(addressFromForm(form({ ...ok, ship_phone: "" })).value.phone, null, "phone is optional");
  assert.match(addressFromForm(form({ ...ok, line1: "  " })).error, /first line/);
  assert.match(addressFromForm(form({ ...ok, ship_name: "" })).error, /name/);
  assert.match(addressFromForm(form({ ...ok, ship_city: "" })).error, /city/);
  assert.equal(addressFromForm(form({ ...ok, line1: "<b>Flat</b> 4" })).value.line1, "bFlat/b 4", "angle brackets are dropped");
});

test("platform handles and links", () => {
  assert.equal(cleanPlatformHandle("@priya.dances"), "priya.dances");
  assert.equal(cleanPlatformHandle("priya dances"), null);
  assert.equal(cleanPlatformHandle(""), null);
  assert.equal(cleanPlatformHandle("a".repeat(61)), null);
  assert.equal(httpUrl("https://youtube.com/@priya"), "https://youtube.com/@priya");
  assert.equal(httpUrl("javascript:alert(1)"), null);
  assert.equal(httpUrl("ftp://youtube.com/x"), null);
  assert.equal(httpUrl("https://you tube.com"), null);
  assert.equal(httpUrl("https://localhost/x"), null);
});

test("platform form: link must match the platform, a pasted link fills the handle, numbers parse", () => {
  const yt = platformFromForm(form({ platform: "youtube", handle: "@priya", url: "https://www.youtube.com/@priya", followers: "1.2L", avg_views: "30K" }));
  assert.equal(yt.error, null);
  assert.deepEqual(yt.value, { platform: "youtube", handle: "priya", url: "https://www.youtube.com/@priya", followers: 120000, avg_views: 30000 });
  assert.match(platformFromForm(form({ platform: "youtube", handle: "priya", url: "https://evil.example.com/x" })).error, /isn't a YouTube link/);
  assert.match(platformFromForm(form({ platform: "youtube", handle: "priya", url: "javascript:alert(1)" })).error, /https:\/\//);
  assert.match(platformFromForm(form({ platform: "tiktok", handle: "priya" })).error, /Pick a platform/);
  assert.match(platformFromForm(form({ platform: "x", handle: "" })).error, /Add your X handle/);
  assert.match(platformFromForm(form({ platform: "x", handle: "bad handle!" })).error, /letters, numbers/);
  assert.match(platformFromForm(form({ platform: "x", handle: "priya", followers: "lots" })).error, /Followers should be a number/);
  const pasted = platformFromForm(form({ platform: "linkedin", handle: "https://www.linkedin.com/in/priya-s/" }));
  assert.equal(pasted.value.handle, "priya-s");
  assert.equal(pasted.value.url, "https://www.linkedin.com/in/priya-s/");
  assert.equal(platformFromForm(form({ platform: "x", handle: "priya", url: "https://twitter.com/priya" })).error, null, "twitter.com links count as X");
});

test("platforms are shown in a fixed order and unknown ones are hidden", () => {
  assert.deepEqual(sortPlatforms([{ platform: "x" }, { platform: "tiktok" }, { platform: "youtube" }]).map((p) => p.platform), ["youtube", "x"]);
  assert.equal(PLATFORMS.length, 9);
});
