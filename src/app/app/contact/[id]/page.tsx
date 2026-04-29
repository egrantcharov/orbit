import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Users2,
  Mail,
  Calendar,
} from "lucide-react";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatRelativeTime } from "@/lib/format";
import { emailDomain } from "@/lib/utils";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PinButton } from "@/components/app/PinButton";
import { ClassifyMenu } from "@/components/app/ClassifyMenu";

export const dynamic = "force-dynamic";

const ROLE_LABELS = {
  from: { label: "They emailed you", icon: ArrowDownLeft, tone: "text-foreground" },
  to: { label: "You emailed them", icon: ArrowUpRight, tone: "text-foreground" },
  cc: { label: "CC'd", icon: Users2, tone: "text-muted-foreground" },
} as const;

type Role = keyof typeof ROLE_LABELS;

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
    .select(
      "id, email, display_name, last_interaction_at, message_count, created_at, kind, kind_reason, is_pinned",
    )
    .eq("clerk_user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (!contact) notFound();

  const { data: links } = await supabase
    .from("thread_participants")
    .select("thread_id, role")
    .eq("contact_id", contact.id);

  const linkMap = new Map<string, Role>(
    (links ?? []).map((l) => [l.thread_id, l.role as Role]),
  );
  const threadIds = Array.from(linkMap.keys());

  const { data: threads } =
    threadIds.length > 0
      ? await supabase
          .from("threads")
          .select("id, subject, snippet, last_message_at")
          .eq("clerk_user_id", userId)
          .in("id", threadIds)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(20)
      : {
          data: [] as Array<{
            id: string;
            subject: string | null;
            snippet: string | null;
            last_message_at: string | null;
          }>,
        };

  // Role distribution across all linked threads.
  const roleCounts = { from: 0, to: 0, cc: 0 } as Record<Role, number>;
  for (const role of linkMap.values()) roleCounts[role] += 1;

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-4xl w-full mx-auto flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
          <Link href="/app">
            <ArrowLeft />
            All contacts
          </Link>
        </Button>
      </div>

      <Card className="p-6 flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <ContactAvatar
            email={contact.email}
            displayName={contact.display_name}
            size="lg"
          />
          <div className="flex flex-1 flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {contact.display_name ?? contact.email}
              </h1>
              <Badge variant="muted" className="font-normal hidden sm:inline-flex">
                {emailDomain(contact.email)}
              </Badge>
            </div>
            {contact.display_name && (
              <p className="text-sm text-muted-foreground truncate">
                {contact.email}
              </p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {contact.message_count.toLocaleString()}{" "}
                {contact.message_count === 1 ? "message" : "messages"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                last {formatRelativeTime(contact.last_interaction_at)}
              </span>
              {threadIds.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Users2 className="h-3.5 w-3.5" />
                  {threadIds.length}{" "}
                  {threadIds.length === 1 ? "thread" : "threads"}
                </span>
              )}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <PinButton contactId={contact.id} pinned={contact.is_pinned} />
            <ClassifyMenu
              contactId={contact.id}
              currentKind={contact.kind}
            />
            <Button asChild variant="outline">
              <a href={`mailto:${contact.email}`}>
                <Mail />
                Email
              </a>
            </Button>
          </div>
        </div>

        {threadIds.length > 0 && (
          <div className="flex gap-2 pt-2">
            {(Object.keys(roleCounts) as Role[]).map((role) => {
              const count = roleCounts[role];
              if (count === 0) return null;
              const Icon = ROLE_LABELS[role].icon;
              return (
                <Badge
                  key={role}
                  variant="muted"
                  className="font-normal text-xs"
                >
                  <Icon className="h-3 w-3" />
                  {ROLE_LABELS[role].label} · {count}
                </Badge>
              );
            })}
          </div>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent threads
          </h2>
          <span className="text-xs text-muted-foreground">
            {threads ? `${threads.length} shown` : "—"}
          </span>
        </div>
        {!threads || threads.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No threads recorded for this contact in the last 30 days.
          </Card>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {threads.map((t) => {
              const role = linkMap.get(t.id) ?? null;
              const RoleIcon = role ? ROLE_LABELS[role].icon : null;
              const roleLabel = role ? ROLE_LABELS[role].label : null;
              return (
                <li
                  key={t.id}
                  className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-medium truncate">
                      {t.subject ?? "(no subject)"}
                    </h3>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(t.last_message_at)}
                    </span>
                  </div>
                  {t.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {t.snippet}
                    </p>
                  )}
                  {roleLabel && RoleIcon && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                      <RoleIcon className="h-3 w-3" />
                      {roleLabel}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
