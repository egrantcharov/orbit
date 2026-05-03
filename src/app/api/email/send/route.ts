import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/google/gmailSend";

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

  let to: string | null = null;
  if (typeof body.to === "string" && body.to.includes("@")) {
    to = body.to.trim();
  } else if (typeof body.contactId === "string" && body.contactId) {
    const supabase = createSupabaseServiceClient();
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

  try {
    const result = await sendEmail({
      clerkUserId: userId,
      to,
      subject: body.subject,
      body: body.body,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    console.error("email send failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
