import { redirect } from "next/navigation";
import { currentTeam } from "@/lib/net/creatorAuth";

/** The signed-in Colatch team member, or a redirect to the team login. */
export async function requireTeam() {
  const me = await currentTeam().catch(() => null);
  if (!me) redirect("/team/login");
  return me;
}
