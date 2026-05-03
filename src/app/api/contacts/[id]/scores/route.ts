import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { scoreRelationship } from "@/lib/anthropic/scores";
import type { SelfProfile } from "@/lib/types/database";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = createSupabaseServiceClient();

  const [{ data: contact }, { data: self }] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, email, display_name, company, job_title, industry, location, message_count, user_sent_count, user_replied_count, last_interaction_at, ai_summary, tags",
      )
      .eq("clerk_user_id", userId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("app_users")
      .select("self_profile")
      .eq("clerk_user_id", userId)
      .maybeSingle(),
  ]);

  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Pull last 5 threads with body excerpts (or snippet fallback).
  const { data: links } = await supabase
    .from("thread_participants")
    .select("thread_id")
    .eq("contact_id", contact.id);
  const threadIds = (links ?? []).map((l) => l.thread_id);

  const { data: threads } = threadIds.length
    ? await supabase
        .from("threads")
        .select("id, subject, body_excerpt, snippet, last_message_at")
        .eq("clerk_user_id", userId)
        .in("id", threadIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(5)
    : { data: [] };

  try {
    const result = await scoreRelationship({
      contact: {
        displayName: contact.display_name,
        email: contact.email,
        company: contact.company,
        jobTitle: contact.job_title,
        industry: contact.industry,
        location: contact.location,
        messageCount: contact.message_count,
        userSentCount: contact.user_sent_count,
        userRepliedCount: contact.user_replied_count,
        lastInteractionAt: contact.last_interaction_at,
        aiSummary: contact.ai_summary,
        tags: contact.tags ?? [],
      },
      threads: (threads ?? []).map((t) => ({
        subject: t.subject,
        bodyExcerpt: t.body_excerpt ?? t.snippet,
        lastMessageAt: t.last_message_at,
      })),
      self: (self?.self_profile ?? {}) as SelfProfile,
    });

    const { error } = await supabase
      .from("contacts")
      .update({
        score_closeness: result.closeness,
        score_keep_in_touch: result.keep_in_touch,
        score_industry_overlap: result.industry_overlap,
        score_age_proximity: result.age_proximity,
        score_career_relevance: result.career_relevance,
        scores_rationale: result.rationale,
        scores_at: new Date().toISOString(),
      })
      .eq("clerk_user_id", userId)
      .eq("id", contact.id);
    if (error) {
      console.error("scores save failed", { userId, code: error.code });
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, scores: result });
  } catch (err) {
    console.error("scores failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "scoring_failed" }, { status: 500 });
  }
}
