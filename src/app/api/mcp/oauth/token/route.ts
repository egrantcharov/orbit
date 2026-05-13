/**
 * POST /api/mcp/oauth/token — RFC 6749 token endpoint.
 *
 * Two grants supported:
 *   - authorization_code (PKCE S256 verifier required)
 *   - refresh_token
 *
 * Returns:
 *   { access_token, token_type: "Bearer", expires_in, refresh_token, scope }
 *
 * Access tokens are 60 minutes, refresh tokens are 30 days. Both are
 * stored as sha256 hashes. Refresh tokens also store the encrypted raw
 * value so we can revoke per-token rather than per-hash.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptToken } from "@/lib/crypto";
import { hashToken, mintTokenString } from "@/lib/mcp/auth";
import { parseScopes, type Scope } from "@/lib/mcp/scopes";

export const dynamic = "force-dynamic";

const ACCESS_TTL_MS = 60 * 60 * 1000;      // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Body = {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
};

async function parseForm(req: NextRequest): Promise<Body | null> {
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    if (text.length > 16 * 1024) return null;
    return Object.fromEntries(new URLSearchParams(text)) as Body;
  }
  if (ctype.includes("application/json")) {
    try {
      return (await req.json()) as Body;
    } catch {
      return null;
    }
  }
  return null;
}

function err(code: string, description?: string, status = 400) {
  return NextResponse.json(
    {
      error: code,
      ...(description ? { error_description: description } : {}),
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}

async function authenticateClient(
  body: Body,
  authzHeader: string | null,
): Promise<{ clientId: string; ok: boolean }> {
  // Accept client_secret in body OR HTTP Basic OR none (public client + PKCE).
  let clientId: string | null = body.client_id ?? null;
  let clientSecret: string | null = body.client_secret ?? null;
  if (authzHeader?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authzHeader.slice(6), "base64").toString("utf8");
      const [id, secret] = decoded.split(":");
      clientId = clientId ?? id;
      clientSecret = clientSecret ?? secret;
    } catch {
      // ignore
    }
  }
  if (!clientId) return { clientId: "", ok: false };
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("mcp_clients")
    .select("client_id, client_secret_hash, revoked_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data || data.revoked_at) return { clientId, ok: false };
  // Public client: no secret stored is rejected here, but our register flow
  // always issues a secret. PKCE is what protects the auth-code grant for
  // public clients; we still validate secret if one was provided.
  if (clientSecret) {
    const h = createHash("sha256").update(clientSecret).digest("hex");
    if (h !== data.client_secret_hash) return { clientId, ok: false };
  }
  return { clientId, ok: true };
}

export async function POST(req: NextRequest) {
  const body = await parseForm(req);
  if (!body) return err("invalid_request", "Body must be form-encoded or JSON");
  const { ok, clientId } = await authenticateClient(
    body,
    req.headers.get("authorization"),
  );
  if (!ok) return err("invalid_client", undefined, 401);

  const supabase = createSupabaseServiceClient();

  if (body.grant_type === "authorization_code") {
    if (!body.code || !body.code_verifier || !body.redirect_uri) {
      return err("invalid_request", "code, code_verifier, redirect_uri required");
    }
    const { data: row } = await supabase
      .from("mcp_auth_codes")
      .select("*")
      .eq("code", body.code)
      .maybeSingle();
    if (!row) return err("invalid_grant");
    if (row.used_at) return err("invalid_grant", "code already used");
    if (Date.parse(row.expires_at) < Date.now()) return err("invalid_grant", "code expired");
    if (row.client_id !== clientId) return err("invalid_grant", "client mismatch");
    if (row.redirect_uri !== body.redirect_uri) return err("invalid_grant", "redirect_uri mismatch");

    // PKCE S256: BASE64URL-NOPAD(SHA256(verifier)) must equal challenge.
    const expectedChallenge = createHash("sha256")
      .update(body.code_verifier)
      .digest("base64url");
    if (expectedChallenge !== row.pkce_challenge) {
      return err("invalid_grant", "PKCE verification failed");
    }

    // Burn the code.
    await supabase
      .from("mcp_auth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code", body.code);

    return await issueTokens(supabase, {
      clientId,
      userId: row.clerk_user_id,
      scopes: row.scopes as Scope[],
    });
  }

  if (body.grant_type === "refresh_token") {
    if (!body.refresh_token) return err("invalid_request", "refresh_token required");
    const { data: rt } = await supabase
      .from("mcp_tokens")
      .select("client_id, clerk_user_id, scopes, kind, revoked_at, expires_at")
      .eq("token_hash", hashToken(body.refresh_token))
      .maybeSingle();
    if (!rt || rt.kind !== "refresh" || rt.revoked_at) return err("invalid_grant");
    if (rt.expires_at && Date.parse(rt.expires_at) < Date.now()) return err("invalid_grant", "refresh expired");
    if (rt.client_id !== clientId) return err("invalid_grant", "client mismatch");
    const requested = parseScopes(body.scope);
    const granted = requested.length > 0
      ? requested.filter((s) => (rt.scopes as string[]).includes(s))
      : (rt.scopes as Scope[]);
    return await issueTokens(supabase, {
      clientId,
      userId: rt.clerk_user_id,
      scopes: granted,
      rotateRefresh: true,
      oldRefreshHash: hashToken(body.refresh_token),
    });
  }

  return err("unsupported_grant_type");
}

async function issueTokens(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  args: {
    clientId: string;
    userId: string;
    scopes: Scope[];
    rotateRefresh?: boolean;
    oldRefreshHash?: string;
  },
) {
  const at = mintTokenString("at");
  const rt = mintTokenString("rt");
  const now = Date.now();
  const accessExpiry = new Date(now + ACCESS_TTL_MS).toISOString();
  const refreshExpiry = new Date(now + REFRESH_TTL_MS).toISOString();

  const insertRows = [
    {
      client_id: args.clientId,
      clerk_user_id: args.userId,
      token_hash: at.hash,
      kind: "access" as const,
      scopes: args.scopes,
      expires_at: accessExpiry,
    },
    {
      client_id: args.clientId,
      clerk_user_id: args.userId,
      token_hash: rt.hash,
      kind: "refresh" as const,
      scopes: args.scopes,
      expires_at: refreshExpiry,
      refresh_token_encrypted: encryptToken(rt.raw),
    },
  ];
  const { error } = await supabase.from("mcp_tokens").insert(insertRows);
  if (error) {
    console.error("token insert failed", { code: error.code });
    return err("server_error", undefined, 500);
  }

  if (args.rotateRefresh && args.oldRefreshHash) {
    await supabase
      .from("mcp_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", args.oldRefreshHash);
  }

  return NextResponse.json(
    {
      access_token: at.raw,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TTL_MS / 1000),
      refresh_token: rt.raw,
      scope: args.scopes.join(" "),
    },
    { headers: { "cache-control": "no-store", pragma: "no-cache" } },
  );
}
