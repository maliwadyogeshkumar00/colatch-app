// CSV of the money ledger for finance roles (for the CA or a spreadsheet). Same filters as the page.
import { NextResponse } from "next/server";
import { currentTeam } from "@/lib/net/creatorAuth";
import { can, audit } from "@/lib/net/security";
import { env } from "@/lib/net/env";
import { KIND_LABEL } from "../reconcile";

export const dynamic = "force-dynamic";

const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : "");
// Quote every cell and neutralise spreadsheet formulas (=, +, -, @ at the start).
const cell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

export async function GET(req) {
  const me = await currentTeam().catch(() => null);
  if (!me) return NextResponse.redirect(new URL("/team/login", req.url), 303);
  if (!can(me.role, "finance")) return new NextResponse("Your role can't export payment records.", { status: 403 });
  const u = new URL(req.url);
  const kind = KIND_LABEL[u.searchParams.get("kind")] ? u.searchParams.get("kind") : "";
  const from = day(u.searchParams.get("from")), to = day(u.searchParams.get("to"));
  const where = [], vals = [];
  if (kind) { where.push("l.kind = ?"); vals.push(kind); }
  if (from) { where.push("l.at >= ?::date"); vals.push(from); }
  if (to) { where.push("l.at < (?::date + 1)"); vals.push(to); }
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.at, l.kind, l.deal_id, l.campaign_id, l.amount_paise, l.tds_paise, l.utr, l.method, l.actor_id, d.brand, c.name AS creator
     FROM finance_ledger l LEFT JOIN creator_deals d ON d.id = l.deal_id LEFT JOIN creators c ON c.id = d.creator_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY l.id ASC LIMIT 20000`
  ).bind(...vals).all()).results ?? [];
  const head = ["Entry", "Recorded at (UTC)", "Type", "Deal", "Campaign", "Creator", "Brand", "Amount (Rs)", "TDS (Rs)", "Bank reference", "Method", "Recorded by"];
  const lines = [head.map(cell).join(",")].concat(rows.map((r) => [
    r.id, new Date(r.at).toISOString(), KIND_LABEL[r.kind] || r.kind, r.deal_id, r.campaign_id, r.creator, r.brand,
    (Number(r.amount_paise) / 100).toFixed(2), (Number(r.tds_paise) / 100).toFixed(2), r.utr, r.method, r.actor_id,
  ].map(cell).join(",")));
  await audit({ kind: "team", id: me.email }, "finance.export", "finance_ledger", null, { rows: rows.length, kind: kind || null, from: from || null, to: to || null });
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="colatch-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
