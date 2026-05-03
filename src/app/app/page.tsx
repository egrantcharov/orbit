import { auth } from "@clerk/nextjs/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { StatsBar } from "@/components/app/StatsBar";
import { ContactList, type ContactRow } from "@/components/app/ContactList";
import {
  ContactTabs,
  type ContactTab,
  isContactTab,
} from "@/components/app/ContactTabs";
import {
  ConnectGoogleEmpty,
  NoContactsEmpty,
} from "@/components/app/EmptyState";
import { Suggestions } from "@/components/app/Suggestions";
import { AskOrbit } from "@/components/app/AskOrbit";
import { ReconnectGooglePrompt } from "@/components/app/ReconnectGooglePrompt";
import { CleanupMenu } from "@/components/app/CleanupMenu";
import { hasAllScopes } from "@/lib/google/scopes";

export const dynamic = "force-dynamic";

const PROFESSIONAL_KINDS = ["person", "newsletter"];

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
  const tab: ContactTab = isContactTab(params.tab) ? params.tab : "people";
  const supabase = createSupabaseServiceClient();

  const [
    { data: connection },
    { count: peopleCount },
    { count: newslettersCount },
    { count: allCount },
    { count: pinnedCount },
    { count: threadCount },
  ] = await Promise.all([
    supabase
      .from("google_connections")
      .select("google_email, last_sync_at, scopes")
      .eq("clerk_user_id", userId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("kind", "person")
      .eq("is_hidden", false),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("kind", "newsletter")
      .eq("is_hidden", false),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("is_hidden", false),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("is_pinned", true)
      .eq("is_hidden", false),
    supabase
      .from("threads")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId),
  ]);

  const [{ count: hiddenCount }] = await Promise.all([
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("is_hidden", true),
  ]);

  if (!connection) {
    return (
      <main className="px-4 sm:px-6 lg:px-10 py-12">
        <ConnectGoogleEmpty error={params.google_error} />
      </main>
    );
  }

  // Build the per-tab query. The Hidden tab is the only one that surfaces
  // is_hidden=true rows; every other tab excludes them so noise stays
  // archived without being deleted.
  let q = supabase
    .from("contacts")
    .select(
      "id, email, display_name, last_interaction_at, message_count, kind, is_pinned, is_hidden, company, job_title",
    )
    .eq("clerk_user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (tab === "hidden") q = q.eq("is_hidden", true);
  else q = q.eq("is_hidden", false);

  if (tab === "people") q = q.eq("kind", "person");
  else if (tab === "newsletters") q = q.eq("kind", "newsletter");
  else if (tab === "pinned") q = q.eq("is_pinned", true);

  const { data: contacts } = await q;
  const contactRows: ContactRow[] = contacts ?? [];

  const top = contactRows.reduce<ContactRow | null>(
    (a, c) =>
      a && a.message_count >= c.message_count && PROFESSIONAL_KINDS.includes(a.kind)
        ? a
        : PROFESSIONAL_KINDS.includes(c.kind)
          ? c
          : a,
    null,
  );

  const needsReconnect = !hasAllScopes(connection.scopes);

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-6xl w-full mx-auto">
      {needsReconnect && <ReconnectGooglePrompt />}

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your contacts</h1>
        <p className="text-sm text-muted-foreground">
          Built from your last 30 days of email in{" "}
          <span className="font-medium text-foreground">
            {connection.google_email}
          </span>
          .
        </p>
      </div>

      <StatsBar
        totalContacts={peopleCount ?? 0}
        totalThreads={threadCount ?? 0}
        lastSyncAt={connection.last_sync_at}
        topContactName={top?.display_name ?? top?.email ?? null}
        topContactCount={top?.message_count ?? 0}
      />

      <AskOrbit />

      <Suggestions userId={userId} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ContactTabs
          active={tab}
          counts={{
            people: peopleCount ?? 0,
            newsletters: newslettersCount ?? 0,
            all: allCount ?? 0,
            pinned: pinnedCount ?? 0,
            hidden: hiddenCount ?? 0,
          }}
        />
        <CleanupMenu />
      </div>

      {contactRows.length === 0 ? (
        <NoContactsEmpty />
      ) : (
        <ContactList contacts={contactRows} />
      )}
    </main>
  );
}
