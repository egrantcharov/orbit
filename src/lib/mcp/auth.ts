/**
 * Bearer-token resolver for the Orbit MCP server.
 *
 * Tokens land in `mcp_tokens` with kind=access|refresh|pat. Only access + pat
 * are valid as request bearers — refresh tokens are exchanged via /oauth/token.
 *
 * The wire format is `Bearer orbit_at_<32 b64url bytes>` for access tokens,
 * `Bearer orbit_pat_<32 b64url bytes>` for personal access tokens. We store
 * sha256(token), so a database read can't leak a usable bearer.
 *
 * On the happy path we also bump `mcp_clients.last_used_at` for the UI's
 * "last used 14 minutes ago" column. That update is fire-and-forget — a stale
 * last-used value is way better than blocking every MCP call on a write.
 */

import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Scope } from "@/lib/mcp/scopes";

const BEARER_RE = /^Bearer\s+(orbit_(?:at|pat)_[A-Za-z0-9_-]{16,})$/;

export type McpAuthContext = {
  userId: string;
  clientId: string | null;
  scopes: Scope[];
  tokenKind: "access" | "pat";
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintTokenString(prefix: "at" | "rt" | "pat"): {
  raw: string;
  hash: string;
} {
  const raw = `orbit_${prefix}_${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashToken(raw) };
}

export function parseBearer(authzHeader: string | null): string | null {
  if (!authzHeader) return null;
  const m = authzHeader.match(BEARER_RE);
  return m ? m[1] : null;
}

export async function validateBearer(
  authzHeader: string | null,
): Promise<McpAuthContext | null> {
  const token = parseBearer(authzHeader);
  if (!token) return null;
  const isPat = token.startsWith("orbit_pat_");
  const expectedKind: "access" | "pat" = isPat ? "pat" : "access";
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("mcp_tokens")
    .select(
      "client_id, clerk_user_id, scopes, kind, expires_at, revoked_at",
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return null;
  if (data.kind !== expectedKind) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && Date.parse(data.expires_at) < Date.now()) return null;

  // Bump last_used_at for the client (not for PATs, which carry the sentinel id).
  const clientId = data.client_id;
  if (clientId && clientId !== "__pat__") {
    after(async () => {
      await supabase
        .from("mcp_clients")
        .update({ last_used_at: new Date().toISOString() })
        .eq("client_id", clientId);
    });
  }

  return {
    userId: data.clerk_user_id,
    clientId: clientId === "__pat__" ? null : clientId,
    scopes: (data.scopes ?? []) as Scope[],
    tokenKind: expectedKind,
  };
}
