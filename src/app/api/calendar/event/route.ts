import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getAdapter } from "@/lib/mailbox";
import type { MailboxProvider } from "@/lib/types/database";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    contactId?: unknown;
    summary?: unknown;
    description?: unknown;
    startISO?: unknown;
    durationMin?: unknown;
  };
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.contactId !== "string" || !body.contactId) {
    return NextResponse.json({ error: "missing_contact" }, { status: 400 });
  }
  if (typeof body.summary !== "string" || !body.summary.trim()) {
    return NextResponse.json({ error: "missing_summary" }, { status: 400 });
  }
  if (
    typeof body.startISO !== "string" ||
    Number.isNaN(Date.parse(body.startISO))
  ) {
    return NextResponse.json({ error: "missing_start" }, { status: 400 });
  }
  const durationMin =
    typeof body.durationMin === "number" && body.durationMin > 0
      ? Math.min(480, Math.round(body.durationMin))
      : 30;

  const supabase = createSupabaseServiceClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("email, display_name")
    .eq("clerk_user_id", userId)
    .eq("id", body.contactId)
    .maybeSingle();
  if (!contact || !contact.email) {
    return NextResponse.json({ error: "no_contact_email" }, { status: 400 });
  }

  const { data: mailbox } = await supabase
    .from("mailbox_connections")
    .select("id, provider")
    .eq("clerk_user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();
  if (!mailbox) {
    return NextResponse.json({ error: "no_mailbox" }, { status: 400 });
  }

  const adapter = getAdapter(mailbox.provider as MailboxProvider);
  const result = await adapter.createCalendarEvent({
    clerkUserId: userId,
    mailboxId: mailbox.id,
    summary: body.summary,
    description: typeof body.description === "string" ? body.description : undefined,
    startISO: body.startISO,
    durationMin,
    attendees: [
      { email: contact.email, displayName: contact.display_name ?? undefined },
    ],
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    htmlLink: result.htmlLink,
    eventId: result.eventId,
  });
}
