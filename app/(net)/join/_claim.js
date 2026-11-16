// Profile claims. When someone joins with the Instagram handle of a creator Colatch already has on file
// (imported by the team, or added from a brief), we can't know the person typing is that creator.
// Their account starts as a pending claim: they can log in, but they can't see that creator's deals,
// earnings or payout details, and can't edit the profile, until a team member verifies it.
import { env } from "@/lib/net/env";

/** "own" | "pending" | "rejected" for a creator account. Unknown accounts count as not verified. */
export async function claimStatus(accountId) {
  const r = await env.DB.prepare("SELECT claim_status FROM creator_accounts WHERE id=?").bind(accountId).first();
  return r?.claim_status || "pending";
}

export const claimVerified = async (accountId) => (await claimStatus(accountId)) === "own";

export function ClaimNote({ status }) {
  if (status === "own") return null;
  if (status === "rejected")
    return <div className="note bad" role="alert">We could not confirm this Instagram profile belongs to you, so it is not linked to your account. If this is a mistake, write to <a className="link" href="mailto:marketing@colatch.com">marketing@colatch.com</a> from the email on your account.</div>;
  return <div className="note" role="status"><b>We are verifying this profile is yours.</b> Colatch already had this Instagram profile on file, so a team member checks it is really you before deals, earnings and payout details show up here. This usually takes one working day. To speed it up, DM <b>@colatch</b> on Instagram from that account.</div>;
}
