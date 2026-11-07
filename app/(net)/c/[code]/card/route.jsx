import { ImageResponse } from "next/og";
import { env } from "@/lib/net/env";
import { flexData } from "@/lib/net/flex";

// Neon's HTTP driver and our crypto helpers run on the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 1080;
const H = 1920;
const GOLD = "#E8B84B";
const TIER_MARK = { Rising: "◆", Trusted: "✦", Gold: "★", Icon: "♛" };

/** Load Ubuntu from Google Fonts as TTF (Satori can't read woff2). Falls back to the built-in font if anything fails. */
async function font(weight, text) {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Ubuntu:wght@${weight}&text=${encodeURIComponent(text)}`, { cache: "force-cache" }).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url, { cache: "force-cache" }).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(req, { params }) {
  const f = await flexData(env, params.code).catch(() => null);
  const url = new URL(req.url);
  const host = url.host.replace(/^www\./, "");
  const code = f?.code || "COLATCH";
  const isCreator = f?.ownerType === "creator";

  const stats = [];
  if (isCreator) {
    stats.push({ v: String(f.delivered), k: f.delivered === 1 ? "brand deal delivered" : "brand deals delivered" });
    if (f.rating != null) stats.push({ v: `★ ${f.rating}`, k: `from ${f.ratings} ${f.ratings === 1 ? "brand" : "brands"}` });
    if (f.earned) stats.push({ v: f.earned, k: "earned on Colatch" });
    if (stats.length < 3 && f.score != null) stats.push({ v: String(f.score), k: "Colatch Score" });
  }

  const headline = isCreator ? f.name : f ? `${f.name} invites you` : "Brand deals made for what you do";
  const text = ["COLATCH", "Creator network", headline, f?.handle ? "@" + f.handle : "", f?.tier || "", stats.map((s) => s.v + s.k).join(""),
    "Join with my code", code, host, "Paid brand deals that fit you. Free to join.", "Verified by Colatch", "◆✦★♛₹0123456789+./:"].join(" ");
  const [regular, bold] = await Promise.all([font(400, text), font(700, text)]);
  const fonts = [regular && { name: "Ubuntu", data: regular, weight: 400, style: "normal" }, bold && { name: "Ubuntu", data: bold, weight: 700, style: "normal" }].filter(Boolean);

  const img = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "110px 90px 120px", color: "#F4EFE3", fontFamily: fonts.length ? "Ubuntu" : undefined,
        backgroundColor: "#1E1128", backgroundImage: "radial-gradient(circle at 90% 0%, rgba(232,184,75,0.28) 0%, rgba(232,184,75,0) 45%), radial-gradient(circle at 0% 100%, rgba(106,74,120,0.65) 0%, rgba(106,74,120,0) 50%), linear-gradient(180deg, #2E1B36 0%, #1E1128 62%, #160B18 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ width: 74, height: 74, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#F2D163,#C8962E 60%,#8C5E18)", color: "#1E1128", fontSize: 40, fontWeight: 700 }}>C</div>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: 6 }}>COLATCH</div>
          </div>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: GOLD, textTransform: "uppercase" }}>Creator network</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {isCreator && f.tier && (
            <div style={{ display: "flex", alignSelf: "flex-start", alignItems: "center", gap: 14, padding: "14px 30px", borderRadius: 999, fontSize: 34, fontWeight: 700, letterSpacing: 2,
              background: f.tier === "Gold" ? "linear-gradient(135deg,#F2D163,#C8962E)" : "rgba(255,255,255,.08)", color: f.tier === "Gold" ? "#2E1B36" : GOLD, border: "2px solid rgba(232,184,75,.55)" }}>
              <span>{TIER_MARK[f.tier]}</span><span>{f.tier} creator</span>
            </div>
          )}
          <div style={{ display: "flex", marginTop: 40, fontSize: headline.length > 18 ? 104 : 132, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3 }}>{headline}</div>
          {f?.handle && <div style={{ display: "flex", marginTop: 22, fontSize: 44, color: "rgba(244,239,227,.72)" }}>@{f.handle}</div>}
          {stats.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 80, gap: 34 }}>
              {stats.map((s) => (
                <div key={s.k} style={{ display: "flex", alignItems: "baseline", gap: 26, paddingBottom: 30, borderBottom: "2px solid rgba(232,184,75,.22)" }}>
                  <span style={{ fontSize: 96, fontWeight: 700, color: GOLD, letterSpacing: -2 }}>{s.v}</span>
                  <span style={{ fontSize: 38, color: "rgba(244,239,227,.8)" }}>{s.k}</span>
                </div>
              ))}
            </div>
          )}
          {!isCreator && <div style={{ display: "flex", marginTop: 50, fontSize: 48, color: "rgba(244,239,227,.8)", lineHeight: 1.35 }}>Paid brand deals that fit you. Free to join.</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "54px 60px", borderRadius: 44, background: "linear-gradient(135deg,#F2D163 0%,#E8B84B 30%,#C8962E 70%,#A87422 100%)", color: "#1E1128" }}>
          <div style={{ display: "flex", fontSize: 36, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700, opacity: 0.8 }}>Join with my code</div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 132, fontWeight: 700, letterSpacing: 6 }}>{code}</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 36 }}>{host}/c/{code}</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: fonts.length ? fonts : undefined,
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=600",
        ...(url.searchParams.get("download") ? { "Content-Disposition": `attachment; filename="colatch-${code.toLowerCase()}.png"` } : {}),
      },
    }
  );
  return img;
}
