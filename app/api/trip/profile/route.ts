import { neon } from "@neondatabase/serverless";
import { initialTripData, validateTripData, type Member, type TripData } from "@/lib/trip";
import { recordTripActivities } from "@/lib/trip-activity";
import { getAccountSession, isAuthenticated } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TripRow = { state: unknown; version: number };
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

let tripTableReady: Promise<void> | undefined;

async function ensureTripTable() {
  if (!tripTableReady) {
    const sql = database();
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
}

async function readTrip(): Promise<TripRow> {
  await ensureTripTable();
  const sql = database();
  const rows = await sql`SELECT state, version FROM trip_state WHERE id = 1`;
  const row = rows[0] as TripRow | undefined;
  if (!row) throw new Error("Trip state is missing");
  return row;
}
function parseState(state: unknown) { return typeof state === "string" ? JSON.parse(state) as unknown : state; }

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return json({ error: "เซสชันหมดอายุ กรุณาใส่รหัสทริปอีกครั้ง" }, 401);
  const account = await getAccountSession(request);
  if (!account) return json({ error: "กรุณาเข้าสู่ระบบก่อน" }, 401);
  let body: { name?: unknown };
  try { body = await request.json(); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 40) {
    return json({ error: "ใส่ชื่อเล่น 1–40 ตัวอักษรก่อนนะ" }, 400);
  }
  try {
    const sql = database();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = await readTrip();
      const data = parseState(row.state);
      if (!validateTripData(data)) return json({ error: "ข้อมูลทริปไม่ถูกต้อง" }, 500);
      const current = data as TripData;
      const existing = current.members.find((member) => member.accountId === account.id);
      if (existing) return json({ data: current, version: row.version });
      const member: Member = {
        id: crypto.randomUUID(), accountId: account.id, name: body.name.trim(),
        googleAvatarUrl: account.picture,
        role: current.members.some((person) => person.role === "organizer") ? "member" : "organizer",
        attendance: "pending",
      };
      const next = { ...current, members: [...current.members, member] };
      const updated = await sql`UPDATE trip_state SET state = ${JSON.stringify(next)}::jsonb,
        version = version + 1, updated_at = NOW() WHERE id = 1 AND version = ${row.version}
        RETURNING state, version`;
      const saved = updated[0] as TripRow | undefined;
      if (saved) {
        try { await recordTripActivities([{ actorMemberId: member.id, actorName: member.name, kind: "member", summary: "เข้าร่วมทริปแล้ว" }], sql); }
        catch { /* Profile creation should not fail if the activity table is temporarily unavailable. */ }
        return json({ data: parseState(saved.state), version: saved.version });
      }
    }
    return json({ error: "บันทึกชื่อไม่สำเร็จ มีคนแก้ข้อมูลพร้อมกัน ลองอีกครั้งนะ" }, 409);
  } catch {
    return json({ error: "บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, 500);
  }
}
