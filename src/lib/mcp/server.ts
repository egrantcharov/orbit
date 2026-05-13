/**
 * Per-request MCP server factory. mcp-handler calls `createMcpHandler` with
 * an `initializeServer(server)` callback; that callback runs on every request,
 * so we can wire scope-aware tools using the bearer-resolved context.
 *
 * The factory registers every tool/prompt/resource. Each tool re-checks its
 * required scope against `ctx.scopes` and returns an MCP error if missing —
 * we never trust the scope list alone to gate access.
 */
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runTool as runAskOrbitTool } from "@/lib/anthropic/ask";
import { buildTodayCards } from "@/lib/today/build";
import { requireScope } from "@/lib/mcp/scopes";
import { audit } from "@/lib/mcp/audit";
import type { McpAuthContext } from "@/lib/mcp/auth";
import type { InteractionKind } from "@/lib/types/database";

/**
 * Wrap a tool handler with: scope check + audit log + timing.
 * The wrapper returns the MCP content envelope; handlers just return data.
 */
function wrapTool<Args, T>(
  ctx: McpAuthContext,
  toolName: string,
  scope: Parameters<typeof requireScope>[1],
  fn: (args: Args) => Promise<T>,
) {
  return async (args: Args) => {
    const t0 = Date.now();
    try {
      requireScope(ctx.scopes, scope);
      const result = await fn(args);
      audit({
        userId: ctx.userId,
        clientId: ctx.clientId,
        method: "tools/call",
        name: toolName,
        ok: true,
        durationMs: Date.now() - t0,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: typeof result === "string" ? result : JSON.stringify(result),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      audit({
        userId: ctx.userId,
        clientId: ctx.clientId,
        method: "tools/call",
        name: toolName,
        ok: false,
        durationMs: Date.now() - t0,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: msg }) },
        ],
        isError: true,
      };
    }
  };
}

export function registerOrbitTools(server: McpServer, ctx: McpAuthContext) {
  // ---- search_contacts ---------------------------------------------------
  server.tool(
    "search_contacts",
    "Search the user's contacts. All filters are optional and combine with AND. Defaults exclude archived contacts.",
    {
      drifting_min_days: z.number().optional(),
      active_max_days: z.number().optional(),
      min_message_count: z.number().optional(),
      domain: z.string().optional(),
      name_query: z.string().optional(),
      company: z.string().optional(),
      job_title: z.string().optional(),
      industry: z.string().optional(),
      tags_any: z.array(z.string()).optional(),
      has_linkedin: z.boolean().optional(),
      has_email: z.boolean().optional(),
      is_pinned: z.boolean().optional(),
      include_archived: z.boolean().optional(),
      min_score_closeness: z.number().optional(),
      min_score_keep_in_touch: z.number().optional(),
      min_score_career_relevance: z.number().optional(),
      min_score_industry_overlap: z.number().optional(),
      birthday_within_days: z.number().optional(),
      order_by: z
        .enum([
          "last_interaction_at",
          "message_count",
          "name",
          "keep_in_touch",
          "career_relevance",
        ])
        .optional(),
    },
    wrapTool(ctx, "search_contacts", "contacts:read", async (args: unknown) => {
      const raw = await runAskOrbitTool(
        "search_contacts",
        (args ?? {}) as Record<string, unknown>,
        ctx.userId,
      );
      return JSON.parse(raw);
    }),
  );

  // ---- get_contact_details ----------------------------------------------
  server.tool(
    "get_contact_details",
    "Full contact record + 5 most recent threads + AI relationship summary.",
    { id: z.string() },
    wrapTool(
      ctx,
      "get_contact_details",
      "contacts:read",
      async (args: { id: string }) => {
        const raw = await runAskOrbitTool("get_contact_details", args, ctx.userId);
        return JSON.parse(raw);
      },
    ),
  );

  // ---- get_contact_stats -------------------------------------------------
  server.tool(
    "get_contact_stats",
    "Global counts: total contacts, archived, pinned, scored, with_linkedin, threads.",
    {},
    wrapTool(ctx, "get_contact_stats", "contacts:read", async () => {
      const raw = await runAskOrbitTool("stats", {}, ctx.userId);
      return JSON.parse(raw);
    }),
  );

  // ---- get_today_cards --------------------------------------------------
  server.tool(
    "get_today_cards",
    "Today's daily briefing: drifting contacts, birthdays, unanswered emails, upcoming meetings, voice-memo follow-ups.",
    {},
    wrapTool(ctx, "get_today_cards", "briefings:read", async () => {
      const cards = await buildTodayCards(ctx.userId);
      return { generatedAt: new Date().toISOString(), cards };
    }),
  );

  // ---- list_interactions -------------------------------------------------
  server.tool(
    "list_interactions",
    "Last 50 interactions (notes, calls, voice memos, meeting attendance, emails) for a contact.",
    { contact_id: z.string() },
    wrapTool(
      ctx,
      "list_interactions",
      "interactions:read",
      async (args: { contact_id: string }) => {
        const supabase = createSupabaseServiceClient();
        const { data } = await supabase
          .from("interactions")
          .select(
            "id, kind, occurred_at, title, body, ai_title, ai_summary, ai_action_items, audio_duration_ms",
          )
          .eq("clerk_user_id", ctx.userId)
          .eq("contact_id", args.contact_id)
          .order("occurred_at", { ascending: false })
          .limit(50);
        return { count: data?.length ?? 0, interactions: data ?? [] };
      },
    ),
  );

  // ---- get_action_items --------------------------------------------------
  server.tool(
    "get_action_items",
    "Outstanding follow-ups extracted from voice memos in the last 14 days. Groups by contact.",
    { since_days: z.number().int().min(1).max(60).optional() },
    wrapTool(
      ctx,
      "get_action_items",
      "interactions:read",
      async (args: { since_days?: number }) => {
        const sinceDays = args.since_days ?? 14;
        const supabase = createSupabaseServiceClient();
        const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
        const { data: rows } = await supabase
          .from("interactions")
          .select("id, contact_id, occurred_at, ai_title, ai_action_items")
          .eq("clerk_user_id", ctx.userId)
          .gte("occurred_at", since)
          .not("ai_action_items", "is", null)
          .order("occurred_at", { ascending: false })
          .limit(200);
        const memos = (rows ?? []).filter(
          (r) =>
            Array.isArray(r.ai_action_items) &&
            (r.ai_action_items as unknown[]).some(
              (v) => typeof v === "string" && v.trim().length > 0,
            ),
        );
        if (memos.length === 0)
          return { count: 0, total_items: 0, groups: [] };
        const contactIds = Array.from(new Set(memos.map((m) => m.contact_id)));
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, display_name, email, company")
          .eq("clerk_user_id", ctx.userId)
          .in("id", contactIds);
        const byContact = new Map((contacts ?? []).map((c) => [c.id, c]));
        type Group = {
          contact: unknown;
          items: Array<{
            memo_id: string;
            occurred_at: string;
            ai_title: string | null;
            action_items: string[];
          }>;
        };
        const groups: Record<string, Group> = {};
        let total = 0;
        for (const m of memos) {
          const c = byContact.get(m.contact_id);
          const items = (m.ai_action_items as unknown[]).filter(
            (v): v is string => typeof v === "string" && v.trim().length > 0,
          );
          total += items.length;
          if (!groups[m.contact_id]) groups[m.contact_id] = { contact: c, items: [] };
          groups[m.contact_id].items.push({
            memo_id: m.id,
            occurred_at: m.occurred_at,
            ai_title: m.ai_title,
            action_items: items,
          });
        }
        return {
          count: Object.keys(groups).length,
          total_items: total,
          groups: Object.values(groups),
        };
      },
    ),
  );

  // ---- log_interaction ---------------------------------------------------
  const KIND_VALUES = [
    "note",
    "phone",
    "imessage",
    "voice_memo",
    "calendar_event",
    "email_thread",
  ] as const;
  server.tool(
    "log_interaction",
    "Append an interaction row (note, phone call, iMessage, etc.) to a contact. Bumps last_interaction_at.",
    {
      contact_id: z.string(),
      kind: z.enum(KIND_VALUES).optional(),
      title: z.string().max(200).optional(),
      body: z.string().max(10_000).optional(),
      occurred_at: z.string().optional(),
    },
    wrapTool(
      ctx,
      "log_interaction",
      "interactions:write",
      async (args: {
        contact_id: string;
        kind?: (typeof KIND_VALUES)[number];
        title?: string;
        body?: string;
        occurred_at?: string;
      }) => {
        if (!args.title && !args.body) {
          throw new Error("title or body required");
        }
        const supabase = createSupabaseServiceClient();
        const { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("clerk_user_id", ctx.userId)
          .eq("id", args.contact_id)
          .maybeSingle();
        if (!contact) throw new Error("contact not found");
        const occurredAt =
          args.occurred_at && !Number.isNaN(Date.parse(args.occurred_at))
            ? args.occurred_at
            : new Date().toISOString();
        const { data: row, error } = await supabase
          .from("interactions")
          .insert({
            clerk_user_id: ctx.userId,
            contact_id: contact.id,
            kind: (args.kind ?? "note") as InteractionKind,
            occurred_at: occurredAt,
            title: args.title ?? null,
            body: args.body ?? null,
          })
          .select("id, kind, occurred_at, title, body")
          .maybeSingle();
        if (error || !row) throw new Error(error?.message ?? "db_error");
        await supabase
          .from("contacts")
          .update({ last_interaction_at: occurredAt })
          .eq("clerk_user_id", ctx.userId)
          .eq("id", contact.id)
          .lt("last_interaction_at", occurredAt);
        return { ok: true, interaction: row };
      },
    ),
  );
}
