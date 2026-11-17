// Read-only deal-room pieces shared by the creator, brand and team pages: usage rights and shipment status.
import { usageStatus, fmtDate, toDate } from "@/lib/net/usage";
import { SHIP_LABEL } from "@/lib/net/shipments";

/** One line: "Usage rights: Paid ads on Meta until 12 Mar 2027 (45 days left)". Expired shows in gold on plum. */
export function UsageLine({ d, style }) {
  const u = usageStatus(d);
  if (u.state === "none") return null;
  return (
    <div className={`dr-usage dr-usage-${u.state}`} style={style}>
      <span className="dr-usage-tag">{u.state === "expired" ? "Expired" : u.state === "pending" ? "Starts at go-live" : "Active"}</span>
      <span>{u.line}</span>
    </div>
  );
}

const day = (v) => { const d = toDate(v); return d ? fmtDate(d) : ""; };

/** Status chip. Never red/green: pending is outlined, moving is soft plum, delivered is solid plum, returned is gold. */
export function ShipPill({ status }) {
  return <span className={`dr-ship dr-ship-${status}`}>{SHIP_LABEL[status] || status}</span>;
}

/**
 * Shipments for the creator (with courier + AWB) or the brand (status only, showCarrier=false).
 * The shipping address is never shown here.
 */
export function ShipmentStatus({ shipments = [], showCarrier = true, title = "Product shipment" }) {
  if (!shipments.length) return null;
  return (
    <div className="dr-ships">
      {title && <h2>{title}</h2>}
      {shipments.map((s) => (
        <div key={s.id} className="dr-shiprow">
          <div className="spread" style={{ gap: 8 }}><b className="small">{s.product || "Product"}</b><ShipPill status={s.status} /></div>
          <div className="hint">
            {s.status === "delivered" ? `Delivered ${day(s.delivered_at)}` : s.status === "shipped" ? `Shipped ${day(s.shipped_at)}` : s.status === "returned" ? "Returned to the brand" : "Being packed"}
            {showCarrier && (s.carrier || s.awb) ? <> · {s.carrier || "Courier"}{s.awb ? <> · AWB <code className="k">{s.awb}</code></> : null}</> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
