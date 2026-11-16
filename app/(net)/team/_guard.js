import { redirect } from "next/navigation";
import { currentTeam } from "@/lib/net/creatorAuth";
import { can } from "@/lib/net/security";
import { flashUrl } from "../_ui/flash";

/**
 * The signed-in Colatch team member, or a redirect to the team login.
 * With a permission ("shortlist", "finance", "team", "owner"), members without it are sent back
 * with an explanation instead of being allowed through.
 *
 * Call it at the top of every team page AND inside every team Server Action: an action can be invoked
 * directly, so a check in the page alone does not protect it.
 */
export async function requireTeam(perm = "view", back = "/team") {
  const me = await currentTeam().catch(() => null);
  if (!me) redirect("/team/login");
  if (!can(me.role, perm)) redirect(flashUrl(back, "err", `Your role (${me.role}) can't do that. Ask an owner or admin.`));
  return me;
}
