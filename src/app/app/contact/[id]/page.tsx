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
  Cake,
  ExternalLink,
  Building2,
  MapPin,
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
import { HideButton } from "@/components/app/HideButton";
import { SummaryCard } from "@/components/app/SummaryCard";
import { ScoreChart } from "@/components/app/ScoreChart";
import { ContactProfileEditor } from "@/components/app/ContactProfileEditor";
import { EmailComposeModal } from "@/components/app/EmailComposeModal";
import { ScheduleEventModal } from "@/components/app/ScheduleEventModal";

export const dynamic = "force-dynamic";

const ROLE_LABELS = {
  from: { label: "They emailed you", icon: ArrowDownLeft },
  to: { label: "You emailed them", icon: ArrowUpRight },
  cc: { label: "CC'd", icon: Users2 },
} as const;

type Role = keyof typeof ROLE_LABELS;

function birthdayCountdown(birthday: string | null): {
  daysAway: number;
  age: number | null;
  display: string;
} | null {
  if (!birthday) return null;
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (Number.isNaN(month) || Number.isNaN(day)) return null;
  const today = new Date();
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  let next = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day));
  if (next.getTime() < utcToday.getTime()) {
    next = new Date(Date.UTC(today.getUTCFullYear() + 1, month - 1, day));
  }
  const days = Math.round((next.getTime() - utcToday.getTime()) / 86_400_000);
  const age =
    year > 1900 ? next.getUTCFullYear() - year : null;
  const monthName = next.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  let display = `${monthName} ${day}`;
  if (days === 0) display = `today!`;
  else if (days === 1) display = `tomorrow (${monthName} ${day})`;
  else if (days <= 14) display = `in ${days} days (${monthName} ${day})`;
  return { daysAway: days, age, display };
}

export default async function ContactDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const { id } = await params;
  const supabase = createSupabaseServiceClient();

  const [{ data: contact }, { data: connection }] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, email, display_name, last_interaction_at, message_count, created_at, kind, kind_reason, is_pinned, is_hidden, ai_summary, ai_summary_at, source, company, job_title, industry, location, linkedin_url, birthday, tags, notes, score_closeness, score_keep_in_touch, score_industry_overlap, score_age_proximity, score_career_relevance, scores_rationale, scores_at",
      )
      .eq("clerk_user_id", userId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("google_connections")
      .select("google_email")
      .eq("clerk_user_id", userId)
      .maybeSingle(),
  ]);

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
          .select("id, subject, snippet, body_excerpt, last_message_at")
          .eq("clerk_user_id", userId)
          .in("id", threadIds)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(20)
      : {
          data: [] as Array<{
            id: string;
            subject: string | null;
            snippet: string | null;
            body_excerpt: string | null;
            last_message_at: string | null;
          }>,
        };

  const roleCounts = { from: 0, to: 0, cc: 0 } as Record<Role, number>;
  for (const role of linkMap.values()) roleCounts[role] += 1;

  const bday = birthdayCountdown(contact.birthday);
  const headlineRow = [contact.job_title, contact.company]
    .filter(Boolean)
    .join(" · ");

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
            email={contact.email ?? ""}
            displayName={contact.display_name}
            size="lg"
          />
          <div className="flex flex-1 flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {contact.display_name ?? contact.email ?? "(no name)"}
              </h1>
              {contact.email && (
                <Badge variant="muted" className="font-normal hidden sm:inline-flex">
                  {emailDomain(contact.email)}
                </Badge>
              )}
              {contact.source === "linkedin" && (
                <Badge variant="muted" className="font-normal">
                  linkedin
                </Badge>
              )}
              {bday && bday.daysAway <= 30 && (
                <Badge
                  variant="muted"
                  className="font-normal text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/40"
                >
                  <Cake className="h-3 w-3" />
                  {bday.display}
                  {bday.age != null && ` · turns ${bday.age}`}
                </Badge>
              )}
            </div>
            {contact.email && contact.display_name && (
              <p className="text-sm text-muted-foreground truncate">
                {contact.email}
              </p>
            )}
            {headlineRow && (
              <p className="text-sm flex items-center gap-1.5 text-muted-foreground truncate">
                <Building2 className="h-3.5 w-3.5" />
                {headlineRow}
              </p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-muted-foreground">
              {contact.industry && (
                <span className="inline-flex items-center gap-1.5">
                  {contact.industry}
                </span>
              )}
              {contact.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {contact.location}
                </span>
              )}
              {contact.linkedin_url && (
                <a
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  href={contact.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  LinkedIn
                </a>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {contact.message_count.toLocaleString()}{" "}
                {contact.message_count === 1 ? "message" : "messages"}
              </span>
              {contact.last_interaction_at && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  last {formatRelativeTime(contact.last_interaction_at)}
                </span>
              )}
              {threadIds.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Users2 className="h-3.5 w-3.5" />
                  {threadIds.length}{" "}
                  {threadIds.length === 1 ? "thread" : "threads"}
                </span>
              )}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <PinButton contactId={contact.id} pinned={contact.is_pinned} />
            <HideButton contactId={contact.id} hidden={contact.is_hidden} />
            <ClassifyMenu contactId={contact.id} currentKind={contact.kind} />
          </div>
        </div>

        {threadIds.length > 0 && (
          <div className="flex gap-2 flex-wrap pt-2">
            {(Object.keys(roleCounts) as Role[]).map((role) => {
              const count = roleCounts[role];
              if (count === 0) return null;
              const Icon = ROLE_LABELS[role].icon;
              return (
                <Badge key={role} variant="muted" className="font-normal text-xs">
                  <Icon className="h-3 w-3" />
                  {ROLE_LABELS[role].label} · {count}
                </Badge>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <EmailComposeModal
            contactId={contact.id}
            contactEmail={contact.email}
            contactName={contact.display_name}
            fromEmail={connection?.google_email ?? null}
          />
          <ScheduleEventModal
            contactId={contact.id}
            contactEmail={contact.email}
            contactName={contact.display_name}
          />
        </div>
      </Card>

      <ScoreChart
        contactId={contact.id}
        initial={{
          closeness: contact.score_closeness,
          keep_in_touch: contact.score_keep_in_touch,
          industry_overlap: contact.score_industry_overlap,
          age_proximity: contact.score_age_proximity,
          career_relevance: contact.score_career_relevance,
          rationale: contact.scores_rationale,
          scoresAt: contact.scores_at,
        }}
      />

      <SummaryCard
        contactId={contact.id}
        isPerson={contact.kind === "person"}
        initialSummary={contact.ai_summary}
        initialSummaryAt={contact.ai_summary_at}
      />

      <ContactProfileEditor
        contactId={contact.id}
        initial={{
          company: contact.company,
          job_title: contact.job_title,
          industry: contact.industry,
          location: contact.location,
          birthday: contact.birthday,
          linkedin_url: contact.linkedin_url,
          tags: contact.tags ?? [],
          notes: contact.notes,
        }}
      />

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
              const preview = t.body_excerpt ?? t.snippet;
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
                  {preview && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {preview}
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
