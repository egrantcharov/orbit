import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Upload, UserPlus, Mail } from "lucide-react";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { StatsBar } from "@/components/app/StatsBar";
import { ContactList, type ContactRow } from "@/components/app/ContactList";
import {
  ContactTabs,
  type ContactTab,
  isContactTab,
} from "@/components/app/ContactTabs";
import { ConnectGoogleEmpty } from "@/components/app/EmptyState";
import { Suggestions } from "@/components/app/Suggestions";
import { AskOrbit } from "@/components/app/AskOrbit";
import { ReconnectGooglePrompt } from "@/components/app/ReconnectGooglePrompt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  hasAllScopes,
  REQUIRED_GMAIL_READ_SCOPES,
} from "@/lib/google/scopes";

export const dynamic = "force-dynamic";

export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{
    google_error?: string;
    connected?: string;
    tab?: string;
  }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const params = await searchParams;
  const tab: ContactTab = isContactTab(params.tab) ? params.tab : "all";
  const supabase = createSupabaseServiceClient();

  const [
    { data: connection },
    { count: allCount },
    { count: pinnedCount },
    { count: archivedCount },
    { count: threadCount },
  ] = await Promise.all([
    supabase
      .from("mailbox_connections")
      .select("account_email, google_email, last_sync_at, scopes")
      .eq("clerk_user_id", userId)
      .eq("provider", "gmail")
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("is_archived", false),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("is_pinned", true)
      .eq("is_archived", false),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("is_archived", true),
    supabase
      .from("threads")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId),
  ]);

  // v3: contacts come from CSV/manual entry. Show the import nudge as a
  // first-class empty state instead of the v2 "connect Google" wall — Gmail
  // is now optional enrichment, not a prerequisite.
  if ((allCount ?? 0) === 0 && (archivedCount ?? 0) === 0) {
    return (
      <main className="px-4 sm:px-6 lg:px-10 py-12 max-w-3xl w-full mx-auto">
        {!connection && <ConnectGoogleEmpty error={params.google_error} />}
        <Card className="mt-8 p-8 flex flex-col gap-5 text-center items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <Upload className="h-6 w-6" />
          </div>
          <div className="flex flex-col gap-2 max-w-md">
            <h2 className="text-2xl font-semibold tracking-tight">
              Upload your network
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Drop a LinkedIn export or any CSV. We&apos;ll set up every
              contact with their company, role, and LinkedIn URL — then find
              your past email threads with each one.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg">
              <Link href="/app/import">
                <Upload className="h-4 w-4" />
                Upload CSV
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/app/import?manual=1">
                <UserPlus className="h-4 w-4" />
                Add manually
              </Link>
            </Button>
          </div>
          {connection && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Mail className="h-3 w-3" />
              Gmail connected as{" "}
              <span className="font-medium text-foreground">
                {connection.account_email ?? connection.google_email}
              </span>{" "}
              — ready to enrich after you upload.
            </p>
          )}
        </Card>
      </main>
    );
  }

  // Build the per-tab query.
  let q = supabase
    .from("contacts")
    .select(
      "id, email, display_name, last_interaction_at, message_count, is_pinned, is_archived, company, job_title",
    )
    .eq("clerk_user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (tab === "archived") q = q.eq("is_archived", true);
  else q = q.eq("is_archived", false);

  if (tab === "pinned") q = q.eq("is_pinned", true);

  const { data: contacts } = await q;
  const contactRows: ContactRow[] = contacts ?? [];

  const top = contactRows.reduce<ContactRow | null>(
    (a, c) => (a && a.message_count >= c.message_count ? a : c),
    null,
  );

  const needsReconnect = !hasAllScopes(
    connection?.scopes,
    REQUIRED_GMAIL_READ_SCOPES,
  );

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-6xl w-full mx-auto">
      {connection && needsReconnect && <ReconnectGooglePrompt />}

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your network</h1>
          <p className="text-sm text-muted-foreground">
            {connection ? (
              <>
                Enriched from{" "}
                <span className="font-medium text-foreground">
                  {connection.account_email ?? connection.google_email}
                </span>
                .
              </>
            ) : (
              <>Connect Gmail to find email threads with each contact.</>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/app/import">
              <Upload className="h-4 w-4" />
              Upload CSV
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/app/import?manual=1">
              <UserPlus className="h-4 w-4" />
              Add contact
            </Link>
          </Button>
        </div>
      </div>

      <StatsBar
        totalContacts={allCount ?? 0}
        totalThreads={threadCount ?? 0}
        lastSyncAt={connection?.last_sync_at ?? null}
        topContactName={top?.display_name ?? top?.email ?? null}
        topContactCount={top?.message_count ?? 0}
      />

      <AskOrbit />

      <Suggestions userId={userId} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ContactTabs
          active={tab}
          counts={{
            all: allCount ?? 0,
            pinned: pinnedCount ?? 0,
            archived: archivedCount ?? 0,
          }}
        />
      </div>

      {contactRows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {tab === "archived"
            ? "No archived contacts."
            : tab === "pinned"
              ? "Pin your most important contacts to see them here."
              : "No contacts yet."}
        </Card>
      ) : (
        <ContactList contacts={contactRows} />
      )}
    </main>
  );
}
