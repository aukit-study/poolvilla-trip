import { neon } from "@neondatabase/serverless";
import { initialTripData, validateTripData, type TripData } from "@/lib/trip";
import { ensureTripActivityTables, type TripActivitySql } from "@/lib/trip-activity";
import { getAccountSession, isAuthenticated } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TripRow = { state: unknown };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function database(): TripActivitySql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

let tripTableReady: Promise<void> | undefined;

async function readTrip(sql: TripActivitySql) {
  if (!tripTableReady) {
    tripTableReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS trip_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1), state JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`INSERT INTO trip_state (id, state, version, updated_at)
        VALUES (1, ${JSON.stringify(initialTripData)}::jsonb, 1, NOW()) ON CONFLICT (id) DO NOTHING`;
    })();
  }
  try { await tripTableReady; }
  catch (error) { tripTableReady = undefined; throw error; }
  const rows = await sql`SELECT state FROM trip_state WHERE id = 1`;
  const state = (rows[0] as TripRow | undefined)?.state;
  const data = typeof state === "string" ? JSON.parse(state) as unknown : state;
  return validateTripData(data) ? data as TripData : null;
}

async function currentMember(request: Request, sql: TripActivitySql) {
  if (!(await isAuthenticated(request))) return { error: json({ error: "กรุณาเข้าสู่ระบบและเข้าทริปก่อน" }, 401) };
  const account = await getAccountSession(request);
  if (!account) return { error: json({ error: "กรุณาเข้าสู่ระบบก่อน" }, 401) };
  const data = await readTrip(sql);
  if (!data) return { error: json({ error: "ข้อมูลทริปไม่ถูกต้อง" }, 500) };
  const member = data.members.find((person) => person.accountId === account.id);
  if (!member) return { error: json({ error: "ไม่พบโปรไฟล์สมาชิกของคุณ" }, 403) };
  return { member };
}

export async function GET(request: Request) {
  const sql = database();
  try {
    const result = await currentMember(request, sql);
    if ("error" in result) return result.error;
    await ensureTripActivityTables(sql);
    const rows = (await sql`SELECT a.id, a.actor_member_id AS "actorMemberId", a.actor_name AS "actorName",
      a.kind, a.summary, a.recipient_member_id AS "recipientMemberId", a.created_at AS "createdAt",
      (a.actor_member_id = ${result.member.id} OR r.activity_id IS NOT NULL) AS "isRead"
      FROM trip_activity a
      LEFT JOIN trip_activity_reads r ON r.activity_id = a.id AND r.member_id = ${result.member.id}
      WHERE a.recipient_member_id IS NULL OR a.recipient_member_id = ${result.member.id}
      ORDER BY a.created_at DESC LIMIT 100`) as unknown as Record<string, unknown>[];
    return json({ activities: rows });
  } catch {
    return json({ error: "โหลดแจ้งเตือนและประวัติไม่สำเร็จ" }, 500);
  }
}

export async function POST(request: Request) {
  const sql = database();
  try {
    const result = await currentMember(request, sql);
    if ("error" in result) return result.error;
    let body: { ids?: unknown };
    try { body = await request.json() as { ids?: unknown }; }
    catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
    if (!Array.isArray(body.ids) || body.ids.length > 100 || body.ids.some((id) => typeof id !== "string" || id.length > 100)) {
      return json({ error: "รายการแจ้งเตือนไม่ถูกต้อง" }, 400);
    }
    await ensureTripActivityTables(sql);
    const ids = [...new Set(body.ids as string[])];
    await Promise.all(ids.map((id) => sql`INSERT INTO trip_activity_reads (activity_id, member_id)
      SELECT id, ${result.member.id} FROM trip_activity
      WHERE id = ${id} AND (recipient_member_id IS NULL OR recipient_member_id = ${result.member.id})
      ON CONFLICT (activity_id, member_id) DO NOTHING`));
    return json({ marked: ids.length });
  } catch {
    return json({ error: "อัปเดตสถานะแจ้งเตือนไม่สำเร็จ" }, 500);
  }
}
