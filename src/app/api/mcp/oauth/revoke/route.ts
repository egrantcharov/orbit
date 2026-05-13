/**
 * POST /api/mcp/oauth/revoke — RFC 7009 token revocation.
 *
 * Per spec, always returns 200 (even when the token isn't found) to avoid
 * giving callers a way to probe whether a token exists.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { hashToken } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let token: string | null = null;
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    token = params.get("token");
  } else if (ctype.includes("application/json")) {
    try {
      const body = (await req.json()) as { token?: string };
      token = body.token ?? null;
    } catch {
      // ignore
    }
  }
  if (!token) {
    return new NextResponse(null, { status: 200 });
  }
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token));
  return new NextResponse(null, { status: 200 });
}
