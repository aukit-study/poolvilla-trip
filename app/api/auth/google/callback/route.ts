import { clearOAuthStateCookie, clearTripCookie, createUserCookie, readOAuthState } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";

type GoogleClaims = {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  email_verified?: boolean | string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nonce?: string;
};

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (code: string) => {
    const headers = new Headers({ location: new URL(`/?auth_error=${encodeURIComponent(code)}`, request.url).toString(), "cache-control": "no-store" });
    headers.append("set-cookie", clearOAuthStateCookie());
    return new Response(null, { status: 303, headers });
  };

  const state = await readOAuthState(request);
  if (!state || url.searchParams.get("state") !== state.state) return fail("google_login_failed");
  if (url.searchParams.has("error")) return fail("google_login_cancelled");
  const code = url.searchParams.get("code");
  if (!code) return fail("google_login_failed");

  const values = process.env as { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GOOGLE_REDIRECT_URI?: string };
  if (!values.GOOGLE_CLIENT_ID || !values.GOOGLE_CLIENT_SECRET) return fail("google_not_configured");
  const redirectUri = values.GOOGLE_REDIRECT_URI || new URL("/api/auth/google/callback", request.url).toString();

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: values.GOOGLE_CLIENT_ID,
        client_secret: values.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return fail("google_login_failed");
    const token = await tokenResponse.json() as { id_token?: string };
    if (!token.id_token) return fail("google_login_failed");
    const claims = await verifyIdToken(token.id_token, values.GOOGLE_CLIENT_ID);
    if (!claims || claims.nonce !== state.nonce || !claims.sub || !claims.email) return fail("google_login_failed");
    if (claims.email_verified !== true && claims.email_verified !== "true") return fail("google_email_unverified");

    const account = { id: `google:${claims.sub}`, name: claims.name?.trim() || claims.email, email: claims.email, picture: claims.picture };
    const headers = new Headers({ location: new URL("/", request.url).toString(), "cache-control": "no-store" });
    headers.append("set-cookie", await createUserCookie(account));
    headers.append("set-cookie", clearTripCookie());
    headers.append("set-cookie", clearOAuthStateCookie());
    return new Response(null, { status: 303, headers });
  } catch {
    return fail("google_login_failed");
  }
}

async function verifyIdToken(token: string, clientId: string): Promise<GoogleClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]);
  const claims = decodeJson<GoogleClaims>(parts[1]);
  if (!header || header.alg !== "RS256" || !header.kid || !claims) return null;
  const jwksResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!jwksResponse.ok) return null;
  const jwks = await jwksResponse.json() as { keys?: Jwk[] };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.alg === "RS256");
  if (!jwk) return null;

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = toArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const signature = toArrayBuffer(decodeBase64Url(parts[2]));
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed)) return null;

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issuerOk || !audiences.includes(clientId) || typeof claims.exp !== "number" || claims.exp <= now || typeof claims.iat !== "number" || claims.iat > now + 60) return null;
  return claims;
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
