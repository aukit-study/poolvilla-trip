import { neon } from "@neondatabase/serverless";
import { initialTripData, suggestPayments, validateTripData, type TripData } from "@/lib/trip";
import { getAccountSession, isAuthenticated } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

let tripTableReady: Promise<void> | undefined;
let proofTableReady: Promise<void> | undefined;

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

async function readTrip() {
  await ensureTripTable();
  const sql = database();
  const rows = await sql`SELECT state FROM trip_state WHERE id = 1`;
  const state = rows[0]?.state;
  const data = typeof state === "string" ? JSON.parse(state) as unknown : state;
  return validateTripData(data) ? data : null;
}

async function ensureProofTable() {
  if (!proofTableReady) {
    const sql = database();
    proofTableReady = sql`CREATE TABLE IF NOT EXISTS payment_proofs (
      id TEXT PRIMARY KEY,
      payer_member_id TEXT NOT NULL,
      payee_member_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      image_type TEXT NOT NULL,
      image_base64 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`.then(() => undefined);
  }
  try { await proofTableReady; }
  catch (error) { proofTableReady = undefined; throw error; }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return json({ error: "กรุณาเข้าสู่ระบบและเข้าทริปก่อน" }, 401);
  const account = await getAccountSession(request);
  if (!account) return json({ error: "กรุณาเข้าสู่ระบบก่อน" }, 401);
  try {
    const form = await request.formData();
    const id = form.get("id"); const from = form.get("from"); const to = form.get("to"); const amountText = form.get("amount"); const file = form.get("file");
    if (typeof id !== "string" || id.length > 100 || typeof from !== "string" || typeof to !== "string" || typeof amountText !== "string" || !(file instanceof File)) return json({ error: "ข้อมูลสลิปไม่ครบ" }, 400);
    if (!Number.isSafeInteger(Number(amountText)) || Number(amountText) <= 0 || file.size <= 0 || file.size > 700_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return json({ error: "เลือกรูป PNG, JPG หรือ WebP ขนาดไม่เกิน 700 KB" }, 400);
    const trip = await readTrip() as TripData | null;
    if (!trip) return json({ error: "ข้อมูลทริปไม่ถูกต้อง" }, 500);
    const payer = trip.members.find((member) => member.accountId === account.id);
    if (!payer || payer.id !== from || from === to) return json({ error: "ส่งสลิปได้เฉพาะยอดที่ต้องจ่ายจากโปรไฟล์ของคุณ" }, 403);
    const validPayment = suggestPayments(trip, true).some((payment) => payment.from === from && payment.to === to && payment.amount === Number(amountText));
    if (!validPayment) return json({ error: "ยอดนี้เปลี่ยนไปแล้ว กรุณาโหลดรายการชำระเงินล่าสุด" }, 409);
    await ensureProofTable();
    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const sql = database();
    const rows = await sql`INSERT INTO payment_proofs (id, payer_member_id, payee_member_id, amount, image_type, image_base64)
      VALUES (${id}, ${from}, ${to}, ${Number(amountText)}, ${file.type}, ${imageBase64})
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    if (!rows.length) return json({ error: "พบสลิปรายการนี้แล้ว กรุณาโหลดหน้าใหม่" }, 409);
    return json({ proofId: id }, 201);
  } catch {
    return json({ error: "บันทึกสลิปไม่สำเร็จ กรุณาลองใหม่" }, 500);
  }
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return json({ error: "กรุณาเข้าสู่ระบบและเข้าทริปก่อน" }, 401);
  const account = await getAccountSession(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!account || !id || id.length > 100) return json({ error: "ไม่พบสลิป" }, 404);
  try {
    const trip = await readTrip() as TripData | null;
    if (!trip) return json({ error: "ไม่พบสลิป" }, 404);
    const repayment = trip.repayments.find((item) => item.id === id);
    const memberId = trip.members.find((member) => member.accountId === account.id)?.id;
    if (!repayment || !memberId || (repayment.from !== memberId && repayment.to !== memberId)) return json({ error: "ดูสลิปนี้ได้เฉพาะผู้จ่ายและผู้รับ" }, 403);
    await ensureProofTable();
    const sql = database();
    const rows = await sql`SELECT payer_member_id, payee_member_id, image_type, image_base64 FROM payment_proofs WHERE id = ${id}`;
    const proof = rows[0] as { payer_member_id: string; payee_member_id: string; image_type: string; image_base64: string } | undefined;
    if (!proof || proof.payer_member_id !== repayment.from || proof.payee_member_id !== repayment.to) return json({ error: "ไม่พบสลิป" }, 404);
    const binary = Buffer.from(proof.image_base64, "base64");
    return new Response(binary, { headers: { "content-type": proof.image_type, "content-length": String(binary.byteLength), "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" } });
  } catch {
    return json({ error: "เปิดสลิปไม่สำเร็จ" }, 500);
  }
}
