# Backups and restore (Neon Postgres)

Colatch Connect keeps all its data in one Neon Postgres database (`DATABASE_URL`). Neon's
point-in-time restore is the only backup this app has. The app doesn't take its own dumps.

> **Not tested yet.** Nobody has run a restore of the Colatch database. This environment can't
> reach the Neon project. Until Yogesh runs the drill below on a Neon branch, treat restore as
> unproven.

Checked against Neon's docs on 2026-11-16 ([instant restore](https://neon.com/docs/introduction/branch-restore),
[history window](https://neon.com/docs/introduction/history-window),
[branches](https://neon.com/docs/manage/branches)). Check them again if Neon changes plans.

## How it works

- Neon keeps a change history (WAL) for every branch. A root branch, usually `main` or
  `production`, can be put back to any moment inside its **history window**, down to the
  millisecond, using a timestamp or an LSN.
- A restore **overwrites** every database, table and schema on that branch. It is not a merge.
  The connection string stays the same, so Vercel needs no change, and open connections drop
  for a moment.
- Before it restores, Neon saves the current state as a backup branch named
  `<branch>_old_<timestamp>`. To undo a restore, restore again from that backup branch.
- Only **root** branches can be restored in place. Child branches can't.
- **Time Travel Assist** runs read-only queries against any moment in the window. Use it to find
  the right restore point first.
- You can also make a **new branch from past data** without touching production. This is the
  safe way to recover a few rows: copy them across, then delete the branch.

### How far back you can go

| Neon plan | History window (default / maximum) |
|---|---|
| Free | 6 hours / 6 hours, capped at 1 GB of history |
| Launch | 1 day / 7 days |
| Scale | 1 day / 30 days |

**What this means for Colatch:** on the Free plan, a mistake has to be caught within **6 hours**.
After that, the data is gone for good. Before real brand money and payout records go through the
app, move to a paid plan and set the window to 7 days or more. In the Console this is
**Settings → Instant restore / History window**.

## Restore steps

### A. Recover a few rows (production stays live)

1. Find the moment just before the mistake. Look in the `audit_log` table (`/team/audit` in the
   app) for the time of the bad action. Note it in UTC.
2. Neon Console → project → **Branches** → **New branch**.
   - Parent: the production branch.
   - Include: **Past data**, and set the date and time from step 1.
   - Name: `recover-YYYYMMDD`.
3. Open the new branch's connection string. In its SQL Editor (or with `psql`), check that the
   rows look right.
4. Copy only the rows you need back to production, for example with
   `INSERT … SELECT` through `psql`/`pg_dump --data-only -t <table>`. Write down what you
   copied.
5. Delete the `recover-…` branch.

### B. Roll the whole database back (production goes back in time)

Use this only if most of the data is wrong. Every write since the restore point is lost, including
real bookings, payments recorded and creator sign-ups.

1. Pause new writes. Tell the team not to record payments, and hold off any deploy.
2. Find the restore point with **Time Travel Assist** (step 1 of A).
3. Neon Console → select the production branch → **Postgres database → Backup & Restore →
   Restore from history**.
4. Keep **From history**, then enter the timestamp (or LSN).
5. Click **Next**, read the confirmation, then click **Restore**.
6. Check that the app works: `/api/net/health`, log in on `/team`, open a recent deal.
7. Keep the `<branch>_old_<timestamp>` backup branch until you're sure. It has every write made
   after the restore point. Re-enter any real payments or bookings from it by hand, and write
   down each one.

## Restore drill (Yogesh, once, then every quarter)

Run this on a **branch**, never on production:

1. Make a child branch of production called `drill-YYYYMMDD` (current data).
2. Note the time. On the drill branch, change a row you can recognise, for example
   `UPDATE campaigns SET title = title || ' DRILL' WHERE id = '<some id>';`.
3. Make a new branch from `drill-YYYYMMDD` using **Past data** at the time from step 2. Check
   that the title is the old one there.
4. Point a local copy of the app at that branch (`DATABASE_URL=… npm run dev`). Check that it
   starts, and that `/team` and one deal page load.
5. Write down the date, how long it took and anything that was confusing, below. Then delete both
   drill branches.

| Date | Who | Plan / window | Result | Notes |
|---|---|---|---|---|
| _not run yet_ | | | | |

## What is not covered

- Files kept outside Postgres (for example Vercel Blob uploads) have their own retention. Neon
  restore doesn't bring them back.
- Secrets such as `SESSION_SECRET` and API keys live in Vercel's settings, not in the database.
  Keep a copy in the team's password manager.
- A restore puts back data that was deleted on purpose, such as a creator who asked for their
  data to be erased. After a full rollback (B), delete it again.
