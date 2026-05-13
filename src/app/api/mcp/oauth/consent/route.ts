/**
 * POST /api/mcp/oauth/consent — Approve / Deny the consent screen.
 *
 * Reads the consent cookie set by /authorize, mints a 10-minute auth code,
 * and 302s the user back to the client's redirect_uri.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  isPlainObject,
  readJsonBody,
} from "@/lib/security/input";
import { parseScopes } from "@/lib/mcp/scopes";

const CONSENT_COOKIE = "orbit_mcp_consent";
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;

type ConsentPayload = {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  pkce: string;
  issuedAt: number;
};

function readConsentCookie(req: NextRequest): ConsentPayload | null {
  const raw = req.cookies.get(CONSENT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const obj = JSON.parse(json) as ConsentPayload;
    if (!obj.clientId || !obj.redirectUri || !obj.pkce) return null;
    if (Date.now() - obj.issuedAt > 10 * 60 * 1000) return null;
    return obj;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const consent = readConsentCookie(req);
  if (!consent) {
    return NextResponse.json(
      { error: "consent_expired", error_description: "Re-start the authorization flow." },
      { status: 400 },
    );
  }

  const parsed = await readJsonBody(req, 4 * 1024);
  if (!parsed.ok) return parsed.response;
  if (!isPlainObject(parsed.value)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const approve = parsed.value.approve === true;
  const requested = parseScopes(consent.scopes);
  const rawGranted = parsed.value.scopes;
  const granted = approve
    ? parseScopes(
        Array.isArray(rawGranted) || typeof rawGranted === "string"
          ? (rawGranted as string | string[])
          : consent.scopes,
      )
    : [];

  // Only allow scopes that were actually requested — UI can shrink but not grow.
  const allowed = approve
    ? granted.filter((s) => requested.includes(s))
    : [];

  const redirectBack = new URL(consent.redirectUri);
  if (consent.state) redirectBack.searchParams.set("state", consent.state);

  // Always clear the cookie before returning.
  const clearCookie = (res: NextResponse) => {
    res.cookies.set({
      name: CONSENT_COOKIE,
      value: "",
      maxAge: 0,
      path: "/",
    });
    return res;
  };

  if (!approve || allowed.length === 0) {
    redirectBack.searchParams.set("error", "access_denied");
    return clearCookie(NextResponse.json({ ok: true, redirect: redirectBack.toString() }));
  }

  const supabase = createSupabaseServiceClient();
  const code = `orbit_code_${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString();

  const { error } = await supabase.from("mcp_auth_codes").insert({
    code,
    client_id: consent.clientId,
    clerk_user_id: userId,
    redirect_uri: consent.redirectUri,
    scopes: allowed,
    pkce_challenge: consent.pkce,
    expires_at: expiresAt,
  });
  if (error) {
    console.error("auth_code insert failed", { userId, code: error.code });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  redirectBack.searchParams.set("code", code);
  // Return as JSON so the consent UI can do a client-side redirect (avoids
  // form-based CSRF surface; the cookie + auth() check already gates this).
  return clearCookie(
    NextResponse.json({ ok: true, redirect: redirectBack.toString() }),
  );
}
