// Reconciliation between deals and the append-only money ledger. Each check returns the rows that disagree.
// Deals recorded before the ledger existed (schema v4) also show up here: they need a manual note, not a fix in code.
import { env } from "@/lib/net/env";

export const CHECKS = [
  {
    key: "paid_no_payout",
    title: "Marked paid, but no payout in the ledger",
    help: "The deal says the creator was paid, but no 'Paid to creator' row exists. Check the bank and record it, or correct the deal.",
    sql: `SELECT d.id, d.brand, d.fee, d.pay_status, d.utr FROM creator_deals d
          WHERE d.pay_status = 'paid' AND NOT EXISTS (SELECT 1 FROM finance_ledger l WHERE l.deal_id = d.id AND l.kind = 'creator_payout_sent')
          ORDER BY d.updated_at DESC LIMIT 100`,
  },
  {
    key: "funded_no_payment",
    title: "Brand payment status set, but no payment in the ledger",
    help: "Funded, released or paid deals need a 'Brand paid Colatch' row with its bank reference.",
    sql: `SELECT d.id, d.brand, d.fee, d.pay_status, NULL AS utr FROM creator_deals d
          WHERE d.pay_status IN ('funded','released','paid') AND NOT EXISTS (SELECT 1 FROM finance_ledger l WHERE l.deal_id = d.id AND l.kind = 'brand_payment_received')
          ORDER BY d.updated_at DESC LIMIT 100`,
  },
  {
    key: "orphan_ledger",
    title: "Ledger rows pointing at a deal that doesn't exist",
    help: "Money was recorded against a deal id that is not in the system.",
    sql: `SELECT l.deal_id AS id, NULL AS brand, NULL AS fee, l.kind AS pay_status, l.utr FROM finance_ledger l
          WHERE l.deal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM creator_deals d WHERE d.id = l.deal_id) ORDER BY l.id DESC LIMIT 100`,
  },
  {
    key: "payout_over_fee",
    title: "Payout plus TDS above the agreed fee",
    help: "The amount sent to the creator and the TDS together exceed the fee on the deal.",
    sql: `SELECT d.id, d.brand, d.fee, d.pay_status, l.utr FROM finance_ledger l JOIN creator_deals d ON d.id = l.deal_id
          WHERE l.kind = 'creator_payout_sent' AND l.amount_paise + l.tds_paise > COALESCE(d.fee, 0) * 100 ORDER BY l.id DESC LIMIT 100`,
  },
  {
    key: "funding_mismatch",
    title: "Locked brand price differs from the recorded payment",
    help: "The price frozen on the deal is not what the ledger says the brand paid. Check for a part-payment or a typo.",
    sql: `SELECT d.id, d.brand, d.fee, d.pay_status, l.utr FROM finance_ledger l JOIN creator_deals d ON d.id = l.deal_id
          WHERE l.kind = 'brand_payment_received' AND d.brand_paid_paise IS NOT NULL AND d.brand_paid_paise <> l.amount_paise ORDER BY l.id DESC LIMIT 100`,
  },
];

/** Runs every check. Returns [{ key, title, help, rows }]. */
export async function reconcile(database = env.DB) {
  const out = [];
  for (const c of CHECKS) {
    const rows = (await database.prepare(c.sql).all().catch(() => ({ results: [] }))).results ?? [];
    out.push({ key: c.key, title: c.title, help: c.help, rows });
  }
  return out;
}

export const KIND_LABEL = {
  brand_payment_received: "Brand paid Colatch",
  creator_payout_sent: "Paid to creator",
  brand_refund_sent: "Refunded to brand",
  referral_payout_sent: "Referral payout",
  adjustment: "Adjustment",
};
