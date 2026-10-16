export default function NotFound() {
  return (
    <div className="wrap" style={{ position: "relative", zIndex: 2 }}>
      <section className="results"><div className="rhead"><div>
        <div className="eyebrow">404</div>
        <h2>This page isn’t <span className="light">on the roster.</span></h2>
        <p>The link may be old or mistyped.</p>
        <div style={{ marginTop: 24 }}><a className="btn btn-gold" href="/">Find the face your brand deserves</a></div>
      </div></div></section>
    </div>
  );
}
