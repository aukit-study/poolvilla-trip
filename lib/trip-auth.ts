const USER_COOKIE = "romdee_user_session";
const TRIP_COOKIE = "romdee_trip_session";
const WEEK = 60 * 60 * 24 * 7;
const OAUTH_STATE_COOKIE = "romdee_google_oauth";
const TEN_MINUTES = 60 * 10;

export type AccountSession = { id: string; name: string; email?: string; picture?: string };

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function mac(value: string): Promise<Uint8Array> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function getCookie(request: Request, name: string): string | null {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

async function readSession<T extends { expiresAt: number }>(raw: string | null): Promise<T | null> {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decode(payload))) as T;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    const expected = await mac(payload);
    const received = decode(signature);
    if (expected.length !== received.length || !expected.every((byte, index) => byte === received[index])) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function issueSession(payload: Record<string, unknown>, maxAge = WEEK): Promise<string> {
  const encoded = encode(new TextEncoder().encode(JSON.stringify({ ...payload, expiresAt: Date.now() + maxAge * 1000 })));
  return `${encoded}.${encode(await mac(encoded))}`;
}

export async function createUserCookie(account: AccountSession): Promise<string> {
  return `${USER_COOKIE}=${await issueSession({ accountId: account.id, name: account.name, email: account.email, picture: account.picture })}; Path=/; Max-Age=${WEEK}; HttpOnly; Secure; SameSite=Lax`;
}

export async function createOAuthStateCookie(state: string, nonce: string): Promise<string> {
  return `${OAUTH_STATE_COOKIE}=${await issueSession({ state, nonce }, TEN_MINUTES)}; Path=/; Max-Age=${TEN_MINUTES}; HttpOnly; Secure; SameSite=Lax`;
}

export async function readOAuthState(request: Request): Promise<{ state: string; nonce: string } | null> {
  const session = await readSession<{ state: string; nonce: string; expiresAt: number }>(getCookie(request, OAUTH_STATE_COOKIE));
  return session && typeof session.state === "string" && typeof session.nonce === "string" ? session : null;
}

export function clearOAuthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function createTripCookie(accountId: string): Promise<string> {
  return `${TRIP_COOKIE}=${await issueSession({ accountId })}; Path=/; Max-Age=${WEEK}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearTripCookie(): string {
  return `${TRIP_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function clearUserCookie(): string {
  return `${USER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function getAccountSession(request: Request): Promise<AccountSession | null> {
  const session = await readSession<{ accountId: string; name: string; email?: string; picture?: string; expiresAt: number }>(getCookie(request, USER_COOKIE));
  if (!session || typeof session.accountId !== "string" || typeof session.name !== "string") return null;
  const picture = typeof session.picture === "string" && session.picture.length <= 2048 ? session.picture : undefined;
  return { id: session.accountId, name: session.name, email: session.email, picture };
}

export async function hasTripAccess(request: Request, accountId: string): Promise<boolean> {
  const session = await readSession<{ accountId: string; expiresAt: number }>(getCookie(request, TRIP_COOKIE));
  return !!session && session.accountId === accountId;
}

export async function isAuthenticated(request: Request): Promise<boolean> {
  const account = await getAccountSession(request);
  return !!account && hasTripAccess(request, account.id);
}

export async function hashSecret(value: string): Promise<string> {
  return encode(await mac(value));
}
