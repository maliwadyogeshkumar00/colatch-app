"use client";
// Small browser-side bits the team pages need (React does not allow inline onchange="..." strings).
import { useState } from "react";

/** <select> that submits its form as soon as the value changes. */
export function AutoSelect({ children, ...props }) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()}>{children}</select>;
}

/** Copies a URL to the clipboard and says so. */
export function CopyButton({ url, label = "Copy link", className = "btn sm" }) {
  const [done, setDone] = useState(false);
  return (
    <button className={className} type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copy this link", url); }
      setDone(true); setTimeout(() => setDone(false), 1600);
    }}>{done ? "Copied ✓" : label}</button>
  );
}
