/**
 * One audit row per MCP tool/prompt/resource call. Fire-and-forget — we
 * never block the response on the insert.
 */
import { after } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type AuditEntry = {
  userId: string;
  clientId: string | null;
  method: "tools/call" | "prompts/get" | "resources/read";
  name: string;
  ok: boolean;
  statusCode?: number | null;
  durationMs?: number;
};

export function audit(entry: AuditEntry): void {
  after(async () => {
    const supabase = createSupabaseServiceClient();
    await supabase.from("mcp_audit_log").insert({
      clerk_user_id: entry.userId,
      client_id: entry.clientId,
      method: entry.method,
      name: entry.name,
      ok: entry.ok,
      status_code: entry.statusCode ?? null,
      duration_ms: entry.durationMs ?? null,
    });
  });
}
