import PublicShell, { Hero } from "../_ui/PublicShell";
import { env } from "@/lib/net/env";
import { inr, compact } from "@/lib/net/creators";
import { scrubContacts } from "@/lib/net/guard";
import { PITCH_SELECT } from "./_data";
import { PITCH_FORMATS, PITCH_OCCASIONS, firstName } from "../_ui/pitch";

export const metadata = {
  title: "Creator ideas, ready to book · Colatch",
  description: "Content ideas pitched by India's creators, with the price up front. Book one through Colatch and get a shortlist within 2 working days.",
};

const CSS = `
.pg-ideas .filters{display:flex;flex-direction:column;gap:10px;margin-bottom:22px}
.pg-ideas .frow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pg-ideas .frow .fl{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-4);font-weight:700;min-width:70px}
.pg-ideas .fc{font-size:12.5px;padding:6px 12px;border-radius:999px;border:1px solid var(--line-3);color:var(--ink-2);background:var(--paper);font-weight:500}
.pg-ideas .fc.on{background:var(--p900);color:#fff;border-color:var(--p900)}
.pg-ideas .board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
@media(max-width:1000px){.pg-ideas .board{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.pg-ideas .board{grid-template-columns:1fr}}
.pg-ideas .idea{display:flex;flex-direction:column;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:var(--sh-2);transition:transform .2s var(--ease),box-shadow .2s var(--ease)}
.pg-ideas .idea:hover{transform:translateY(-3px);box-shadow:var(--sh-3)}
.pg-ideas .occ{align-self:flex-start;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--gold-deep);background:rgba(232,184,75,.14);padding:4px 10px;border-radius:999px}
.pg-ideas .idea h3{margin:12px 0 8px;font-size:18px;line-height:1.3;color:var(--p900);letter-spacing:-.01em}
.pg-ideas .idea p{margin:0 0 14px;color:var(--ink-3);font-size:14px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.pg-ideas .by{display:flex;gap:10px;align-items:center;margin-top:auto;padding-top:14px;border-top:1px solid var(--line-2)}
.pg-ideas .by .ava{width:34px;height:34px;font-size:12px}
.pg-ideas .by b{display:block;font-size:13.5px}
.pg-ideas .by span{display:block;font-size:12px;color:var(--ink-4)}
.pg-ideas .price{display:flex;justify-content:space-between;align-items:center;margin-top:14px}
.pg-ideas .price .amt{font-size:22px;font-weight:300;letter-spacing:-.02em;color:var(--p900)}
.pg-ideas .price small{display:block;font-size:11px;color:var(--ink-4)}
`;

const chipHref = (sp, key, val) => {
  const q = new URLSearchParams();
  for (const k of ["cat", "occ", "fmt"]) if (sp?.[k] && k !== key) q.set(k, sp[k]);
  if (sp?.[key] !== val && val) q.set(key, val);
  const s = q.toString();
  return "/pitches" + (s ? "?" + s : "");
};

export default async function Page({ searchParams }) {
  const sp = searchParams || {};
  const where = [], binds = [];
  if (sp.cat) { where.push("p.category=?"); binds.push(String(sp.cat)); }
  if (sp.occ) { where.push("p.occasion=?"); binds.push(String(sp.occ)); }
  if (sp.fmt) { where.push("p.format=?"); binds.push(String(sp.fmt)); }
  const rows = (await env.DB.prepare(`${PITCH_SELECT}${where.length ? " AND " + where.join(" AND ") : ""} ORDER BY p.created_at DESC LIMIT 60`).bind(...binds).all()).results ?? [];
  const cats = ((await env.DB.prepare("SELECT DISTINCT category FROM creator_pitches WHERE status='live' AND category IS NOT NULL ORDER BY category").all()).results ?? []).map((r) => r.category);

  const hero = (
    <Hero eyebrow="The Colatch idea board" title="Ideas creators are <b>dying to make.</b>">
      <p>Every card is a creator's own pitch, with the price up front. Book the one that fits your brand and Colatch handles the rest: the creator, the contract, the payment and the proof. No briefing calls, no back and forth.</p>
    </Hero>
  );

  const Row = ({ label, k, opts }) => (
    <div className="frow"><span className="fl">{label}</span>
      <a className={`fc ${!sp[k] ? "on" : ""}`} href={chipHref(sp, k, "")}>All</a>
      {opts.map((o) => <a key={o} className={`fc ${sp[k] === o ? "on" : ""}`} href={chipHref(sp, k, o)}>{o}</a>)}
    </div>
  );

  return (
    <PublicShell mode="client" hero={hero}>
      <div className="pg-ideas">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="filters">
          <Row label="Moment" k="occ" opts={PITCH_OCCASIONS} />
          <Row label="Format" k="fmt" opts={PITCH_FORMATS} />
          {cats.length > 0 && <Row label="Brand" k="cat" opts={cats} />}
        </div>
        {rows.length === 0 ? (
          <div className="panel empty"><b>No ideas match that yet.</b>Clear a filter, or <a className="link" href="/brief">post your own brief</a> and we'll find the creator within 2 working days.</div>
        ) : (
          <div className="board">{rows.map((p) => {
            const who = firstName(p.name);
            const facts = [p.followers ? compact(p.followers) + " followers" : null, p.city, String(p.niche || "").split(",")[0].trim() || null].filter(Boolean).join(" · ");
            return (
              <a key={p.id} className="idea" href={`/pitches/${p.id}`}>
                <span className="occ">{p.occasion || "Any time"} · {p.format}</span>
                <h3>{scrubContacts(p.title).text}</h3>
                <p>{scrubContacts(p.idea).text}</p>
                <div className="by">
                  <div className="ava">{who[0]}</div>
                  <div><b>{who}{p.verified ? " ✓" : ""}</b><span>{facts || "Colatch creator"}</span></div>
                  {p.rating != null && <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600 }}>★ {Number(p.rating).toFixed(1)}</span>}
                </div>
                <div className="price"><div><div className="amt">{inr(p.price)}</div><small>creator's price{p.category ? ` · for ${p.category.toLowerCase()} brands` : ""}</small></div><span className="btn sm plum">Book this idea</span></div>
              </a>
            );
          })}</div>
        )}
      </div>
    </PublicShell>
  );
}
