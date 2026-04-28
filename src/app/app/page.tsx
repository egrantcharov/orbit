import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatRelativeTime, initialsFor } from "@/lib/format";
import { SyncButton } from "./SyncButton";

export const dynamic = "force-dynamic";

export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ google_error?: string; connected?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null; // proxy will redirect, but be safe.

  const params = await searchParams;
  const supabase = createSupabaseServiceClient();

  const { data: connection } = await supabase
    .from("google_connections")
    .select("google_email, last_sync_at")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, email, display_name, last_interaction_at, message_count")
    .eq("clerk_user_id", userId)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(200);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-900">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Orbit
          </Link>
          {connection && (
            <span className="text-xs text-zinc-500 hidden sm:inline">
              {connection.google_email} · last synced{" "}
              {formatRelativeTime(connection.last_sync_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {connection && <SyncButton />}
          <UserButton />
        </div>
      </header>

      {params.google_error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Couldn’t connect Google: {params.google_error}
        </div>
      )}

      {!connection ? (
        <ConnectGoogleEmpty />
      ) : !contacts || contacts.length === 0 ? (
        <NoContactsYet />
      ) : (
        <ContactsList contacts={contacts} />
      )}
    </main>
  );
}

function ConnectGoogleEmpty() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="max-w-md flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          Connect your Google account
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Orbit reads your Gmail metadata (sender, recipients, subject, date —
          not message bodies in v1) to build a contact timeline. Nothing is
          shared, and you can disconnect any time.
        </p>
        <div className="pt-2">
          <a
            href="/api/google/connect"
            className="inline-flex h-11 items-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            Connect Google
          </a>
        </div>
      </div>
    </section>
  );
}

function NoContactsYet() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="max-w-md flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          No contacts yet
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Press <span className="font-medium">Sync now</span> to pull the last
          30 days of email threads. The first sync takes about 30 seconds.
        </p>
      </div>
    </section>
  );
}

type ContactRow = {
  id: string;
  email: string;
  display_name: string | null;
  last_interaction_at: string | null;
  message_count: number;
};

function ContactsList({ contacts }: { contacts: ContactRow[] }) {
  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-900">
      {contacts.map((c) => (
        <li key={c.id}>
          <Link
            href={`/app/contact/${c.id}`}
            className="flex items-center gap-4 px-6 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {initialsFor(c.display_name, c.email)}
            </div>
            <div className="flex flex-1 flex-col min-w-0">
              <span className="text-sm font-medium truncate">
                {c.display_name ?? c.email}
              </span>
              {c.display_name && (
                <span className="text-xs text-zinc-500 truncate">
                  {c.email}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5 text-xs text-zinc-500">
              <span>{formatRelativeTime(c.last_interaction_at)}</span>
              <span>
                {c.message_count} {c.message_count === 1 ? "msg" : "msgs"}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
