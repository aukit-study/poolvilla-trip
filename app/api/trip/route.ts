import { neon } from "@neondatabase/serverless";
import { initialTripData, validateTripData } from "@/lib/trip";
import { isAuthenticated } from "@/lib/trip-auth";

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

async function readTrip(): Promise<TripRow> {
  const sql = database();
  await sql`CREATE TABLE IF NOT EXISTS trip_state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    state JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`INSERT INTO trip_state (id, state, version, updated_at)
    VALUES (1, ${JSON.stringify(initialTripData)}::jsonb, 1, NOW())
    ON CONFLICT (id) DO NOTHING`;
  const rows = await sql`SELECT state, version FROM trip_state WHERE id = 1`;
  const row = rows[0] as TripRow | undefined;
  if (!row) throw new Error("Trip state is missing");
  return row;
}

function parseState(state: unknown) {
  return typeof state === "string" ? JSON.parse(state) as unknown : state;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return json({ error: "กรุณาใส่รหัสทริปก่อน" }, 401);
  try {
    const row = await readTrip();
    const data = parseState(row.state);
    if (!validateTripData(data)) return json({ error: "ข้อมูลทริปไม่ถูกต้อง" }, 500);
    return json({ data, version: row.version });
  } catch {
    return json({ error: "โหลดข้อมูลทริปไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าฐานข้อมูล" }, 500);
  }
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated(request))) return json({ error: "เซสชันหมดอายุ กรุณาใส่รหัสอีกครั้ง" }, 401);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 250_000) return json({ error: "ข้อมูลมีขนาดใหญ่เกินไป" }, 413);
  let body: { data?: unknown; version?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  }
  if (typeof body.version !== "number" || !Number.isSafeInteger(body.version) || !validateTripData(body.data)) return json({ error: "ข้อมูลทริปไม่ครบหรือมีรูปแบบไม่ถูกต้อง" }, 400);

  try {
    await readTrip();
    const sql = database();
    const rows = await sql`UPDATE trip_state SET state = ${JSON.stringify(body.data)}::jsonb,
      version = version + 1, updated_at = NOW()
      WHERE id = 1 AND version = ${body.version}
      RETURNING state, version`;
    const row = rows[0] as TripRow | undefined;
    if (!row) return json({ error: "มีคนแก้ข้อมูลพร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง" }, 409);
    return json({ data: parseState(row.state), version: row.version });
  } catch {
    return json({ error: "บันทึกไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าฐานข้อมูล" }, 500);
  }
}
