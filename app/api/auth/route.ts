import { clearTripCookie, clearUserCookie, getAccountSession, hasTripAccess } from "@/lib/trip-auth";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function GET(request: Request) {
  const account = await getAccountSession(request);
  return json({ account, tripAuthenticated: account ? await hasTripAccess(request, account.id) : false });
}

export async function DELETE() {
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", clearUserCookie());
  headers.append("set-cookie", clearTripCookie());
  return json({ account: null, tripAuthenticated: false }, 200, headers);
}
