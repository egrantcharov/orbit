import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatRelativeTime, initialsFor } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ContactDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const { id } = await params;
  const supabase = createSupabaseServiceClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, email, display_name, last_interaction_at, message_count")
    .eq("clerk_user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (!contact) notFound();

  const { data: links } = await supabase
    .from("thread_participants")
    .select("thread_id")
    .eq("contact_id", contact.id);

  const threadIds = (links ?? []).map((l) => l.thread_id);

  const { data: threads } =
    threadIds.length > 0
      ? await supabase
          .from("threads")
          .select("id, subject, snippet, last_message_at")
          .eq("clerk_user_id", userId)
          .in("id", threadIds)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(10)
      : { data: [] as Array<{ id: string; subject: string | null; snippet: string | null; last_message_at: string | null }> };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-900">
        <Link
          href="/app"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          ← All contacts
        </Link>
      </header>

      <section className="px-6 py-8 border-b border-zinc-200 dark:border-zinc-900">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 text-base font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {initialsFor(contact.display_name, contact.email)}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">
              {contact.display_name ?? contact.email}
            </h1>
            {contact.display_name && (
              <span className="text-sm text-zinc-500 truncate">
                {contact.email}
              </span>
            )}
            <span className="text-xs text-zinc-500 mt-1">
              {contact.message_count}{" "}
              {contact.message_count === 1 ? "message" : "messages"} · last
              interaction {formatRelativeTime(contact.last_interaction_at)}
            </span>
          </div>
        </div>
      </section>

      <section className="px-6 py-6">
        <h2 className="text-sm font-medium text-zinc-500 mb-3">
          Recent threads
        </h2>
        {!threads || threads.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No threads recorded yet. Try syncing again.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {threads.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-zinc-200 dark:border-zinc-900 px-4 py-3 flex flex-col gap-1"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium truncate">
                    {t.subject ?? "(no subject)"}
                  </h3>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {formatRelativeTime(t.last_message_at)}
                  </span>
                </div>
                {t.snippet && (
                  <p className="text-xs text-zinc-500 line-clamp-2">
                    {t.snippet}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
