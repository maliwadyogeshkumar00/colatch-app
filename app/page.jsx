import Match from "./Match";
import { loadRoster } from "../lib/roster";

// Re-read colatch.com/talent at most once an hour; new talent shows up here without a redeploy.
export const revalidate = 3600;

export default async function Page() {
  const r = await loadRoster();
  return <Match roster={r.list} source={r.source} syncedAt={r.syncedAt} />;
}
