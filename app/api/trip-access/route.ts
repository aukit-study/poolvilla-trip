import { createTripCookie, getAccountSession, hashSecret } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  const account = await getAccountSession(request);
  if (!account) return json({ error: "กรุณาเข้าสู่ระบบก่อน" }, 401);
  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  }
  if (typeof body.code !== "string" || body.code.length > 64) return json({ error: "รหัสทริปไม่ถูกต้อง" }, 401);
  const normalizedCode = body.code.trim().toUpperCase().replace(/[\s-]/g, "");
  const secrets = process.env as { TRIP_CODE_HASH?: string };
  const receivedHash = await hashSecret(normalizedCode);
  const expectedHash = secrets.TRIP_CODE_HASH;
  if (!expectedHash) return json({ error: "ระบบรหัสทริปยังตั้งค่าไม่ครบ" }, 503);
  const matches = receivedHash.length === expectedHash.length && [...receivedHash].every((char, index) => char === expectedHash[index]);
  if (!matches) return json({ error: "รหัสทริปไม่ถูกต้อง ลองตรวจอีกครั้งนะ" }, 401);
  return json({ authenticated: true }, 200, { "set-cookie": await createTripCookie(account.id) });
}
