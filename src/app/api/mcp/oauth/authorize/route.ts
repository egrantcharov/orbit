/**
 * GET /api/mcp/oauth/authorize — OAuth 2.1 authorization endpoint.
 *
 * The flow:
 *   1. Client redirects user here with `client_id`, `redirect_uri`,
 *      `scope`, `code_challenge` (S256), and `state`.
 *   2. If the user isn't signed in, Clerk redirects to /sign-in then back.
 *   3. We persist the request params in a signed cookie (so the consent page
 *      can read them) and redirect to /app/settings/mcp/consent.
 *   4. The consent page POSTs Approve/Deny to /api/mcp/oauth/consent which
 *      mints a code and 302s back to the client's redirect_uri.
 *
 * Why a cookie + UI page instead of a server-rendered consent form here?
 * Because the consent UI needs to look like the rest of Orbit (Tailwind, our
 * Card component, etc.) and Server Components in app/ give us that for free.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { parseScopes } from "@/lib/mcp/scopes";

const CONSENT_COOKIE = "orbit_mcp_consent";
const CONSENT_TTL_SECONDS = 600; // 10 minutes

function redirectError(
  redirectUri: string | null,
  state: string | null,
  error: string,
  description?: string,
): NextResponse {
  if (!redirectUri) {
    return NextResponse.json(
      { error, error_description: description },
      { status: 400 },
    );
  }
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return NextResponse.redirect(u);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type") ?? "code";
  const scope = url.searchParams.get("scope") ?? "";
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod =
    url.searchParams.get("code_challenge_method") ?? "S256";

  if (!clientId) {
    return NextResponse.json({ error: "invalid_request", error_description: "client_id required" }, { status: 400 });
  }
  if (responseType !== "code") {
    return redirectError(redirectUri, state, "unsupported_response_type");
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return redirectError(redirectUri, state, "invalid_request", "PKCE S256 required");
  }
  if (!redirectUri) {
    return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri required" }, { status: 400 });
  }

  // Verify the client + redirect_uri pairing.
  const supabase = createSupabaseServiceClient();
  const { data: client } = await supabase
    .from("mcp_clients")
    .select("client_id, redirect_uris, revoked_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client || client.revoked_at) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }
  if (!client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_redirect_uri" },
      { status: 400 },
    );
  }

  // Require a Clerk session. If absent, bounce through sign-in and return.
  const { userId } = await auth();
  if (!userId) {
    const back = url.pathname + url.search;
    const signIn = new URL("/sign-in", url.origin);
    signIn.searchParams.set("redirect_url", back);
    return NextResponse.redirect(signIn);
  }

  // Stash the request params for the consent UI to render. Cookie is HttpOnly,
  // SameSite=Lax (we redirect back via 302), Secure in prod.
  const payload = {
    clientId,
    redirectUri,
    scopes: parseScopes(scope),
    state: state ?? "",
    pkce: codeChallenge,
    issuedAt: Date.now(),
  };
  const consent = new URL("/app/settings/mcp/consent", url.origin);
  const res = NextResponse.redirect(consent);
  res.cookies.set({
    name: CONSENT_COOKIE,
    value: Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CONSENT_TTL_SECONDS,
    path: "/",
  });
  return res;
}
