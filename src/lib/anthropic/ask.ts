import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, SONNET } from "@/lib/anthropic/client";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ContactKind } from "@/lib/types/database";

const SYSTEM = `You are Orbit's analyst. The user asks natural-language questions about their professional network. You have tools to query the database — call them as needed, then answer directly in plain prose (≤ 6 sentences, no headers, no bullets unless the answer is genuinely a list).

Style:
- Specific. Cite real names and counts from the data, not vague claims.
- Actionable. If the answer implies a follow-up ("you should email X"), say so.
- Honest. If you don't have data for a question, say what's missing.

Date math is in UTC. The current date will be in the user prompt.

Tool budget: at most 5 calls per question. Pick the smallest set you need.`;

const MAX_TOOL_ITERATIONS = 5;
const MAX_RESULTS = 50;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_contacts",
    description:
      "Search the user's contacts. All filters are optional and combined with AND. Returns up to 50 contacts.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["person", "newsletter", "automated", "noreply", "spam", "unknown"],
          description: "Filter by classification.",
        },
        drifting_min_days: {
          type: "number",
          description:
            "Only return contacts whose last_interaction_at is at least N days ago.",
        },
        active_max_days: {
          type: "number",
          description:
            "Only return contacts whose last_interaction_at is within the last N days.",
        },
        min_message_count: {
          type: "number",
          description: "Only return contacts with ≥ N messages exchanged.",
        },
        domain: {
          type: "string",
          description:
            "Only return contacts whose email domain matches (substring, case-insensitive).",
        },
        name_query: {
          type: "string",
          description:
            "Only return contacts whose display name or email contains this string (case-insensitive).",
        },
        is_pinned: {
          type: "boolean",
          description: "Only return pinned contacts when true.",
        },
        order_by: {
          type: "string",
          enum: ["recent", "message_count", "name"],
          description: "Sort order. Default is recent.",
        },
      },
    },
  },
  {
    name: "get_contact_details",
    description:
      "Fetch a contact by id, including the most recent thread subjects and snippets.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Contact id from search_contacts." },
      },
      required: ["id"],
    },
  },
  {
    name: "stats",
    description:
      "Return high-level totals about the user's data — counts of contacts by kind, threads, pinned.",
    input_schema: { type: "object", properties: {} },
  },
];

type SearchArgs = {
  kind?: ContactKind;
  drifting_min_days?: number;
  active_max_days?: number;
  min_message_count?: number;
  domain?: string;
  name_query?: string;
  is_pinned?: boolean;
  order_by?: "recent" | "message_count" | "name";
};

async function runTool(
  name: string,
  rawInput: unknown,
  userId: string,
): Promise<string> {
  const supabase = createSupabaseServiceClient();
  const input = (rawInput ?? {}) as Record<string, unknown>;

  if (name === "search_contacts") {
    const args = input as SearchArgs;
    let q = supabase
      .from("contacts")
      .select(
        "id, email, display_name, last_interaction_at, message_count, kind, is_pinned",
      )
      .eq("clerk_user_id", userId)
      .limit(MAX_RESULTS);

    if (args.kind) q = q.eq("kind", args.kind);
    if (typeof args.is_pinned === "boolean") q = q.eq("is_pinned", args.is_pinned);
    if (typeof args.min_message_count === "number") {
      q = q.gte("message_count", args.min_message_count);
    }
    if (typeof args.drifting_min_days === "number") {
      q = q.lt(
        "last_interaction_at",
        new Date(Date.now() - args.drifting_min_days * 86_400_000).toISOString(),
      );
    }
    if (typeof args.active_max_days === "number") {
      q = q.gte(
        "last_interaction_at",
        new Date(Date.now() - args.active_max_days * 86_400_000).toISOString(),
      );
    }
    if (args.domain) q = q.ilike("email", `%@%${args.domain}%`);
    if (args.name_query) {
      q = q.or(
        `email.ilike.%${args.name_query}%,display_name.ilike.%${args.name_query}%`,
      );
    }
    switch (args.order_by) {
      case "message_count":
        q = q.order("message_count", { ascending: false });
        break;
      case "name":
        q = q.order("display_name", { ascending: true, nullsFirst: false });
        break;
      default:
        q = q.order("last_interaction_at", {
          ascending: false,
          nullsFirst: false,
        });
    }

    const { data, error } = await q;
    if (error) return JSON.stringify({ error: "db_error", message: error.message });
    return JSON.stringify({ count: data?.length ?? 0, contacts: data ?? [] });
  }

  if (name === "get_contact_details") {
    const id = String(input.id ?? "");
    if (!id) return JSON.stringify({ error: "missing_id" });
    const { data: contact } = await supabase
      .from("contacts")
      .select(
        "id, email, display_name, last_interaction_at, message_count, kind, is_pinned, ai_summary",
      )
      .eq("clerk_user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (!contact) return JSON.stringify({ error: "not_found" });
    const { data: links } = await supabase
      .from("thread_participants")
      .select("thread_id")
      .eq("contact_id", contact.id);
    const threadIds = (links ?? []).map((l) => l.thread_id);
    const { data: threads } =
      threadIds.length > 0
        ? await supabase
            .from("threads")
            .select("subject, snippet, last_message_at")
            .eq("clerk_user_id", userId)
            .in("id", threadIds)
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(8)
        : { data: [] };
    return JSON.stringify({ contact, recent_threads: threads ?? [] });
  }

  if (name === "stats") {
    const queries = await Promise.all([
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("clerk_user_id", userId),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("clerk_user_id", userId)
        .eq("kind", "person"),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("clerk_user_id", userId)
        .eq("kind", "newsletter"),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("clerk_user_id", userId)
        .eq("is_pinned", true),
      supabase
        .from("threads")
        .select("*", { count: "exact", head: true })
        .eq("clerk_user_id", userId),
    ]);
    return JSON.stringify({
      total_contacts: queries[0].count ?? 0,
      people: queries[1].count ?? 0,
      newsletters: queries[2].count ?? 0,
      pinned: queries[3].count ?? 0,
      threads: queries[4].count ?? 0,
    });
  }

  return JSON.stringify({ error: "unknown_tool", name });
}

export async function ask(question: string, userId: string): Promise<string> {
  const client = getAnthropic();
  const today = new Date().toISOString().slice(0, 10);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Today: ${today}\n\nQuestion: ${question}`,
    },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      for (const block of response.content) {
        if (block.type === "text") return block.text.trim();
      }
      return "";
    }

    if (response.stop_reason !== "tool_use") {
      return "I couldn't reach an answer this time — please try rephrasing.";
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = await runTool(block.name, block.input, userId);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "I hit my tool-call limit before I could answer. Try a more specific question.";
}
