"use client";
// #49 Live brief strength while the brand types (rules only, no network).
import { useEffect, useState } from "react";

const RULES = [
  [/\b(dancer|singer|chef|comedian|actor|model|creator|influencer|anchor|rapper|musician|fitness|makeup|mom|vlogger|gamer)s?\b/i, "who you need"],
  [/\b(reel|story|stories|post|video|ugc|live|short)s?\b/i, "what to post"],
  [/(₹|rs\.?|inr|\blakh|\bk\b|\d{4,})/i, "a budget"],
  [/\b(delhi|mumbai|bengaluru|bangalore|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|lucknow|chandigarh|gurugram|noida|kochi|indore|surat|india|pan[- ]india)\b/i, "a city"],
  [/\b(\d+\s?k|\d+\s?l|lakh|followers)\b/i, "creator size"],
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|diwali|holi|eid|lohri|onam|pongal|navratri|wedding|ipl|week|month|\d{1,2}\/\d{1,2})\w*/i, "a date"],
  [/\b(hindi|english|hinglish|punjabi|tamil|telugu|marathi|bengali|gujarati|kannada|malayalam)\b/i, "a language"],
];

export default function BriefMeter({ target }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    const on = () => setText(el.value || "");
    on(); el.addEventListener("input", on);
    return () => el.removeEventListener("input", on);
  }, [target]);
  const hit = RULES.filter(([re]) => re.test(text));
  const miss = RULES.filter(([re]) => !re.test(text)).map(([, l]) => l);
  const score = Math.round((hit.length / RULES.length) * 100);
  if (!text.trim()) return null;
  return (
    <div className="meter" aria-live="polite">
      <span>Brief strength <b>{score}</b></span>
      <span className="bar"><i style={{ width: `${score}%` }} /></span>
      <span>{miss.length ? `Add ${miss.slice(0, 2).join(" and ")}` : "Great detail"}</span>
    </div>
  );
}
