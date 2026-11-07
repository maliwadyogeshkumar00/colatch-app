// Server-only. Pulls plain text out of an uploaded brief without extra dependencies.
// TXT/MD: as is. DOCX: unzip word/document.xml. PDF: inflate content streams and read text operators
// (good for most exported briefs; scanned PDFs have no text layer and fall back to Gemini when a key is set).
import { inflateRawSync, inflateSync } from "zlib";

export const MAX_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request body limit

export function kindOf(name = "", type = "") {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (n.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  if (/\.(txt|md|markdown|csv)$/.test(n) || type.startsWith("text/")) return "text";
  return null;
}

/* ---------- DOCX (zip) ---------- */
function unzipEntry(buf, wanted) {
  // End of central directory: signature 0x06054b50, search backwards (comment can be up to 64 KB)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a valid .docx file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString("utf8");
    if (name === wanted) {
      const ln = buf.readUInt16LE(local + 26), lx = buf.readUInt16LE(local + 28);
      const start = local + 30 + ln + lx, data = buf.slice(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error("Unsupported compression in .docx");
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error("No document body in .docx");
}
export function docxText(buf) {
  const xml = unzipEntry(buf, "word/document.xml").toString("utf8");
  return xml.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- PDF ---------- */
function pdfString(s) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (m, c) => ({ n: "\n", r: "", t: " ", b: "", f: "", "(": "(", ")": ")", "\\": "\\" }[c] ?? String.fromCharCode(parseInt(c, 8))));
}
function hexString(h) {
  h = h.replace(/\s/g, ""); if (h.length % 2) h += "0";
  let out = "";
  // two-byte (CID) text shows up as 00xx pairs; single-byte as xx
  const wide = h.length >= 4 && /^(00[0-9a-f]{2})+$/i.test(h);
  for (let i = 0; i < h.length; i += wide ? 4 : 2) out += String.fromCharCode(parseInt(h.slice(i, i + (wide ? 4 : 2)), 16));
  return out;
}
function textOps(content) {
  const out = [];
  // (..) Tj / ' / "  and [ (..) -200 (..) ] TJ ; T* and Td/TD/Tm start new lines
  const re = /\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|(T\*|Td|TD|Tm)\b/g;
  let m;
  while ((m = re.exec(content))) {
    if (m[4]) { out.push("\n"); continue; }
    if (m[2] != null) { out.push(pdfString(m[2])); continue; }
    if (m[3] != null) { out.push(hexString(m[3])); continue; }
    const parts = m[1].match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>|-?\d+(?:\.\d+)?/g) || [];
    for (const p of parts) {
      if (p[0] === "(") out.push(pdfString(p.slice(1, -1)));
      else if (p[0] === "<") out.push(hexString(p.slice(1, -1)));
      else if (parseFloat(p) < -180) out.push(" ");
    }
  }
  return out.join("");
}
export function pdfText(buf) {
  const s = buf.toString("latin1");
  const chunks = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, end = s.indexOf("endstream", start);
    if (end < 0) break;
    const head = s.slice(Math.max(0, m.index - 300), m.index);
    let data = buf.slice(start, end);
    if (/FlateDecode/.test(head)) { try { data = inflateSync(data); } catch { try { data = inflateRawSync(data.slice(2)); } catch { re.lastIndex = end; continue; } } }
    else if (/Filter/.test(head)) { re.lastIndex = end; continue; } // images, other encodings
    const t = textOps(data.toString("latin1"));
    if (t.trim()) chunks.push(t);
    re.lastIndex = end;
  }
  return chunks.join("\n").replace(/[^\S\n]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export function extractText(buf, kind) {
  if (kind === "text") return buf.toString("utf8");
  if (kind === "docx") return docxText(buf);
  if (kind === "pdf") return pdfText(buf);
  throw new Error("Upload a PDF, DOCX or TXT brief");
}
