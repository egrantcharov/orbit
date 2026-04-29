import { auth } from "@clerk/nextjs/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { StatsBar } from "@/components/app/StatsBar";
import { ContactList, type ContactRow } from "@/components/app/ContactList";
import { ConnectGoogleEmpty, NoContactsEmpty } from "@/components/app/EmptyState";

export const dynamic = "force-dynamic";

export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{
    google_error?: string;
    connected?: string;
  }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const params = await searchParams;
  const supabase = createSupabaseServiceClient();

  const [{ data: connection }, { data: contacts }, { count: threadCount }] =
    await Promise.all([
      supabase
        .from("google_connections")
        .select("google_email, last_sync_at")
        .eq("clerk_user_id", userId)
        .maybeSingle(),
      supabase
        .from("contacts")
        .select("id, email, display_name, last_interaction_at, message_count")
        .eq("clerk_user_id", userId)
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .limit(500),
      supabase
        .from("threads")
        .select("id", { count: "exact", head: true })
        .eq("clerk_user_id", userId),
    ]);

  if (!connection) {
    return (
      <main className="px-4 sm:px-6 lg:px-10 py-12">
        <ConnectGoogleEmpty error={params.google_error} />
      </main>
    );
  }

  const contactRows: ContactRow[] = contacts ?? [];
  const top = contactRows.reduce<ContactRow | null>(
    (a, c) => (a && a.message_count >= c.message_count ? a : c),
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
        totalContacts={contactRows.length}
        totalThreads={threadCount ?? 0}
        lastSyncAt={connection.last_sync_at}
        topContactName={top?.display_name ?? top?.email ?? null}
        topContactCount={top?.message_count ?? 0}
      />

      {contactRows.length === 0 ? (
        <NoContactsEmpty />
      ) : (
        <ContactList contacts={contactRows} />
      )}
    </main>
  );
}
