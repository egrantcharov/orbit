/**
 * POST /api/mcp/oauth/register — RFC 7591 Dynamic Client Registration.
 *
 * Public endpoint per spec. Anyone can register a client; the consent flow
 * (which is gated by Clerk) is what controls whether they get a token.
 *
 * To prevent abuse we cap registrations per IP (loose, in-process) and per
 * Orbit user (hard, in the DB).
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHash, randomBytes } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { readJsonBody, isPlainObject, rateLimitResponse } from "@/lib/security/input";

const REGISTER_BODY_MAX = 8 * 1024;
const REGISTER_LIMIT_PER_IP_PER_HOUR = 20;
const MAX_CLIENTS_PER_USER = 50;

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function POST(req: NextRequest) {
  // Soft per-IP rate-limit (in-process; per-instance under Fluid Compute).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = checkRateLimit(
    `mcp_register:${ip}`,
    REGISTER_LIMIT_PER_IP_PER_HOUR,
    60 * 60 * 1000,
  );
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  // We REQUIRE a logged-in Clerk session to register a client. That diverges
  // from pure DCR (which is public) but in our model the client is registered
  // *to* a specific Orbit user; we'd never accept tokens without that
  // ownership link, so we may as well enforce it here.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      {
        error: "invalid_client",
        error_description:
          "Dynamic client registration requires a signed-in Orbit user. Visit /app/settings/mcp to register a client.",
      },
      { status: 401 },
    );
  }

  const parsed = await readJsonBody(req, REGISTER_BODY_MAX);
  if (!parsed.ok) return parsed.response;
  if (!isPlainObject(parsed.value)) {
    return NextResponse.json(
      { error: "invalid_client_metadata" },
      { status: 400 },
    );
  }
  const body = parsed.value;
  const client_name =
    clean(body.client_name, 200) ?? clean(body.client_id, 200) ?? "Untitled MCP client";
  const redirect_uris: string[] = Array.isArray(body.redirect_uris)
    ? (body.redirect_uris as unknown[])
        .filter((u): u is string => typeof u === "string")
        .slice(0, 10)
    : [];
  if (redirect_uris.length === 0) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must contain at least one URI",
      },
      { status: 400 },
    );
  }
  for (const u of redirect_uris) {
    try {
      const parsed = new URL(u);
      // Spec allows custom schemes for native apps. Disallow http://* except localhost.
      if (parsed.protocol === "http:" && !/^(127\.0\.0\.1|localhost)$/.test(parsed.hostname)) {
        return NextResponse.json(
          { error: "invalid_redirect_uri" },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "invalid_redirect_uri" },
        { status: 400 },
      );
    }
  }

  const supabase = createSupabaseServiceClient();

  // Hard cap per user
  const { count } = await supabase
    .from("mcp_clients")
    .select("*", { count: "exact", head: true })
    .eq("clerk_user_id", userId)
    .is("revoked_at", null);
  if ((count ?? 0) >= MAX_CLIENTS_PER_USER) {
    return NextResponse.json(
      {
        error: "limit_exceeded",
        error_description: `Maximum of ${MAX_CLIENTS_PER_USER} MCP clients per user. Revoke an existing client first.`,
      },
      { status: 429 },
    );
  }

  const clientId = `orbit_client_${randomBytes(16).toString("base64url")}`;
  const clientSecret = `orbit_secret_${randomBytes(32).toString("base64url")}`;
  const clientSecretHash = createHash("sha256")
    .update(clientSecret)
    .digest("hex");

  const { error } = await supabase.from("mcp_clients").insert({
    clerk_user_id: userId,
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name,
    redirect_uris,
  });
  if (error) {
    console.error("mcp_clients insert failed", { userId, code: error.code });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0, // never
      client_name,
      redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    },
    { status: 201 },
  );
}
