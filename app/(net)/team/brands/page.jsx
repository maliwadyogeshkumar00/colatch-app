import { redirect } from "next/navigation";
import TeamShell from "../../_ui/TeamShell";
import Flash, { flashUrl } from "../../_ui/flash";
import { env } from "@/lib/net/env";
import { revokeSessions } from "@/lib/net/creatorAuth";
import { audit, can } from "@/lib/net/security";
import { requireTeam } from "../_guard";
import { linkCampaignsByEmail } from "../../brand/_lib";
import { day } from "@/components/team/labels";
import { PageHeader, KpiStrip, FilterBar, FilterChips, DataTable, Grid, Section, AsideCard, Pill, Split, Cell } from "@/components/ui";

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
  const columns = [
    { key: "brand", label: "Brand", render: (b) => (
      <Cell title={b.company || "—"} sub={<>{[b.name, b.phone, b.gstin ? `GSTIN ${b.gstin}` : null].filter(Boolean).join(" · ")}{b.website && <><br /><a className="link" href={b.website} target="_blank" rel="noopener noreferrer nofollow">{b.website}</a></>}</>} />
    ) },
    { key: "email", label: "Email", className: "tr-col-email", render: (b) => <span className="tr-wrap">{b.email}<div className="hint">{b.email_verified_at ? `Confirmed ${day(b.email_verified_at)}` : "Email not confirmed"}</div></span> },
    { key: "campaigns", label: "Campaigns", num: true, render: (b) => Number(b.campaigns || 0) },
    { key: "status", label: "Status", primary: true, render: (b) => (<>
      {b.disabled_at ? <Pill tone="off">Disabled</Pill> : b.verified_by ? <Pill tone="done">Verified</Pill> : <Pill tone="wait">Not verified</Pill>}
      <div className="hint">{b.verified_by ? `by ${b.verifier || b.verified_by}` : `Joined ${day(b.created_at)}`}{b.last_login_at ? ` · last login ${day(b.last_login_at)}` : ""}</div>
    </>) },
    ...(canAct ? [{ key: "actions", label: "Actions", labelHidden: true, primary: true, align: "right", render: (b) => (
      <div className="row tr-acts">
        {!b.email_verified_at && <form action={confirmEmail}><input type="hidden" name="id" value={b.id} /><button className="btn sm" aria-label={`Confirm email for ${b.email}`}>Confirm email</button></form>}
        {!b.verified_by && b.email_verified_at && !b.disabled_at && <form action={markVerified}><input type="hidden" name="id" value={b.id} /><button className="btn sm plum" aria-label={`Mark ${b.company || b.email} verified`}>Mark brand verified</button></form>}
        <form action={setDisabled}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="disable" value={b.disabled_at ? "0" : "1"} /><button className="btn sm" aria-label={`${b.disabled_at ? "Enable" : "Disable"} ${b.email}`}>{b.disabled_at ? "Enable" : "Disable"}</button></form>
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
        { label: "Brand accounts", value: n.all, foot: rows.length === 500 ? "showing the newest 500" : "newest first" },
        { featured: true, label: "Waiting for a check", value: n.waiting, foot: unconfirmed ? `${unconfirmed} still to confirm their email` : "all emails confirmed", href: "?tab=waiting" },
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
        <AsideCard tone="night" eyebrow="How verifying works" title="A check, then the mark.">
          <p className="small">Confirming an email links the brand's earlier briefs. Verifying shows the verified mark on its campaigns. Disabling signs the brand out at once.</p>
        </AsideCard>
      </>}>
        <Section title="Accounts" sub={`${shown.length} ${shown.length === 1 ? "account" : "accounts"}${tab === "all" ? "" : ` · ${TABS.find((t) => t[0] === tab)[1]}`}`}>
          <FilterBar label="Filter brand accounts">
            <FilterChips name="tab" label="Filter by status" current={tab} hrefFor={(v) => `?tab=${v}`} options={TABS.map(([value, label]) => ({ value, label, count: n[value] }))} />
          </FilterBar>
          <DataTable caption="Brand accounts" columns={columns} rows={shown}
            empty={{ title: rows.length ? "No accounts with this status." : "No brand accounts yet.", body: rows.length ? "Pick another filter." : "Brands get an account when they sign up from the brand login page or send a brief.", action: rows.length ? <a className="btn sm" href="?tab=all">See every account</a> : <a className="btn sm" href="/team/campaigns">Open campaigns</a> }} />
        </Section>
      </Grid>
    </TeamShell>
  );
}
