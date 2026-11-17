// Tiny, safe emphasis markup for titles: "Briefs in, <b>right creators</b> out." becomes React nodes.
// Supports <b>…</b> (purple, or gold on dark bands), <em>…</em> (gold foil) and <br>. Everything else is text,
// so a title can never inject HTML. Nodes pass through untouched.
import { createElement, Fragment } from "react";

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&rsquo;": "’", "&lsquo;": "‘", "&middot;": "·", "&times;": "×" };
const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp|rsquo|lsquo|middot|times);/g, (m) => ENT[m]);

export function rich(v) {
  if (typeof v !== "string") return v;
  if (!/[<&]/.test(v)) return v;
  const parts = v.split(/(<b>[\s\S]*?<\/b>|<em>[\s\S]*?<\/em>|<br\s*\/?>)/g);
  return createElement(Fragment, null, ...parts.map((p, i) => {
    let m;
    if ((m = p.match(/^<b>([\s\S]*)<\/b>$/))) return createElement("b", { key: i }, decode(m[1]));
    if ((m = p.match(/^<em>([\s\S]*)<\/em>$/))) return createElement("em", { key: i }, decode(m[1]));
    if (/^<br/.test(p)) return createElement("br", { key: i });
    return p ? decode(p) : null;
  }));
}

/** Plain text of a title (for aria-labels and <title>): tags dropped, entities decoded. */
export const plain = (v) => (typeof v === "string" ? decode(v.replace(/<[^>]+>/g, "")) : "");

/** Join class names, skipping falsy ones. */
export const cx = (...a) => a.filter(Boolean).join(" ");
