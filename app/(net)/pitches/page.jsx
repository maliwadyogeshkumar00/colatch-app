import PublicShell from "../_ui/PublicShell";
import { PageHeader, KpiStrip, Grid, Section, AsideCard, FilterBar, FilterChips, EmptyState, Avatar } from "@/components/ui";
import { ShareBar } from "@/components/brand/Facts";
import { inrShort } from "@/lib/net/dashboard";
import { env } from "@/lib/net/env";
import { inr, compact } from "@/lib/net/creators";
import { scrubContacts } from "@/lib/net/guard";
import { PITCH_SELECT } from "./_data";
import { PITCH_FORMATS, PITCH_OCCASIONS, firstName } from "../_ui/pitch";

export const metadata = {
  title: "Creator ideas, ready to book",
  description: "Content ideas pitched by India's creators, with the price up front. Book one through Colatch; we usually confirm within 2 working days.",
};

const CSS = `
.pg-ideas .filters{display:flex;flex-direction:column;gap:10px;margin-bottom:22px}
.pg-ideas .frow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pg-ideas .frow .fl{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-4);font-weight:700;min-width:70px}
.pg-ideas .fc{font-size:12.5px;padding:6px 12px;border-radius:999px;border:1px solid var(--line-3);color:var(--ink-2);background:var(--paper);font-weight:500}
.pg-ideas .fc.on{background:var(--p900);color:#fff;border-color:var(--p900)}
.pg-ideas .ideas-board{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.pg-ideas .idea{min-width:0}
@media(min-width:700px){.pg-ideas .ideas-board{grid-template-columns:repeat(2,minmax(0,1fr))}}
.pg-ideas .idea{display:flex;flex-direction:column;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:var(--sh-2);transition:transform .2s var(--ease),box-shadow .2s var(--ease)}
.pg-ideas .idea:hover{transform:translateY(-3px);box-shadow:var(--sh-3)}
.pg-ideas .occ{align-self:flex-start;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--gold-deep);background:rgba(232,184,75,.14);padding:4px 10px;border-radius:999px}
.pg-ideas .idea h3{margin:12px 0 8px;font-size:18px;line-height:1.3;color:var(--head);letter-spacing:-.01em}
.pg-ideas .idea p{margin:0 0 14px;color:var(--ink-3);font-size:14px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.pg-ideas .by{display:flex;gap:10px;align-items:center;margin-top:auto;padding-top:14px;border-top:1px solid var(--line-2)}
.pg-ideas .by .ava{width:34px;height:34px;font-size:12px}
.pg-ideas .by b{display:block;font-size:13.5px}
.pg-ideas .by div span{display:block;font-size:12px;color:var(--ink-4)}
.pg-ideas .price{display:flex;justify-content:space-between;align-items:center;margin-top:14px}
.pg-ideas .price .amt{font-size:22px;font-weight:300;letter-spacing:-.02em;color:var(--head)}
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

  const filtered = Boolean(sp.cat || sp.occ || sp.fmt);
  const prices = rows.map((p) => Number(p.price) || 0).filter((n) => n > 0).sort((a, b) => a - b);
  const verified = rows.filter((p) => p.verified).length;
  const fmtParts = PITCH_FORMATS.map((f) => ({ label: f, n: rows.filter((p) => p.format === f).length, href: chipHref({ ...sp, fmt: undefined }, "fmt", f) }));
  const hero = (
    <PageHeader variant="hero" eyebrow="The Colatch idea board" title="Ideas creators are <b>dying to make.</b>"
      sub="Every card is a creator's own pitch, with the price up front. Book the one that fits your brand and Colatch handles the rest: the creator, the contract, the payment and the proof. No briefing calls, no back and forth." />
  );
  const Chips = ({ label, k, opts }) => (
    <FilterChips name={k} label={`Filter by ${label.toLowerCase()}`} current={sp[k] || ""} hrefFor={(v) => chipHref(sp, k, v)}
      options={[{ value: "", label: `${label}: all` }, ...opts.map((o) => ({ value: o, label: o }))]} />
  );

  return (
    <PublicShell mode="client" hero={hero}>
      <div className="pg-ideas v2b">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {rows.length > 0 && <KpiStrip label="Ideas at a glance" items={[
          { label: filtered ? "Ideas matching" : "Ideas live", value: rows.length, foot: filtered ? "with these filters" : "newest first" },
          { featured: true, label: "Prices from", value: inrShort(prices[0] || 0), title: inr(prices[0] || 0), foot: prices.length > 1 ? `up to ${inrShort(prices[prices.length - 1])}, creator's price` : "creator's price" },
          { label: "Instagram-verified", value: verified, foot: `of ${rows.length} creators` },
          { label: "Booked by brands", value: rows.reduce((a, p) => a + (Number(p.requests) || 0), 0), foot: "booking requests so far" },
        ]} />}
        <Grid aside={<>
          <AsideCard tone="night" eyebrow="How booking works" title="Pick an idea. We do the rest." foot={<a href="/faq">What brands pay</a>}>
            <ol className="v2b-steps"><li>Book the idea with your name and work email. No payment now.</li><li>We confirm the creator's dates, usually within 2 working days.</li><li>You approve, fund the deal through Colatch and see the post, views and proof in one place.</li></ol>
          </AsideCard>
          {rows.length > 0 && <AsideCard eyebrow="On the board" title="Ideas by format">
            <ShareBar label="Ideas by format" parts={fmtParts.map((f) => ({ label: f.label, n: f.n, text: String(f.n) }))} />
          </AsideCard>}
          <AsideCard eyebrow="Don't see it?" title="Send your own brief" foot={<a href="/join">I'm a creator: pitch an idea</a>}>
            <p className="small">Describe what you need and the Colatch team usually sends a shortlist of matched creators within 2 working days.</p>
            <p><a className="btn sm" href="/brief">Post a brief</a></p>
          </AsideCard>
        </>}>
          <Section id="ideas" title="Creator ideas" sub={filtered ? "Filtered. Tap a chip again to clear it." : "Every price is the creator's own. Colatch's fee and GST are shown before you book."}>
            <FilterBar label="Filter ideas">
              <Chips label="Moment" k="occ" opts={PITCH_OCCASIONS} />
              <Chips label="Format" k="fmt" opts={PITCH_FORMATS} />
              {cats.length > 0 && <Chips label="Brand" k="cat" opts={cats} />}
            </FilterBar>
            {rows.length === 0 ? (
              filtered
                ? <EmptyState title="No ideas match that yet." body="Clear the filters to see every idea, or post your own brief and we usually send a shortlist within 2 working days." action={<><a className="btn sm" href="/pitches">Clear the filters</a><a className="btn sm plum" href="/brief">Post a brief</a></>} />
                : <EmptyState title="No ideas posted yet." body="Creator pitches show up here with their price as soon as they're posted. You don't have to wait: post a brief and the Colatch team usually sends a shortlist of matched creators within 2 working days." action={<><a className="btn sm plum" href="/brief">Post a brief</a><a className="btn sm" href="/join">I'm a creator: join free</a></>} />
            ) : (
              <div className="ideas-board">{rows.map((p) => {
                const who = firstName(p.name);
                const facts = [p.followers ? compact(p.followers) + " followers" : null, p.city, String(p.niche || "").split(",")[0].trim() || null].filter(Boolean).join(" · ");
                return (
                  <a key={p.id} className="idea" href={`/pitches/${p.id}`}>
                    <span className="occ">{p.occasion || "Any time"} · {p.format}</span>
                    <h3>{scrubContacts(p.title).text}</h3>
                    <p>{scrubContacts(p.idea).text}</p>
                    <div className="by">
                      <Avatar name={who} size={34} />
                      <div><b>{who}{p.verified ? " ✓" : ""}</b><span>{facts || "Colatch creator"}</span></div>
                      {p.rating != null && <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600 }}>★ {Number(p.rating).toFixed(1)}</span>}
                    </div>
                    <div className="price"><div><div className="amt">{inr(p.price)}</div><small>creator's price{p.category ? ` · for ${p.category.toLowerCase()} brands` : ""}</small></div><span className="btn sm plum">Book this idea</span></div>
                  </a>
                );
              })}</div>
            )}
          </Section>
        </Grid>
      </div>
    </PublicShell>
  );
}
