import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type TripActivityDraft = {
  actorMemberId: string;
  actorName: string;
  kind: string;
  summary: string;
  recipientMemberId?: string;
};

let activityTablesReady: Promise<void> | undefined;
export type TripActivitySql = NeonQueryFunction<false, false>;

function database(): TripActivitySql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export async function ensureTripActivityTables(sql: TripActivitySql = database()) {
  if (!activityTablesReady) {
    activityTablesReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS trip_activity (
        id TEXT PRIMARY KEY,
        actor_member_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        recipient_member_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS trip_activity_created_at_idx ON trip_activity (created_at DESC)`;
      await sql`CREATE TABLE IF NOT EXISTS trip_activity_reads (
        activity_id TEXT NOT NULL REFERENCES trip_activity(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL,
        read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (activity_id, member_id)
      )`;
    })();
  }
  try { await activityTablesReady; }
  catch (error) { activityTablesReady = undefined; throw error; }
}

export async function recordTripActivities(activities: TripActivityDraft[], sql: TripActivitySql = database()) {
  if (!activities.length) return;
  await ensureTripActivityTables(sql);
  await Promise.all(activities.map((activity) => sql`INSERT INTO trip_activity
    (id, actor_member_id, actor_name, kind, summary, recipient_member_id)
    VALUES (${crypto.randomUUID()}, ${activity.actorMemberId}, ${activity.actorName}, ${activity.kind}, ${activity.summary}, ${activity.recipientMemberId ?? null})`));
  await sql`DELETE FROM trip_activity WHERE id IN (
    SELECT id FROM trip_activity ORDER BY created_at DESC OFFSET 500
  )`;
}
