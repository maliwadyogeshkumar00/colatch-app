"use client";
import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="wrap" style={{ position: "relative", zIndex: 2 }}>
      <section className="results"><div className="rhead"><div>
        <div className="eyebrow">Something broke</div>
        <h2>We hit a snag <span className="light">on our side.</span></h2>
        <p>Your shortlist in this tab may be lost, but nothing was sent anywhere. Try again, or start fresh.{error?.digest ? ` Ref: ${error.digest}` : ""}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 24 }}><button className="btn btn-gold" onClick={() => reset()}>Try again</button><a className="btn btn-line" href="/">Start over</a></div>
      </div></div></section>
    </div>
  );
}
