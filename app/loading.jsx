export default function Loading() {
  return (
    <div className="wrap" style={{ position: "relative", zIndex: 2 }}>
      <div className="boot" role="status" aria-live="polite"><span className="spin" />Loading the Colatch roster…</div>
    </div>
  );
}
