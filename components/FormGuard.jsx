"use client";
// Stops double submits everywhere: once a form is submitted, its submit buttons are disabled until
// the page changes (or 8 seconds pass, or the browser restores the page from history).
// Mounted once in the network layout; no setup needed per form. Opt out with data-allow-resubmit.
import { useEffect } from "react";

const BUTTONS = 'button[type="submit"], button:not([type]), input[type="submit"]';

export default function FormGuard() {
  useEffect(() => {
    const busy = new Map(); // form -> { href, at }
    const release = (form) => {
      busy.delete(form);
      delete form.dataset.submitting;
      form.querySelectorAll(BUTTONS).forEach((b) => { if (b.dataset.fgDisabled) { b.disabled = false; b.removeAttribute("aria-busy"); delete b.dataset.fgDisabled; } });
    };
    const releaseAll = () => [...busy.keys()].forEach(release);
    const onSubmit = (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.hasAttribute("data-allow-resubmit")) return;
      if (form.dataset.submitting === "1") { e.preventDefault(); e.stopImmediatePropagation(); return; }
      form.dataset.submitting = "1";
      busy.set(form, { href: location.href, at: Date.now() });
      // Disable after this event finishes, so the clicked button's name/value is still sent.
      setTimeout(() => {
        if (!busy.has(form)) return;
        form.querySelectorAll(BUTTONS).forEach((b) => { if (!b.disabled) { b.disabled = true; b.setAttribute("aria-busy", "true"); b.dataset.fgDisabled = "1"; } });
      }, 0);
    };
    const tick = setInterval(() => {
      for (const [form, s] of busy) if (!form.isConnected || location.href !== s.href || Date.now() - s.at > 8000) release(form);
    }, 250);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("pageshow", releaseAll);
    window.addEventListener("popstate", releaseAll);
    return () => { clearInterval(tick); document.removeEventListener("submit", onSubmit, true); window.removeEventListener("pageshow", releaseAll); window.removeEventListener("popstate", releaseAll); };
  }, []);
  return null;
}
