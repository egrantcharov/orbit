import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { ClientList } from "@/components/app/mcp/ClientList";
import { ConnectInstructions } from "@/components/app/mcp/ConnectInstructions";

export const dynamic = "force-dynamic";

export default async function McpSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createSupabaseServiceClient();
  const { data: clients } = await supabase
    .from("mcp_clients")
    .select("client_id, client_name, scopes_granted, redirect_uris, last_used_at, revoked_at, created_at")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false });

  const { data: recentAudit } = await supabase
    .from("mcp_audit_log")
    .select("id, client_id, method, name, ok, duration_ms, created_at")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-3xl w-full mx-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">MCP server</h1>
        <p className="text-sm text-muted-foreground">
          Connect any MCP-aware client (Claude Desktop, Cursor, the Anthropic
          API, your own scripts) to Orbit. Every client authenticates via OAuth
          2.1 and uses only the scopes you grant.
        </p>
      </header>

      <ConnectInstructions />

      <ClientList
        clients={clients ?? []}
        recentAudit={recentAudit ?? []}
      />
    </main>
  );
}
