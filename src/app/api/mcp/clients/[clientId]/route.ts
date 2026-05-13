/**
 * DELETE /api/mcp/clients/[clientId] — revoke a client and all its tokens.
 *
 * Authenticated via Clerk session (this is the UI-driven path). The MCP
 * route is bearer-auth; this endpoint is for the dashboard.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { clientId } = await ctx.params;
  if (!clientId) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  // Ownership check + reuse the same query for the update.
  const { data: client } = await supabase
    .from("mcp_clients")
    .select("client_id")
    .eq("clerk_user_id", userId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  // Mark the client revoked.
  await supabase
    .from("mcp_clients")
    .update({ revoked_at: now })
    .eq("clerk_user_id", userId)
    .eq("client_id", clientId);
  // And every token under it.
  await supabase
    .from("mcp_tokens")
    .update({ revoked_at: now })
    .eq("clerk_user_id", userId)
    .eq("client_id", clientId)
    .is("revoked_at", null);

  return NextResponse.json({ ok: true });
}
