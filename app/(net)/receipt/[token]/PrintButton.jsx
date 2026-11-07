"use client";
// Opens the browser print dialog, where brands can also choose "Save as PDF".
export default function PrintButton({ className = "btn", children = "Print or save as PDF" }) {
  return <button type="button" className={className} onClick={() => window.print()}>{children}</button>;
}
