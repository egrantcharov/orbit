/**
 * POST /api/mcp/pat — mint a Personal Access Token.
 *
 * Headless-scripts path: the user creates a token directly from the
 * settings page (instead of running the OAuth client-registration +
 * authorize dance). Each PAT gets its own `mcp_clients` row so the
 * same revocation flow works for OAuth + PAT.
 *
 * Returned ONCE — never readable again. Hash is what lives in the DB.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomBytes, createHash } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  isPlainObject,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/security/input";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { mintTokenString } from "@/lib/mcp/auth";
import { ALL_SCOPES, parseScopes } from "@/lib/mcp/scopes";

const PAT_LIMIT_PER_HOUR = 10;
const PAT_BODY_MAX = 4 * 1024;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(
    `mcp_pat:${userId}`,
    PAT_LIMIT_PER_HOUR,
    60 * 60 * 1000,
  );
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const parsed = await readJsonBody(req, PAT_BODY_MAX);
  if (!parsed.ok) return parsed.response;
  if (!isPlainObject(parsed.value)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name =
    typeof parsed.value.name === "string" && parsed.value.name.trim()
      ? parsed.value.name.trim().slice(0, 100)
      : `PAT ${new Date().toISOString().slice(0, 10)}`;
  const scopesRaw = parsed.value.scopes;
  const scopes =
    scopesRaw === "all" || (Array.isArray(scopesRaw) && scopesRaw.length === 0)
      ? ALL_SCOPES
      : parseScopes(
          Array.isArray(scopesRaw) || typeof scopesRaw === "string"
            ? (scopesRaw as string | string[])
            : null,
        );
  if (scopes.length === 0) {
    return NextResponse.json(
      { error: "invalid_scopes", message: "Must request at least one scope." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();

  // One client row per PAT so revoke + audit log stay consistent. The
  // client_secret is unused (PATs don't OAuth) but the column is NOT NULL.
  const clientId = `orbit_pat_client_${randomBytes(12).toString("base64url")}`;
  const clientSecretHash = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
  const { error: clientErr } = await supabase.from("mcp_clients").insert({
    clerk_user_id: userId,
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: name,
    redirect_uris: [],
    scopes_granted: scopes,
  });
  if (clientErr) {
    console.error("pat client insert failed", { userId, code: clientErr.code });
    return NextResponse.json(
      { error: "db_error", message: clientErr.message },
      { status: 500 },
    );
  }

  const tok = mintTokenString("pat");
  const { error: tokErr } = await supabase.from("mcp_tokens").insert({
    client_id: clientId,
    clerk_user_id: userId,
    token_hash: tok.hash,
    kind: "pat",
    scopes,
    // PATs don't expire. Revoke deletes them.
    expires_at: null,
  });
  if (tokErr) {
    // Best-effort cleanup of the orphan client row.
    await supabase.from("mcp_clients").delete().eq("client_id", clientId);
    console.error("pat token insert failed", { userId, code: tokErr.code });
    return NextResponse.json(
      { error: "db_error", message: tokErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    token: tok.raw,
    client_id: clientId,
    scopes,
    name,
    note: "Save this token — you won't see it again. Use it as a Bearer header against /api/mcp.",
  });
}
