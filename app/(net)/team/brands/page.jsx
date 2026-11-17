import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { revokeSessions } from "@/lib/net/creatorAuth";
import { audit, can } from "@/lib/net/security";
import { requireTeam } from "../_guard";
import { linkCampaignsByEmail } from "../../brand/_lib";
import { day } from "@/components/team/labels";
import { weekSeries, parseWhen } from "@/lib/net/dashboard";
import { PageHeader, KpiStrip, FilterBar, FilterChips, DataTable, Grid, Section, AsideCard, Pill, Split, Cell, Avatar, Pager, paginate, pageHref } from "@/components/ui";

export const metadata = { title: "Brand accounts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const BACK = "/team/brands";
const go = (key, msg) => redirect(flashUrl(BACK, key, msg));

async function target(fd) {
  const id = String(fd.get("id") ?? "");
  const b = id ? await env.DB.prepare("SELECT id, email, company, email_verified_at, verified_by, disabled_at FROM brand_accounts WHERE id=?").bind(id).first() : null;
  if (!b) go("err", "That brand account no longer exists.");
  return b;
}

/** Colatch has checked this is a real brand: shows the verified mark on its campaigns. */
async function markVerified(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const b = await target(fd);
  if (!b.email_verified_at) go("err", `Confirm ${b.email} first (their email isn't confirmed yet).`);
  await env.DB.tx(async (t) => {
    await t.prepare("UPDATE brand_accounts SET verified_by=? WHERE id=?").bind(me.id, b.id).run();
    await t.prepare("UPDATE campaigns SET brand_verified=1 WHERE brand_account_id=?").bind(b.id).run();
  });
  await audit({ kind: "team", id: me.id }, "brand.verified", "brand_account", b.id, { email: b.email });
  go("ok", `${b.company || b.email} is marked verified.`);
}

/** For when email isn't working: a team member who has checked the address confirms it by hand. */
async function confirmEmail(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const b = await target(fd);
  if (b.email_verified_at) go("ok", "That email was already confirmed.");
  await env.DB.prepare("UPDATE brand_accounts SET email_verified_at=now() WHERE id=? AND email_verified_at IS NULL").bind(b.id).run();
  const n = await linkCampaignsByEmail(b.id);
  await audit({ kind: "team", id: me.id }, "brand.email_confirmed_by_team", "brand_account", b.id, { email: b.email, linked: n });
  go("ok", `${b.email} confirmed. ${n} earlier ${n === 1 ? "brief" : "briefs"} linked to the account.`);
}

async function setDisabled(fd) {
  "use server";
  const me = await requireTeam("team", BACK);
  const b = await target(fd);
  const disable = fd.get("disable") === "1";
  await env.DB.prepare(`UPDATE brand_accounts SET disabled_at=${disable ? "now()" : "NULL"} WHERE id=?`).bind(b.id).run();
  if (disable) await revokeSessions("brand", b.id);
  await audit({ kind: "team", id: me.id }, disable ? "brand.disabled" : "brand.enabled", "brand_account", b.id, { email: b.email });
  go("ok", `${b.email} ${disable ? "can no longer log in and was signed out" : "can log in again"}.`);
}

export default async function Page({ searchParams }) {
  const me = await requireTeam("view");
  const canAct = can(me.role, "team");
  const rows = (await env.DB.prepare(
    `SELECT b.id, b.email, b.name, b.company, b.phone, b.website, b.gstin, b.email_verified_at, b.verified_by, b.disabled_at, b.last_login_at, b.created_at,
            u.email AS verifier, (SELECT COUNT(*) FROM campaigns k WHERE k.brand_account_id=b.id) AS campaigns
     FROM brand_accounts b LEFT JOIN team_users u ON u.id=b.verified_by ORDER BY b.created_at DESC LIMIT 500`
  ).all()).results ?? [];
  // Everything below is worked out from the rows already loaded: no extra queries.
  const tab = ["all", "waiting", "verified", "disabled"].includes(searchParams?.tab) ? searchParams.tab : "all";
  const isVerified = (b) => !b.disabled_at && b.verified_by;
  const isWaiting = (b) => !b.disabled_at && !b.verified_by;
  const n = { all: rows.length, waiting: rows.filter(isWaiting).length, verified: rows.filter(isVerified).length, disabled: rows.filter((b) => b.disabled_at).length };
  const unconfirmed = rows.filter((b) => !b.email_verified_at && !b.disabled_at).length;
  const linked = rows.reduce((t, b) => t + Number(b.campaigns || 0), 0);
  const shown = tab === "waiting" ? rows.filter(isWaiting) : tab === "verified" ? rows.filter(isVerified) : tab === "disabled" ? rows.filter((b) => b.disabled_at) : rows;
  // Paged at 25, like team home: filters stay in the links.
  const pg = paginate(shown, searchParams?.page, 25);
  const now = Date.now();
  const tOf = (v) => parseWhen(v)?.t ?? null;
  const ageDays = (v) => { const t = tOf(v); return t == null ? null : Math.max(0, Math.floor((now - t) / 864e5)); };
  const joined12 = weekSeries(rows.map((b) => b.created_at), now, 12);
  const joinedN = joined12.reduce((a, b) => a + b, 0);
  // The queue: active accounts not verified yet, oldest first. "Confirm email" comes before "Verify".
  const queue = rows.filter(isWaiting).sort((a, b) => (tOf(a.created_at) ?? 0) - (tOf(b.created_at) ?? 0));
  const readyToVerify = queue.filter((b) => b.email_verified_at).length;
  // Brand · contact · email in one cell, so the table fits beside the aside at every desktop width.
  const columns = [
    { key: "brand", label: "Brand", render: (b) => (
      <span className="tr-person"><Avatar name={b.company || b.email} size={36} />
        <Cell title={b.company || "—"} sub={<span className="tr-brandsub">
          <span className="tr-wrap">{b.email} · <span className="ui-dim">{b.email_verified_at ? `confirmed ${day(b.email_verified_at)}` : "email not confirmed"}</span></span>
          {[b.name, b.phone, b.gstin ? `GSTIN ${b.gstin}` : null].filter(Boolean).length > 0 && <span className="tr-wrap">{[b.name, b.phone, b.gstin ? `GSTIN ${b.gstin}` : null].filter(Boolean).join(" · ")}</span>}
          {b.website && <a className="link tr-wrap" href={b.website} target="_blank" rel="noopener noreferrer nofollow">{b.website}</a>}
        </span>} /></span>
    ) },
    { key: "campaigns", label: "Briefs", num: true, render: (b) => Number(b.campaigns || 0) },
    { key: "status", label: "Status", primary: true, render: (b) => (<>
      {b.disabled_at ? <Pill tone="off">Disabled</Pill> : b.verified_by ? <Pill tone="done">Verified</Pill> : <Pill tone="wait">Not verified</Pill>}
      <div className="hint">{b.verified_by ? `by ${b.verifier || b.verified_by}` : `Joined ${day(b.created_at)}`}{b.last_login_at ? ` · last login ${day(b.last_login_at)}` : ""}</div>
    </>) },
    ...(canAct ? [{ key: "actions", label: "Actions", labelHidden: true, primary: true, align: "right", className: "tr-actcol", render: (b) => (
      <div className="tr-acts tr-acts--stack">
        {!b.email_verified_at && <form action={confirmEmail}><input type="hidden" name="id" value={b.id} /><button className="btn sm" aria-label={`Confirm email for ${b.email}`}>Confirm email</button></form>}
        {!b.verified_by && b.email_verified_at && !b.disabled_at && <form action={markVerified}><input type="hidden" name="id" value={b.id} /><button className="btn sm plum" aria-label={`Mark ${b.company || b.email} verified`}>Mark brand verified</button></form>}
        <form action={setDisabled}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="disable" value={b.disabled_at ? "0" : "1"} /><button className="btn sm ghost tr-quietbtn" aria-label={`${b.disabled_at ? "Enable" : "Disable"} ${b.email}`}>{b.disabled_at ? "Enable" : "Disable"}</button></form>
      </div>
    ) }] : []),
  ];
  const TABS = [["all", "All"], ["waiting", "Not verified"], ["verified", "Verified"], ["disabled", "Disabled"]];

  return (
    <TeamShell active="brands" email={me.email} role={me.role}>
      <PageHeader
        crumbs={[{ label: "Creator network" }, { label: "Brands" }]}
        eyebrow="Brands · Accounts"
        title="Brand <b>accounts</b>"
        sub="Brands who created an account. Earlier briefs are linked only after the brand confirms its email. Mark a brand verified once you've checked it's a real business (website, GSTIN, a call): its campaigns then show the verified mark to creators."
      />
      <div style={{ marginBottom: 14 }}><Flash sp={searchParams} /></div>
      {!canAct && <div className="note info" style={{ marginBottom: 14 }}>You can view brand accounts. Verifying or disabling needs the team permission.</div>}

      <KpiStrip label="Brand accounts at a glance" items={[
        { label: "Brand accounts", value: n.all, spark: joined12, sparkLabel: "Brand accounts created per week, last 12 weeks", foot: rows.length === 500 ? "showing the newest 500" : `${joinedN} joined in 12 weeks` },
        { featured: true, label: "Waiting for a check", value: n.waiting, foot: n.waiting ? `${readyToVerify} ready to verify · ${unconfirmed} to confirm email` : "every active brand is verified", href: "?tab=waiting" },
        { label: "Verified", value: n.verified, foot: "show the verified mark to creators", href: "?tab=verified" },
        { label: "Briefs linked", value: linked, foot: `${n.disabled} ${n.disabled === 1 ? "account" : "accounts"} disabled` },
      ]} />

      <Grid aside={<>
        <AsideCard eyebrow="Insight" title="Where accounts stand" foot={<a href="?tab=all">See every account</a>}>
          <Split label="Brand accounts by status" parts={[
            { label: "Not verified", n: n.waiting, href: "?tab=waiting" },
            { label: "Verified", n: n.verified, href: "?tab=verified" },
            { label: "Disabled", n: n.disabled, href: "?tab=disabled" },
          ]} />
          <p className="small">{n.waiting ? <><b>{n.waiting}</b> {n.waiting === 1 ? "brand is" : "brands are"} waiting for a check. Look at the website and GSTIN, or call, then mark it verified.</> : "Every active brand is verified."}</p>
        </AsideCard>
        <AsideCard eyebrow="Needs you" title={queue.length ? `Oldest <b>${Math.min(queue.length, 5)}</b> to check` : "Nothing to check"}
          foot={queue.length > 5 ? <a href="?tab=waiting">All {queue.length} waiting</a> : null}>
          {queue.length ? <ol className="tr-queue">{queue.slice(0, 5).map((b) => { const a = ageDays(b.created_at); return (
            <li key={b.id}><a href="?tab=waiting">
              <span className="tr-queue__t"><b>{b.company || b.email}</b><span className="hint">{b.email_verified_at ? "Email confirmed: check the business, then verify" : "Confirm the email first"}</span></span>
              <span className="tr-queue__age">{a == null ? "" : a === 0 ? "today" : `${a}d`}</span>
            </a></li>); })}</ol>
            : <p className="small">Every active brand is verified. New sign-ups land here.</p>}
        </AsideCard>
        <AsideCard tone="night" eyebrow="How verifying works" title="A check, then the mark.">
          <p className="small">Confirming an email links the brand's earlier briefs. Verifying shows the verified mark on its campaigns. Disabling signs the brand out at once.</p>
        </AsideCard>
      </>}>
        <Section title="Accounts" sub={`${shown.length} ${shown.length === 1 ? "account" : "accounts"}${tab === "all" ? "" : ` · ${TABS.find((t) => t[0] === tab)[1]}`}`}>
          <FilterBar label="Filter brand accounts">
            <FilterChips name="tab" label="Filter by status" current={tab} hrefFor={(v) => `?tab=${v}`} options={TABS.map(([value, label]) => ({ value, label, count: n[value] }))} />
          </FilterBar>
          <DataTable caption="Brand accounts" columns={columns} rows={pg.rows} className="tr-brandtbl"
            empty={{ title: rows.length ? "No accounts with this status." : "No brand accounts yet.", body: rows.length ? "Pick another filter." : "Brands get an account when they sign up from the brand login page or send a brief.", action: rows.length ? <a className="btn sm" href="?tab=all">See every account</a> : <a className="btn sm" href="/team/campaigns">Open campaigns</a> }} />
          <Pager p={pg} noun={["account", "accounts"]} label="Brand account pages" hrefFor={(n) => pageHref(searchParams, n, { path: "/team/brands" })} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
