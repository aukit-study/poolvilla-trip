import { env } from "cloudflare:workers";
import { initialTripData, validateTripData } from "@/lib/trip";
import { isAuthenticated } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function readTrip(db: D1Database) {
  let row = await db.prepare("SELECT state, version FROM trip_state WHERE id = 1").first<{ state: string; version: number }>();
  if (!row) {
    await db.prepare("INSERT OR IGNORE INTO trip_state (id, state, version, updated_at) VALUES (1, ?, 1, ?)")
      .bind(JSON.stringify(initialTripData), new Date().toISOString()).run();
    row = await db.prepare("SELECT state, version FROM trip_state WHERE id = 1").first<{ state: string; version: number }>();
  }
  return row;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return json({ error: "กรุณาใส่รหัสทริปก่อน" }, 401);
  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await readTrip(db);
  if (!row) return json({ error: "โหลดข้อมูลทริปไม่สำเร็จ" }, 500);
  return json({ data: JSON.parse(row.state), version: row.version });
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
  const db = (env as unknown as { DB: D1Database }).DB;
  const current = await readTrip(db);
  if (!current) return json({ error: "ไม่พบข้อมูลทริป" }, 500);
  if (current.version !== body.version) return json({ error: "มีคนแก้ข้อมูลพร้อมกัน ข้อมูลล่าสุดถูกโหลดใหม่แล้ว กรุณาลองอีกครั้ง" }, 409);
  const result = await db.prepare("UPDATE trip_state SET state = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ?")
    .bind(JSON.stringify(body.data), new Date().toISOString(), body.version).run();
  if (!result.meta.changes) return json({ error: "มีคนแก้ข้อมูลพร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง" }, 409);
  const saved = await readTrip(db);
  return json({ data: JSON.parse(saved!.state), version: saved!.version });
}
