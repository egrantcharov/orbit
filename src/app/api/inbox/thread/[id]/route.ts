import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/google/auth";
import {
  hasAllScopes,
  REQUIRED_GMAIL_READ_SCOPES,
} from "@/lib/google/scopes";
import { extractBodyText, headerValue } from "@/lib/mailbox/parse";

export const maxDuration = 30;

const BODY_MAX_PER_MSG = 6000;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let oauth2;
  let scopes: string[];
  try {
    const a = await getAuthClient(userId);
    oauth2 = a.oauth2;
    scopes = a.scopes;
  } catch {
    return NextResponse.json({ error: "no_mailbox" }, { status: 400 });
  }
  if (!hasAllScopes(scopes, REQUIRED_GMAIL_READ_SCOPES)) {
    return NextResponse.json({ error: "reconnect_required" }, { status: 400 });
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const t = await gmail.users.threads
    .get({ userId: "me", id, format: "full" })
    .then((r) => r.data);

  const messages = (t.messages ?? []).map((m) => {
    const body = extractBodyText(m.payload ?? undefined);
    return {
      id: m.id,
      from: headerValue(m, "From") ?? null,
      to: headerValue(m, "To") ?? null,
      cc: headerValue(m, "Cc") ?? null,
      subject: headerValue(m, "Subject") ?? null,
      date: headerValue(m, "Date") ?? null,
      snippet: m.snippet ?? null,
      body: body ? body.slice(0, BODY_MAX_PER_MSG) : null,
    };
  });

  return NextResponse.json({ ok: true, threadId: id, messages });
}
