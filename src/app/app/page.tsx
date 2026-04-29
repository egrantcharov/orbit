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
      .select("google_email, last_sync_at")
      .eq("clerk_user_id", userId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("kind", "person"),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("kind", "newsletter"),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId)
      .eq("is_pinned", true),
    supabase
      .from("threads")
      .select("*", { count: "exact", head: true })
      .eq("clerk_user_id", userId),
  ]);

  if (!connection) {
    return (
      <main className="px-4 sm:px-6 lg:px-10 py-12">
        <ConnectGoogleEmpty error={params.google_error} />
      </main>
    );
  }

  // Build the per-tab query.
  let q = supabase
    .from("contacts")
    .select(
      "id, email, display_name, last_interaction_at, message_count, kind, is_pinned",
    )
    .eq("clerk_user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(500);

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

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-6xl w-full mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your contacts</h1>
        <p className="text-sm text-muted-foreground">
          Built from the last 30 days of email metadata in{" "}
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

      <div>
        <ContactTabs
          active={tab}
          counts={{
            people: peopleCount ?? 0,
            newsletters: newslettersCount ?? 0,
            all: allCount ?? 0,
            pinned: pinnedCount ?? 0,
          }}
        />
      </div>

      {contactRows.length === 0 ? (
        <NoContactsEmpty />
      ) : (
        <ContactList contacts={contactRows} />
      )}
    </main>
  );
}
