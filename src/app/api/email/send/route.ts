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
    to?: unknown;
    subject?: unknown;
    body?: unknown;
  };
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.subject !== "string" || !body.subject.trim()) {
    return NextResponse.json({ error: "missing_subject" }, { status: 400 });
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }
  if (body.subject.length > 500 || body.body.length > 20_000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  let to: string | null = null;
  if (typeof body.to === "string" && body.to.includes("@")) {
    to = body.to.trim();
  } else if (typeof body.contactId === "string" && body.contactId) {
    const { data } = await supabase
      .from("contacts")
      .select("email")
      .eq("clerk_user_id", userId)
      .eq("id", body.contactId)
      .maybeSingle();
    if (data?.email) to = data.email;
  }
  if (!to) {
    return NextResponse.json({ error: "missing_to" }, { status: 400 });
  }

  // v3: pick the user's single mailbox. Multi-mailbox arrives in v3.5; we'll
  // surface a picker in the modal then.
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
  const result = await adapter.sendEmail({
    clerkUserId: userId,
    mailboxId: mailbox.id,
    to,
    subject: body.subject,
    body: body.body,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, messageId: result.messageId });
}
