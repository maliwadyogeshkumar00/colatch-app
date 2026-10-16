import { NextResponse } from "next/server";
import { regexRead, clean, reviewRows, summarise } from "../../../lib/brief";
import { kindOf, extractText, MAX_BYTES } from "../../../lib/extract";
import { aiBrief, aiBriefFile, hasAI } from "../../../lib/ai";
import { limited, tooMany, bad, readJson } from "../../../lib/guard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST JSON { text, base? }            → read a written brief, or a refinement on top of `base`
// POST multipart { file }              → read an uploaded PDF / DOCX / TXT brief
// Always answers with exact QUESTIONS options plus a review table (value, confidence, missing).
export async function POST(req) {
  const wait = limited(req, "brief", 20, 60_000); if (wait) return tooMany(wait);
  try {
    const type = req.headers.get("content-type") || "";
    let text = "", base = {}, fileRead = null, fileName = null, pages = null;

    if (type.includes("multipart/form-data")) {
      const len = Number(req.headers.get("content-length") || 0);
      if (len > MAX_BYTES + 64 * 1024) return bad("That file is over 4 MB. Export a lighter PDF or paste the text.", 413);
      const form = await req.formData();
      const f = form.get("file");
      if (!f || typeof f === "string") return bad("Attach a brief first.");
      if (f.size > MAX_BYTES) return bad("That file is over 4 MB. Export a lighter PDF or paste the text.", 413);
      fileName = String(f.name || "brief").slice(0, 120);
      const kind = kindOf(fileName, f.type || "");
      if (!kind) return bad("Upload a PDF, DOCX or TXT brief. For slides, export them as PDF.");
      const buf = Buffer.from(await f.arrayBuffer());
      try { text = extractText(buf, kind); } catch (e) { text = ""; }
      if (kind === "pdf") pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length || null;
      // scanned PDF or odd encoding: let the model read the file itself
      if (text.replace(/\s/g, "").length < 120 && kind === "pdf" && hasAI()) {
        try { fileRead = await aiBriefFile(buf, "application/pdf"); } catch {}
      }
      if (!fileRead && text.replace(/\s/g, "").length < 40) {
        return bad("We couldn't find readable text in that file (it may be a scan). Paste the brief as text instead.", 422);
      }
    } else {
      const body = await readJson(req, 64 * 1024);
      text = typeof body.text === "string" ? body.text.slice(0, 20000) : "";
      base = clean(body.base || {});
      if (text.trim().length < 3) return bad("Write a sentence or two about the campaign first.");
    }

    // 1) rules, always   2) model, when configured — model values win only when they are valid options
    const rx = regexRead(text);
    let ai = null;
    if (!fileRead && hasAI() && text) { try { ai = await aiBrief(text, base); } catch {} }
    const m = fileRead || ai;
    const found = { ...rx.answers, ...(m ? m.answers : {}) };
    const confidence = { ...rx.confidence, ...(m ? m.confidence : {}) };
    const answers = { ...base, ...found };
    const name = (m && m.name) || rx.name || null;
    const changed = Object.keys(found).filter((k) => base[k] !== found[k]);

    return NextResponse.json({
      ok: true, ai: !!m, file: fileName, pages,
      name, summary: (m && m.summary) || summarise(name, answers),
      answers, changed,
      rows: reviewRows(found, confidence, base),
      chars: text.length,
    });
  } catch (e) {
    return bad(e.status ? e.message : "We couldn't read that brief. Try again or paste the text.", e.status || 500);
  }
}
