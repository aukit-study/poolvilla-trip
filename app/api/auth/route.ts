import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
const COOKIE = "romdee_trip_session";
const WEEK = 60 * 60 * 24 * 7;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function mac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function validSession(request: Request): Promise<boolean> {
  const raw = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { expiresAt?: number };
    if (typeof data.expiresAt !== "number" || data.expiresAt < Date.now()) return false;
    const expected = await mac(payload, (env as unknown as { SESSION_SECRET: string }).SESSION_SECRET);
    const received = fromBase64Url(signature);
    return expected.length === received.length && expected.every((byte, index) => byte === received[index]);
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function GET(request: Request) {
  return json({ authenticated: await validSession(request) });
}

export async function POST(request: Request) {
  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  }
  if (typeof body.code !== "string" || body.code.length > 64) return json({ error: "รหัสทริปไม่ถูกต้อง" }, 401);
  const normalizedCode = body.code.trim().toUpperCase().replace(/[\s-]/g, "");
  const secrets = env as unknown as { TRIP_CODE_HASH: string; SESSION_SECRET: string };
  const receivedHash = base64Url(await mac(normalizedCode, secrets.SESSION_SECRET));
  const expectedHash = secrets.TRIP_CODE_HASH;
  const matches = receivedHash.length === expectedHash.length && [...receivedHash].every((char, index) => char === expectedHash[index]);
  if (!matches) return json({ error: "รหัสทริปไม่ถูกต้อง ลองตรวจอีกครั้งนะ" }, 401);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ expiresAt: Date.now() + WEEK })));
  const signature = base64Url(await mac(payload, secrets.SESSION_SECRET));
  return json({ authenticated: true }, 200, { "set-cookie": `${COOKIE}=${payload}.${signature}; Path=/; Max-Age=${WEEK}; HttpOnly; Secure; SameSite=Lax` });
}

export async function DELETE() {
  return json({ authenticated: false }, 200, { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
}
