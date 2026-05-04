import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Mail, Inbox } from "lucide-react";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { hasAllScopes, REQUIRED_GMAIL_READ_SCOPES } from "@/lib/google/scopes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MailboxesSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createSupabaseServiceClient();
  const { data: mailboxes } = await supabase
    .from("mailbox_connections")
    .select(
      "id, provider, account_email, google_email, last_sync_at, scopes, created_at",
    )
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: true });

  const rows = mailboxes ?? [];

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-3xl w-full mx-auto">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
          <Link href="/app/settings">
            <ArrowLeft />
            Back to settings
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mailboxes</h1>
        <p className="text-sm text-muted-foreground">
          Connect a mailbox to enrich your contacts with real email history.
          Your contact list is the source of truth — Orbit only ever searches
          for known contacts, never browses your inbox at large.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {rows.length === 0 && (
          <Card className="p-6 flex flex-col gap-3 items-start">
            <p className="text-sm text-muted-foreground">No mailboxes connected.</p>
            <Button asChild>
              <Link href="/api/google/connect">
                <Mail className="h-4 w-4" />
                Connect Gmail
              </Link>
            </Button>
          </Card>
        )}

        {rows.map((m) => {
          const okScopes = hasAllScopes(m.scopes, REQUIRED_GMAIL_READ_SCOPES);
          return (
            <Card key={m.id} className="p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Inbox className="h-4 w-4" />
              </div>
              <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {m.account_email ?? m.google_email}
                  </span>
                  <Badge variant="muted" className="font-normal">
                    {m.provider}
                  </Badge>
                  {!okScopes && (
                    <Badge
                      variant="muted"
                      className="font-normal text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/40"
                    >
                      reconnect needed
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {m.last_sync_at
                    ? `Last enriched ${formatRelativeTime(m.last_sync_at)}`
                    : "Never enriched"}
                </span>
              </div>
              {!okScopes && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/api/google/connect">Reconnect</Link>
                </Button>
              )}
            </Card>
          );
        })}

        <Card className="p-5 flex items-center gap-4 opacity-60">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <Inbox className="h-4 w-4" />
          </div>
          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Outlook</span>
              <Badge variant="muted" className="font-normal">
                outlook
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              Microsoft Graph adapter — coming in v3.5.
            </span>
          </div>
          <Button variant="outline" size="sm" disabled>
            <ArrowRight className="h-3 w-3" />
            Soon
          </Button>
        </Card>
      </div>
    </main>
  );
}
