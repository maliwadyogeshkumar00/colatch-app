// Shared lists and helpers for the creator pitch board (reverse briefs).
export const PITCH_CATEGORIES = ["Skincare", "Makeup", "Fashion", "Jewellery", "Food brand", "Café or restaurant", "Fitness", "Health", "Fintech app", "Tech gadget", "Travel", "Home decor", "Kids", "Education", "Gaming (non-money)", "Auto", "Wedding"];
export const PITCH_FORMATS = ["Reel", "Reel + Stories", "UGC video", "Live"];
export const PITCH_OCCASIONS = ["Diwali", "Wedding season", "Monsoon", "IPL", "Valentine's", "Back to college", "Any time"];
export const MAX_LIVE_PITCHES = 5;

/** First name only, so brands see a person but not a handle. */
export function firstName(name, handle) {
  const n = String(name || "").replace(/^DEMO\s+/i, "").trim().split(/\s+/)[0];
  return n || "A creator";
}
