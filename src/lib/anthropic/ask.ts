import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, SONNET } from "@/lib/anthropic/client";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ContactKind } from "@/lib/types/database";

const SYSTEM = `You are Orbit's analyst. The user asks natural-language questions about their professional network. You have tools to query the database — call them as needed, then answer directly in plain prose (≤ 6 sentences, no headers, no bullets unless the answer is genuinely a list).

Style:
- Specific. Cite real names and counts from the data, not vague claims.
- Actionable. If the answer implies a follow-up ("you should email X"), say so.
- Honest. If the data doesn't support an answer, say what's missing.

Schema you can filter on:
- kind: person | newsletter | automated | noreply | spam | bulk_marketing | transactional | unknown
- company, job_title, industry, location, tags (array of lowercase labels)
- LinkedIn URL (has_linkedin), birthday (birthday_within_days)
- relationship dimensions 0..1: closeness, keep_in_touch, industry_overlap, age_proximity, career_relevance
- recency (drifting_min_days / active_max_days), message_count, is_pinned
- include_hidden=false by default (excludes archived noise)

Heuristics:
- "Headhunters / recruiters / VCs / founders / engineers / designers" → filter by job_title (substring) and possibly company / industry / tags. Combine with min_score_keep_in_touch ≥ 0.5 to surface "useful" ones.
- "Most useful / most relevant" → use min_score_career_relevance ≥ 0.6 and order by message_count or last_interaction_at.
- "Closest" → min_score_closeness ≥ 0.6.
- "Drifting" → drifting_min_days ≥ 30.
- "Birthday this week / next 14 days" → birthday_within_days.

Date math is in UTC. Today's date is in the user prompt.

Tool budget: at most 8 calls per question. Pick the smallest set you need.`;

const MAX_TOOL_ITERATIONS = 8;
const MAX_RESULTS = 50;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_contacts",
    description:
      "Search the user's contacts. All filters are optional and combined with AND. By default excludes hidden (archived) contacts. Returns up to 50 contacts.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "person",
            "newsletter",
            "automated",
            "noreply",
            "spam",
            "bulk_marketing",
            "transactional",
            "unknown",
          ],
        },
        drifting_min_days: { type: "number" },
        active_max_days: { type: "number" },
        min_message_count: { type: "number" },
        domain: {
          type: "string",
          description: "Email domain substring (case-insensitive).",
        },
        name_query: {
          type: "string",
          description: "Display-name or email substring.",
        },
        company: { type: "string", description: "Company substring." },
        job_title: { type: "string", description: "Job title substring." },
        industry: { type: "string", description: "Industry substring." },
        tags_any: {
          type: "array",
          items: { type: "string" },
          description: "Match any of these tag labels (lowercase).",
        },
        has_linkedin: {
          type: "boolean",
          description: "Only return contacts that have a LinkedIn URL.",
        },
        birthday_within_days: {
          type: "number",
          description: "Birthday (month/day) falls within the next N days (1..60).",
        },
        min_score_closeness: { type: "number" },
        min_score_keep_in_touch: { type: "number" },
        min_score_career_relevance: { type: "number" },
        min_score_industry_overlap: { type: "number" },
        is_pinned: { type: "boolean" },
        include_hidden: {
          type: "boolean",
          description:
            "Default false. Set true to include archived/hidden contacts.",
        },
        order_by: {
          type: "string",
          enum: ["recent", "message_count", "name", "keep_in_touch", "career_relevance"],
        },
      },
    },
  },
  {
    name: "get_contact_details",
    description:
      "Fetch a contact by id, with full profile (company/title/industry/location/birthday/tags/notes), 5 most recent thread subjects + body excerpts, and any AI summary.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "stats",
    description:
      "Return high-level totals about the user's data — counts of contacts by kind, hidden, pinned, scored, and threads.",
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
  company?: string;
  job_title?: string;
  industry?: string;
  tags_any?: string[];
  has_linkedin?: boolean;
  birthday_within_days?: number;
  min_score_closeness?: number;
  min_score_keep_in_touch?: number;
  min_score_career_relevance?: number;
  min_score_industry_overlap?: number;
  is_pinned?: boolean;
  include_hidden?: boolean;
  order_by?: "recent" | "message_count" | "name" | "keep_in_touch" | "career_relevance";
};

function birthdayWindowMatches(birthday: string | null, days: number): boolean {
  if (!birthday) return false;
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (Number.isNaN(month) || Number.isNaN(day)) return false;
  const today = new Date();
  const cur = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (let i = 0; i <= days; i += 1) {
    const candidate = new Date(cur.getTime() + i * 86_400_000);
    if (candidate.getUTCMonth() + 1 === month && candidate.getUTCDate() === day) {
      return true;
    }
  }
  return false;
}

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
        "id, email, display_name, last_interaction_at, message_count, kind, is_pinned, is_hidden, company, job_title, industry, tags, birthday, linkedin_url, score_closeness, score_keep_in_touch, score_career_relevance, score_industry_overlap, score_age_proximity",
      )
      .eq("clerk_user_id", userId)
      .limit(MAX_RESULTS);

    if (!args.include_hidden) q = q.eq("is_hidden", false);
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
    if (args.company) q = q.ilike("company", `%${args.company}%`);
    if (args.job_title) q = q.ilike("job_title", `%${args.job_title}%`);
    if (args.industry) q = q.ilike("industry", `%${args.industry}%`);
    if (Array.isArray(args.tags_any) && args.tags_any.length > 0) {
      q = q.overlaps("tags", args.tags_any);
    }
    if (args.has_linkedin === true) q = q.not("linkedin_url", "is", null);
    if (args.has_linkedin === false) q = q.is("linkedin_url", null);
    if (typeof args.min_score_closeness === "number") q = q.gte("score_closeness", args.min_score_closeness);
    if (typeof args.min_score_keep_in_touch === "number") q = q.gte("score_keep_in_touch", args.min_score_keep_in_touch);
    if (typeof args.min_score_career_relevance === "number") q = q.gte("score_career_relevance", args.min_score_career_relevance);
    if (typeof args.min_score_industry_overlap === "number") q = q.gte("score_industry_overlap", args.min_score_industry_overlap);

    switch (args.order_by) {
      case "message_count":
        q = q.order("message_count", { ascending: false });
        break;
      case "name":
        q = q.order("display_name", { ascending: true, nullsFirst: false });
        break;
      case "keep_in_touch":
        q = q.order("score_keep_in_touch", { ascending: false, nullsFirst: false });
        break;
      case "career_relevance":
        q = q.order("score_career_relevance", { ascending: false, nullsFirst: false });
        break;
      default:
        q = q.order("last_interaction_at", {
          ascending: false,
          nullsFirst: false,
        });
    }

    const { data, error } = await q;
    if (error) return JSON.stringify({ error: "db_error", message: error.message });
    let rows = data ?? [];
    if (typeof args.birthday_within_days === "number" && args.birthday_within_days > 0) {
      const days = Math.min(60, Math.max(1, Math.round(args.birthday_within_days)));
      rows = rows.filter((r) => birthdayWindowMatches(r.birthday, days));
    }
    return JSON.stringify({ count: rows.length, contacts: rows });
  }

  if (name === "get_contact_details") {
    const id = String(input.id ?? "");
    if (!id) return JSON.stringify({ error: "missing_id" });
    const { data: contact } = await supabase
      .from("contacts")
      .select(
        "id, email, display_name, last_interaction_at, message_count, kind, is_pinned, is_hidden, ai_summary, company, job_title, industry, location, linkedin_url, birthday, tags, notes, score_closeness, score_keep_in_touch, score_industry_overlap, score_age_proximity, score_career_relevance, scores_rationale",
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
            .select("subject, body_excerpt, snippet, last_message_at")
            .eq("clerk_user_id", userId)
            .in("id", threadIds)
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(5)
        : { data: [] };
    const trimmedThreads = (threads ?? []).map((t) => ({
      subject: t.subject,
      excerpt: (t.body_excerpt ?? t.snippet ?? "").slice(0, 600),
      last_message_at: t.last_message_at,
    }));
    return JSON.stringify({ contact, recent_threads: trimmedThreads });
  }

  if (name === "stats") {
    const queries = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("clerk_user_id", userId),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("clerk_user_id", userId).eq("kind", "person").eq("is_hidden", false),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("clerk_user_id", userId).eq("kind", "newsletter").eq("is_hidden", false),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("clerk_user_id", userId).eq("is_pinned", true),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("clerk_user_id", userId).eq("is_hidden", true),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("clerk_user_id", userId).not("score_closeness", "is", null),
      supabase.from("threads").select("*", { count: "exact", head: true }).eq("clerk_user_id", userId),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("clerk_user_id", userId).not("linkedin_url", "is", null),
    ]);
    return JSON.stringify({
      total_contacts: queries[0].count ?? 0,
      people_visible: queries[1].count ?? 0,
      newsletters_visible: queries[2].count ?? 0,
      pinned: queries[3].count ?? 0,
      hidden: queries[4].count ?? 0,
      scored: queries[5].count ?? 0,
      threads: queries[6].count ?? 0,
      with_linkedin: queries[7].count ?? 0,
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
