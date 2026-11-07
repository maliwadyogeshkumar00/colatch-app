"use client";
import { useEffect, useState } from "react";
import { TIER_PRICE, IMG, initials } from "../../lib/engine";

const WA = "919764140627";

function Face({ c, n }) {
  const [bad, setBad] = useState(!c?.ph);
  return bad ? <span className="mono" aria-hidden="true">{initials(n)}</span> : <img src={IMG(c.ph)} alt={n} loading="lazy" onError={() => setBad(true)} />;
}

export default function Shared({ brand, category, items, valid, id }) {
  const key = "colatch.votes." + id;
  const [votes, setVotes] = useState({});
  const [note, setNote] = useState("");
  useEffect(() => { try { setVotes(JSON.parse(localStorage.getItem(key) || "{}")); setNote(localStorage.getItem(key + ".note") || ""); } catch {} }, [key]);
  const vote = (n, v) => setVotes((x) => { const y = { ...x, [n]: x[n] === v ? undefined : v }; try { localStorage.setItem(key, JSON.stringify(y)); } catch {} return y; });
  const yes = items.filter((x) => votes[x.n] === "yes").map((x) => x.n), no = items.filter((x) => votes[x.n] === "no").map((x) => x.n);
  const msg = `Hi Colatch — feedback on the ${brand || "shared"} shortlist.\nYes: ${yes.join(", ") || "—"}\nNo: ${no.join(", ") || "—"}${note ? "\nNotes: " + note : ""}`;

  return (
    <>
      <div className="ground" /><div className="grain" />
      <div className="wrap">
        <nav className="nav"><a className="logo" href="/" aria-label="Colatch — home"><img src="https://colatch.com/colatch-logo-white.svg" alt="Colatch" /></a>
          <div className="navr"><a className="btn btn-line btn-sm" href="/">Make your own shortlist</a></div></nav>
        {!valid ? (
          <section className="results"><div className="rhead"><div><div className="eyebrow">Shortlist</div><h2>This link is <span className="light">incomplete.</span></h2>
            <p>Ask whoever sent it to copy the full link again, or start a new search.</p></div></div></section>
        ) : (
          <section className="results">
            <div className="rhead"><div>
              <div className="eyebrow rise">Shared shortlist · {items.length} faces{category ? " · " + category : ""}</div>
              <h2 className="rise" style={{ "--i": 1 }}>{brand ? <>For <span className="light">{brand}</span></> : <>A Colatch <span className="light">shortlist</span></>}</h2>
              <p className="rise" style={{ "--i": 2 }}>Mark each face yes or no, add a note, and send your picks back. Votes stay on this device until you send them.</p>
            </div></div>
            <div className="grid shared" style={{ marginTop: 24 }}>
              {items.map((x, i) => (
                <div key={x.n} className="card rise" style={{ "--i": i, cursor: "default" }}>
                  <div className="ph"><Face c={x.c} n={x.n} /><span className="scrim" /></div>
                  <div className="body">
                    <div className="nm">{x.n}</div>
                    <div className="rl">{x.c ? `${x.c.role} · ${x.c.tier} · ${TIER_PRICE[x.c.tier].band}` : "No longer on the roster"}</div>
                    {x.fit != null && <div className="fit"><i style={{ "--v": x.fit / 100 }} /><b>{x.fit}%</b></div>}
                    <div className="vote">
                      <button className={votes[x.n] === "yes" ? "on" : ""} aria-pressed={votes[x.n] === "yes"} onClick={() => vote(x.n, "yes")}>Yes</button>
                      <button className={votes[x.n] === "no" ? "on no" : ""} aria-pressed={votes[x.n] === "no"} onClick={() => vote(x.n, "no")}>No</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="sharefoot">
              <div className="fld wide"><label htmlFor="shNote">Note for Colatch</label><input id="shNote" value={note} maxLength={400} onChange={(e) => { setNote(e.target.value); try { localStorage.setItem(key + ".note", e.target.value); } catch {} }} placeholder="e.g. Prefer someone with a South audience" /></div>
              <a className="btn btn-gold" href={`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Send {yes.length + no.length ? `${yes.length} yes · ${no.length} no` : "feedback"} to Colatch <span className="arr">→</span></a>
            </div>
          </section>
        )}
        <footer className="foot"><span>© Colatch · Celebrity &amp; Brand Marketing</span><span>Bands are indicative and confirmed per campaign.</span></footer>
      </div>
    </>
  );
}
