import { createOAuthStateCookie } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID) return Response.redirect(new URL("/?auth_error=google_not_configured", request.url), 303);

  const state = randomToken();
  const nonce = randomToken();
  const redirectUri = GOOGLE_REDIRECT_URI || new URL("/api/auth/google/callback", request.url).toString();
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  }).toString();

  return new Response(null, {
    status: 302,
    headers: {
      location: authorization.toString(),
      "cache-control": "no-store",
      "set-cookie": await createOAuthStateCookie(state, nonce),
    },
  });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
