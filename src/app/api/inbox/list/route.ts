import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/google/auth";
import {
  hasAllScopes,
  REQUIRED_GMAIL_READ_SCOPES,
} from "@/lib/google/scopes";

export const maxDuration = 30;

// Lists recent Gmail threads — header-only summary for the inbox view.
// Honors `q` for search, `pageToken` for paging.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const pageToken = url.searchParams.get("pageToken") ?? undefined;

  let oauth2;
  let scopes: string[];
  try {
    const auth = await getAuthClient(userId);
    oauth2 = auth.oauth2;
    scopes = auth.scopes;
  } catch {
    return NextResponse.json({ error: "no_mailbox" }, { status: 400 });
  }
  if (!hasAllScopes(scopes, REQUIRED_GMAIL_READ_SCOPES)) {
    return NextResponse.json({ error: "reconnect_required" }, { status: 400 });
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const list = await gmail.users.threads.list({
    userId: "me",
    maxResults: 25,
    q: q || undefined,
    pageToken,
  });

  const threadIds = (list.data.threads ?? []).map((t) => t.id!).filter(Boolean);

  // Fetch metadata-only summaries (subject + from + date + snippet) in
  // parallel batches of 8.
  type Summary = {
    id: string;
    subject: string | null;
    from: string | null;
    date: string | null;
    snippet: string | null;
    unread: boolean;
  };
  const summaries: Summary[] = [];
  for (let i = 0; i < threadIds.length; i += 8) {
    const slice = threadIds.slice(i, i + 8);
    const fetched = await Promise.all(
      slice.map((id) =>
        gmail.users.threads
          .get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
          })
          .then((r) => r.data)
          .catch(() => null),
      ),
    );
    for (const t of fetched) {
      if (!t || !t.id) continue;
      const msgs = t.messages ?? [];
      const last = msgs[msgs.length - 1] ?? msgs[0];
      const headers = last?.payload?.headers ?? [];
      const findHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
        null;
      const labelIds = last?.labelIds ?? [];
      summaries.push({
        id: t.id,
        subject: findHeader("Subject"),
        from: findHeader("From"),
        date: findHeader("Date"),
        snippet: last?.snippet ?? t.snippet ?? null,
        unread: labelIds.includes("UNREAD"),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    threads: summaries,
    nextPageToken: list.data.nextPageToken ?? null,
  });
}
