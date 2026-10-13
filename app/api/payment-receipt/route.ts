import { neon } from "@neondatabase/serverless";
import { formatBaht, initialTripData, validateTripData, type Member, type TripData } from "@/lib/trip";
import { getAccountSession, isAuthenticated } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function thaiDate(value: string | undefined, includeTime = false) {
  if (!value) return "ไม่ระบุ";
  const date = new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value);
  if (Number.isNaN(date.getTime())) return "ไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric", month: "long", year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function memberName(members: Member[], id: string) {
  return members.find((member) => member.id === id)?.name ?? "สมาชิก";
}

function htmlPage(content: string, receiptId: string) {
  const safeId = escapeHtml(receiptId.slice(0, 14).toUpperCase());
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ใบเสร็จ ${safeId} · ทริปพลูวิลล่าหรรษา</title>
<style>
@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;background:#edf6fb;color:#15354e;font-family:"Noto Sans Thai",Tahoma,sans-serif;font-size:14px;line-height:1.65}.sheet{width:min(100%,780px);margin:32px auto;padding:42px 48px;background:white;border:1px solid #dceaf2;border-radius:20px;box-shadow:0 14px 42px #164d6c18}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:26px;border-bottom:1px solid #e1edf4}.brand{font-size:14px;color:#087bb5;font-weight:700;letter-spacing:.04em}.title{margin:5px 0 0;font-size:30px;line-height:1.35}.subtitle{margin:4px 0 0;color:#6e8798}.badge{padding:7px 12px;border-radius:30px;background:#e7f7ee;color:#25804e;font-size:12px;font-weight:700;white-space:nowrap}.amount{margin:27px 0;padding:22px 24px;border-radius:14px;background:linear-gradient(120deg,#e9f7fd,#f4fbff);text-align:center}.amount small{display:block;color:#6e8798}.amount strong{display:block;color:#0878b2;font-size:34px;margin-top:2px}.details{display:grid;grid-template-columns:1fr 1fr;gap:19px 28px;margin:26px 0}.detail small{display:block;color:#8298a8;margin-bottom:3px}.detail b{font-size:15px;overflow-wrap:anywhere}.divider{height:1px;background:#e9eff3;margin:25px 0}.reference{display:flex;justify-content:space-between;gap:14px;color:#758a99;font-size:12px}.foot{margin-top:28px;padding-top:18px;border-top:1px solid #e9eff3;color:#8298a8;font-size:11px}.actions{position:fixed;right:22px;bottom:22px}.actions button{border:0;border-radius:10px;padding:12px 18px;background:#087dc1;color:white;font:inherit;font-weight:700;box-shadow:0 8px 24px #087dc133;cursor:pointer}@media(max-width:600px){body{background:white}.sheet{margin:0;padding:26px 20px;border:0;border-radius:0;box-shadow:none}.title{font-size:25px}.details{gap:16px}.amount strong{font-size:30px}}@media print{body{background:white}.sheet{width:100%;margin:0;padding:0;border:0;border-radius:0;box-shadow:none}.actions{display:none}}
</style></head><body><main class="sheet"><header class="top"><div><div class="brand">TRIP PLU VILLA · CHIANG MAI</div><h1 class="title">ใบรับเงิน</h1><p class="subtitle">หลักฐานการชำระเงินที่เจ้าหนี้ตรวจสอบแล้ว</p></div><span class="badge">✓ ยืนยันการรับเงินแล้ว</span></header>
<section class="amount"><small>ยอดที่ได้รับชำระ</small><strong>${content}</strong></section>
<section class="details">{{DETAILS}}</section>
<div class="divider"></div><div class="reference"><span>เลขที่ใบเสร็จ</span><b>${safeId}</b></div>
<footer class="foot">เอกสารนี้ออกจากระบบทริปพลูวิลล่าหรรษา เพื่อยืนยันว่าผู้รับได้ตรวจสอบและยืนยันการชำระเงินแล้ว</footer></main><div class="actions"><button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),450))</script></body></html>`;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return Response.json({ error: "กรุณาเข้าสู่ระบบและเข้าทริปก่อน" }, { status: 401 });
  const account = await getAccountSession(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!account || !id || id.length > 100) return Response.json({ error: "ไม่พบใบเสร็จ" }, { status: 404 });

  try {
    await ensureTripTable();
    const sql = database();
    const rows = await sql`SELECT state FROM trip_state WHERE id = 1`;
    const rawState = rows[0]?.state;
    const data = (typeof rawState === "string" ? JSON.parse(rawState) : rawState) as unknown;
    if (!validateTripData(data)) return Response.json({ error: "ไม่พบใบเสร็จ" }, { status: 404 });
    const trip = data as TripData;
    const repayment = trip.repayments.find((item) => item.id === id);
    const ownMember = trip.members.find((member) => member.accountId === account.id);
    if (!repayment || !ownMember || repayment.from !== ownMember.id || repayment.status === "pending" || !repayment.proofId) {
      return Response.json({ error: "ใบเสร็จจะแสดงให้ลูกหนี้ได้ หลังเจ้าหนี้ยืนยันสลิปแล้ว" }, { status: 403 });
    }

    await ensureProofTable();
    const proofRows = await sql`SELECT payer_member_id, payee_member_id, amount FROM payment_proofs WHERE id = ${repayment.proofId}`;
    const proof = proofRows[0] as { payer_member_id: string; payee_member_id: string; amount: number } | undefined;
    if (!proof || proof.payer_member_id !== repayment.from || proof.payee_member_id !== repayment.to || Number(proof.amount) !== repayment.amount) {
      return Response.json({ error: "ไม่พบหลักฐานการชำระเงินที่ยืนยันแล้ว" }, { status: 404 });
    }

    const details = [
      ["ผู้ชำระเงิน", memberName(trip.members, repayment.from)],
      ["ผู้รับเงิน", memberName(trip.members, repayment.to)],
      ["วันที่โอน", thaiDate(repayment.date)],
      ["ยืนยันรับเงินเมื่อ", thaiDate(repayment.confirmedAt, true)],
      ["ที่พักของทริป", "บ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่"],
      ["สถานะ", "เจ้าหนี้ยืนยันสลิปแล้ว"],
    ].map(([label, value]) => `<div class="detail"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join("");
    const html = htmlPage(escapeHtml(formatBaht(repayment.amount)), id).replace("<section class=\"details\">{{DETAILS}}</section>", `<section class="details">${details}</section>`);
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store, max-age=0", "content-disposition": `inline; filename="receipt-${id.slice(0, 14)}.html"`, "x-content-type-options": "nosniff" } });
  } catch {
    return Response.json({ error: "สร้างใบเสร็จไม่สำเร็จ กรุณาลองใหม่" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
