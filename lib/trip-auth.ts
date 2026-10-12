import { env } from "cloudflare:workers";

const COOKIE = "romdee_trip_session";

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function mac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export async function isAuthenticated(request: Request): Promise<boolean> {
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
