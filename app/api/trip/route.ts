import { neon } from "@neondatabase/serverless";
import { defaultVilla, initialTripData, validateTripData, type Member, type TripData } from "@/lib/trip";
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

function parseState(state: unknown) {
  return typeof state === "string" ? JSON.parse(state) as unknown : state;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return json({ error: "กรุณาใส่รหัสทริปก่อน" }, 401);
  try {
    const account = await getAccountSession(request);
    if (!account) return json({ error: "กรุณาเข้าสู่ระบบก่อน" }, 401);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const row = await readTrip();
      const data = parseState(row.state);
      if (!validateTripData(data)) return json({ error: "ข้อมูลทริปไม่ถูกต้อง" }, 500);
      const members = data.members as Member[];
      const own = members.find((member) => member.accountId === account.id);
      const visibleData = {
        ...data,
        villa: {
          ...data.villa,
          mapUrl: data.villa.mapUrl || defaultVilla.mapUrl,
          phone: data.villa.phone || defaultVilla.phone,
        },
        ...(own && account.picture && !own.googleAvatarUrl
          ? { members: members.map((member) => member.id === own.id ? { ...member, googleAvatarUrl: account.picture } : member) }
          : {}),
      };
      return json({ data: visibleData, version: row.version, needsProfile: !own });
    }
    return json({ error: "โหลดข้อมูลทริปไม่สำเร็จ ลองโหลดหน้าใหม่อีกครั้ง" }, 409);
  } catch {
    return json({ error: "โหลดข้อมูลทริปไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าฐานข้อมูล" }, 500);
  }
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated(request))) return json({ error: "เซสชันหมดอายุ กรุณาใส่รหัสอีกครั้ง" }, 401);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4_000_000) return json({ error: "ข้อมูลมีขนาดใหญ่เกินไป" }, 413);
  let body: { data?: unknown; version?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  }
  if (typeof body.version !== "number" || !Number.isSafeInteger(body.version) || !validateTripData(body.data)) return json({ error: "ข้อมูลทริปไม่ครบหรือมีรูปแบบไม่ถูกต้อง" }, 400);
  if (JSON.stringify(body.data).length > 3_900_000) return json({ error: "ข้อมูลรวมรูป QR มีขนาดใหญ่เกินไป" }, 413);

  try {
    const account = await getAccountSession(request);
    if (!account) return json({ error: "กรุณาเข้าสู่ระบบก่อน" }, 401);
    const currentRow = await readTrip();
    const current = parseState(currentRow.state);
    if (!validateTripData(current)) return json({ error: "ข้อมูลทริปไม่ถูกต้อง" }, 500);
    if (currentRow.version !== body.version) return json({ error: "มีคนแก้ข้อมูลพร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง" }, 409);
    const next = body.data as TripData;
    const linked = current.members.filter((member) => member.accountId);
    for (const member of linked) {
      const proposed = next.members.find((candidate) => candidate.id === member.id);
      if (member.accountId !== account.id) {
        if (!proposed || JSON.stringify(proposed) !== JSON.stringify(member)) return json({ error: "แก้ไขโปรไฟล์ของสมาชิกคนอื่นไม่ได้" }, 403);
      } else if (!proposed || proposed.accountId !== account.id || proposed.role !== member.role) {
        return json({ error: "แก้ไขหรือลบสมาชิกที่เชื่อมกับบัญชีไม่ได้" }, 400);
      }
    }
    if (next.members.filter((member) => member.accountId === account.id).length !== 1 || next.members.some((member) => member.accountId && !linked.some((existing) => existing.id === member.id) && member.accountId !== account.id)) {
      return json({ error: "ข้อมูลการเชื่อมบัญชีสมาชิกไม่ถูกต้อง" }, 400);
    }

    const ownMember = linked.find((member) => member.accountId === account.id);
    if (!ownMember) return json({ error: "ไม่พบโปรไฟล์สมาชิกของคุณ กรุณาโหลดหน้าใหม่" }, 409);
    for (const previous of current.expenses) {
      const proposed = next.expenses.find((expense) => expense.id === previous.id);
      const unchanged = proposed && previous.title === proposed.title && previous.category === proposed.category && previous.amount === proposed.amount && previous.paidBy === proposed.paidBy && previous.date === proposed.date && JSON.stringify(previous.participantIds) === JSON.stringify(proposed.participantIds);
      if (previous.paidBy !== ownMember.id && !unchanged) {
        return json({ error: "แก้ไขหรือลบรายจ่ายได้เฉพาะคนที่ออกเงินให้ก่อนเท่านั้น" }, 403);
      }
    }
    const proposedOwn = next.members.find((member) => member.id === ownMember.id);
    if (proposedOwn && (proposedOwn.promptPay !== ownMember.promptPay || proposedOwn.qrDataUrl !== ownMember.qrDataUrl) && (!proposedOwn.promptPay?.trim() || !proposedOwn.qrDataUrl)) {
      return json({ error: "กรุณาระบุ PromptPay และ QR รับเงินให้ครบก่อนบันทึกโปรไฟล์" }, 400);
    }
    const sql = database();
    const oldRepayments = new Map(current.repayments.map((repayment) => [repayment.id, repayment]));
    const newRepayments = new Map(next.repayments.map((repayment) => [repayment.id, repayment]));
    const newlyConfirmed = new Set<string>();
    for (const previous of current.repayments) {
      const proposed = newRepayments.get(previous.id);
      if (!proposed) return json({ error: "ลบประวัติการชำระเงินไม่ได้" }, 403);
      const unchanged = previous.from === proposed.from && previous.to === proposed.to && previous.amount === proposed.amount && previous.date === proposed.date && previous.proofId === proposed.proofId && previous.confirmedAt === proposed.confirmedAt;
      if (!unchanged) return json({ error: "แก้ไขรายการชำระเงินที่มีอยู่ไม่ได้" }, 403);
      if ((previous.status ?? "confirmed") !== (proposed.status ?? "confirmed") && (previous.status !== "pending" || proposed.status !== "confirmed" || previous.to !== ownMember.id)) {
        return json({ error: "เฉพาะผู้รับเงินเท่านั้นที่ยืนยันสลิปได้" }, 403);
      }
      if (previous.status === "pending" && proposed.status === "confirmed") newlyConfirmed.add(previous.id);
    }
    for (const repayment of next.repayments) {
      if (!oldRepayments.has(repayment.id) && (repayment.from !== ownMember.id || repayment.status !== "pending" || !repayment.proofId)) {
        return json({ error: "รายการใหม่ต้องเป็นการส่งสลิปจากโปรไฟล์ของคุณ" }, 403);
      }
      if (!oldRepayments.has(repayment.id) || (oldRepayments.get(repayment.id)?.status === "pending" && repayment.status === "confirmed")) {
        const proof = await sql`SELECT payer_member_id, payee_member_id, amount FROM payment_proofs WHERE id = ${repayment.proofId ?? ""}`;
        const row = proof[0] as { payer_member_id: string; payee_member_id: string; amount: number } | undefined;
        if (!row || row.payer_member_id !== repayment.from || row.payee_member_id !== repayment.to || Number(row.amount) !== repayment.amount) return json({ error: "ไม่พบสลิปที่ตรงกับรายการชำระเงินนี้" }, 400);
      }
    }
    const stateToSave: TripData = newlyConfirmed.size ? {
      ...next,
      repayments: next.repayments.map((repayment) => newlyConfirmed.has(repayment.id) ? { ...repayment, confirmedAt: new Date().toISOString() } : repayment),
    } : next;
    const rows = await sql`UPDATE trip_state SET state = ${JSON.stringify(stateToSave)}::jsonb,
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
