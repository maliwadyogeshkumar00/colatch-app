// Gifting and product seeding: product shipments per deal, and the creator's private shipping address.
// The address is for the Colatch team only; brands only ever see the shipment status.
import { env } from './env';

export const SHIP_STATUSES = ['pending', 'shipped', 'delivered', 'returned'] as const;
export type ShipStatus = (typeof SHIP_STATUSES)[number];

export const SHIP_LABEL: Record<ShipStatus, string> = {
  pending: 'Packing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  returned: 'Returned',
};

/** pending → shipped → delivered, and a shipped or delivered product can come back (returned). */
const NEXT: Record<ShipStatus, ShipStatus[]> = {
  pending: ['shipped'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  returned: [],
};

export const nextStatuses = (from: string): ShipStatus[] => NEXT[from as ShipStatus] ?? [];
export const canMove = (from: string, to: string): boolean => nextStatuses(from).includes(to as ShipStatus);

export class ShipError extends Error {}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Checks the "add shipment" form. A shipment can start as pending, or as shipped when the AWB is known. */
export function cleanShipment(input: { product?: unknown; carrier?: unknown; awb?: unknown; note?: unknown; status?: unknown }) {
  const product = clip(input.product, 200);
  if (product.length < 2) throw new ShipError('Say what is being sent, for example "Diwali hamper, 2 kurtas (M)".');
  const carrier = clip(input.carrier, 80) || null;
  const awb = clip(input.awb, 40).replace(/\s/g, '') || null;
  if (awb && !/^[A-Za-z0-9-]{4,40}$/.test(awb)) throw new ShipError('The AWB / tracking number can only have letters, numbers and dashes.');
  const status: ShipStatus = String(input.status ?? '') === 'shipped' ? 'shipped' : 'pending';
  if (status === 'shipped' && (!carrier || !awb)) throw new ShipError('To mark it shipped, add the courier and the AWB number.');
  const note = clip(input.note, 500) || null;
  return { product, carrier, awb, status, note };
}

/** Timestamps a move sets. Delivered keeps the shipped time; going back to returned keeps both. */
export function moveStamps(to: ShipStatus): { shipped: boolean; delivered: boolean } {
  return { shipped: to === 'shipped', delivered: to === 'delivered' };
}

export async function listShipments(dealId: string, database: any = env.DB) {
  return ((await database.prepare('SELECT * FROM shipments WHERE deal_id=? ORDER BY created_at, id').bind(dealId).all()).results ?? []) as any[];
}

export async function addShipment(dealId: string, input: Parameters<typeof cleanShipment>[0], by: string, database: any = env.DB) {
  const s = cleanShipment(input);
  const deal = await database.prepare('SELECT id FROM creator_deals WHERE id=?').bind(dealId).first();
  if (!deal) throw new ShipError('That deal does not exist.');
  const id = crypto.randomUUID();
  await database.prepare(
    `INSERT INTO shipments (id, deal_id, product, carrier, awb, status, note, created_by, shipped_at)
     VALUES (?,?,?,?,?,?,?,?, ${s.status === 'shipped' ? 'now()' : 'NULL'})`
  ).bind(id, dealId, s.product, s.carrier, s.awb, s.status, s.note, String(by || '').slice(0, 200) || null).run();
  return database.prepare('SELECT * FROM shipments WHERE id=?').bind(id).first();
}

/**
 * Moves one shipment along. The status in the WHERE clause makes it safe against a stale tab or a double click:
 * only the first of two identical moves changes anything. Carrier/AWB can be filled in on the way to shipped.
 */
export async function moveShipment(dealId: string, shipmentId: string, to: string, extra: { carrier?: unknown; awb?: unknown } = {}, database: any = env.DB) {
  if (!(SHIP_STATUSES as readonly string[]).includes(to)) throw new ShipError('Unknown shipment status.');
  const s = await database.prepare('SELECT * FROM shipments WHERE id=? AND deal_id=?').bind(shipmentId, dealId).first();
  if (!s) throw new ShipError('That shipment is not on this deal.');
  if (s.status === to) throw new ShipError(`This shipment is already marked ${SHIP_LABEL[to as ShipStatus].toLowerCase()}.`);
  if (!canMove(s.status, to)) throw new ShipError(`A ${SHIP_LABEL[s.status as ShipStatus].toLowerCase()} shipment can't be marked ${SHIP_LABEL[to as ShipStatus].toLowerCase()}.`);
  const carrier = clip(extra.carrier, 80) || s.carrier || null;
  const awb = clip(extra.awb, 40).replace(/\s/g, '') || s.awb || null;
  if (awb && !/^[A-Za-z0-9-]{4,40}$/.test(awb)) throw new ShipError('The AWB / tracking number can only have letters, numbers and dashes.');
  if (to === 'shipped' && (!carrier || !awb)) throw new ShipError('To mark it shipped, add the courier and the AWB number.');
  const st = moveStamps(to as ShipStatus);
  const r = await database.prepare(
    `UPDATE shipments SET status=?, carrier=?, awb=?${st.shipped ? ', shipped_at=now()' : ''}${st.delivered ? ', delivered_at=now()' : ''}
     WHERE id=? AND deal_id=? AND status=?`
  ).bind(to, carrier, awb, shipmentId, dealId, s.status).run();
  if (!r.meta?.changes) throw new ShipError('The shipment changed while you were looking at it. Reload and try again.');
  return database.prepare('SELECT * FROM shipments WHERE id=?').bind(shipmentId).first();
}

/** The creator's shipping address, for the team page only. */
export async function creatorAddress(creatorId: string, database: any = env.DB) {
  return database.prepare('SELECT * FROM creator_addresses WHERE creator_id=?').bind(creatorId).first().catch(() => null);
}

export function addressLines(a: any): string[] {
  if (!a) return [];
  return [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.pincode ? ` ${a.pincode}` : ''), a.phone ? `Phone ${a.phone}` : '']
    .map((x) => String(x ?? '').trim()).filter(Boolean);
}

/** Shipment status per deal of a campaign, for the brand's page: no courier, AWB or address. */
export async function shipmentStatusForCampaign(campaignId: string, database: any = env.DB): Promise<Record<string, any[]>> {
  const rows = ((await database.prepare(
    `SELECT s.id, s.deal_id, s.product, s.status, s.shipped_at, s.delivered_at FROM shipments s
     JOIN creator_deals d ON d.id=s.deal_id WHERE d.campaign_id=? ORDER BY s.created_at, s.id`
  ).bind(campaignId).all()).results ?? []) as any[];
  const out: Record<string, any[]> = {};
  for (const r of rows) (out[r.deal_id] ||= []).push(r);
  return out;
}
