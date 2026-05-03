import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/google/auth";
import { hasAllScopes } from "@/lib/google/scopes";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

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
  if (typeof body.startISO !== "string" || Number.isNaN(Date.parse(body.startISO))) {
    return NextResponse.json({ error: "missing_start" }, { status: 400 });
  }
  const durationMin =
    typeof body.durationMin === "number" && body.durationMin > 0
      ? Math.min(480, Math.round(body.durationMin))
      : 30;

  const supabase = createSupabaseServiceClient();
  const [{ data: contact }, clerkUser] = await Promise.all([
    supabase
      .from("contacts")
      .select("email, display_name")
      .eq("clerk_user_id", userId)
      .eq("id", body.contactId)
      .maybeSingle(),
    currentUser(),
  ]);

  if (!contact || !contact.email) {
    return NextResponse.json({ error: "no_contact_email" }, { status: 400 });
  }

  try {
    const { oauth2, scopes } = await getAuthClient(userId);
    if (!hasAllScopes(scopes)) {
      return NextResponse.json({ error: "reconnect_required" }, { status: 400 });
    }
    const cal = google.calendar({ version: "v3", auth: oauth2 });

    const startDate = new Date(body.startISO);
    const endDate = new Date(startDate.getTime() + durationMin * 60_000);

    const res = await cal.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      requestBody: {
        summary: body.summary.slice(0, 300),
        description:
          typeof body.description === "string"
            ? body.description.slice(0, 4000)
            : undefined,
        start: { dateTime: startDate.toISOString() },
        end: { dateTime: endDate.toISOString() },
        attendees: [
          { email: contact.email, displayName: contact.display_name ?? undefined },
        ],
        organizer: clerkUser?.primaryEmailAddress?.emailAddress
          ? { email: clerkUser.primaryEmailAddress.emailAddress, self: true }
          : undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      htmlLink: res.data.htmlLink ?? null,
      eventId: res.data.id ?? null,
    });
  } catch (err) {
    console.error("calendar event failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}
