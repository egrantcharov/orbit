import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { draftEmail } from "@/lib/anthropic/draftEmail";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { contactId?: unknown; intent?: unknown };
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.contactId !== "string" || !body.contactId) {
    return NextResponse.json({ error: "missing_contact" }, { status: 400 });
  }
  const intent =
    typeof body.intent === "string" && body.intent.trim()
      ? body.intent.trim().slice(0, 500)
      : null;

  const supabase = createSupabaseServiceClient();
  const [{ data: contact }, { data: connection }, clerkUser] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, email, display_name, company, job_title, ai_summary",
      )
      .eq("clerk_user_id", userId)
      .eq("id", body.contactId)
      .maybeSingle(),
    supabase
      .from("google_connections")
      .select("google_email")
      .eq("clerk_user_id", userId)
      .maybeSingle(),
    currentUser(),
  ]);

  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: links } = await supabase
    .from("thread_participants")
    .select("thread_id")
    .eq("contact_id", contact.id);
  const threadIds = (links ?? []).map((l) => l.thread_id);
  const { data: threads } = threadIds.length
    ? await supabase
        .from("threads")
        .select("subject, body_excerpt, snippet, last_message_at")
        .eq("clerk_user_id", userId)
        .in("id", threadIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(3)
    : { data: [] };

  try {
    const draft = await draftEmail({
      fromName: clerkUser?.fullName ?? clerkUser?.firstName ?? null,
      fromEmail: connection?.google_email ?? null,
      contactName: contact.display_name,
      contactEmail: contact.email,
      contactCompany: contact.company,
      contactTitle: contact.job_title,
      contactSummary: contact.ai_summary,
      recentThreads: (threads ?? []).map((t) => ({
        subject: t.subject,
        excerpt: t.body_excerpt ?? t.snippet,
        last_message_at: t.last_message_at,
      })),
      intent,
    });
    return NextResponse.json({ ok: true, ...draft });
  } catch (err) {
    console.error("email draft failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "draft_failed" }, { status: 500 });
  }
}
