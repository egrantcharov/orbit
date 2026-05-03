import Link from "next/link";
import { Mail, Sparkles, ArrowRight, Clock, Cake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatRelativeTime } from "@/lib/format";

const DRIFTING_DAYS = 30;
const NEW_DAYS = 7;
const MIN_MESSAGES_FOR_DRIFTING = 3;
const BIRTHDAY_WINDOW_DAYS = 14;

type SuggestionRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  last_interaction_at: string | null;
  message_count: number;
};

type BirthdayRow = SuggestionRow & {
  birthday: string;
  daysAway: number;
  age: number | null;
  monthDay: string;
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function birthdayInfo(birthday: string, days: number): {
  daysAway: number;
  age: number | null;
  monthDay: string;
} | null {
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const today = new Date();
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  let next = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day));
  if (next.getTime() < utcToday.getTime()) {
    next = new Date(Date.UTC(today.getUTCFullYear() + 1, month - 1, day));
  }
  const daysAway = Math.round(
    (next.getTime() - utcToday.getTime()) / 86_400_000,
  );
  if (daysAway > days) return null;
  const monthName = next.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const age = year > 1900 ? next.getUTCFullYear() - year : null;
  return { daysAway, age, monthDay: `${monthName} ${day}` };
}

export async function Suggestions({ userId }: { userId: string }) {
  const supabase = createSupabaseServiceClient();
  const driftingCutoff = daysAgoIso(DRIFTING_DAYS);
  const newCutoff = daysAgoIso(NEW_DAYS);
  const pinnedQuietCutoff = daysAgoIso(14);

  const [
    { data: drifting },
    { data: newThisWeek },
    { data: pinnedQuiet },
    { data: birthdayCandidates },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, email, display_name, last_interaction_at, message_count")
      .eq("clerk_user_id", userId)
      .eq("kind", "person")
      .eq("is_hidden", false)
      .lt("last_interaction_at", driftingCutoff)
      .gte("message_count", MIN_MESSAGES_FOR_DRIFTING)
      .order("message_count", { ascending: false })
      .limit(3),
    supabase
      .from("contacts")
      .select("id, email, display_name, last_interaction_at, message_count")
      .eq("clerk_user_id", userId)
      .eq("kind", "person")
      .eq("is_hidden", false)
      .gte("created_at", newCutoff)
      .order("message_count", { ascending: false })
      .limit(3),
    supabase
      .from("contacts")
      .select("id, email, display_name, last_interaction_at, message_count")
      .eq("clerk_user_id", userId)
      .eq("is_pinned", true)
      .eq("is_hidden", false)
      .lt("last_interaction_at", pinnedQuietCutoff)
      .order("last_interaction_at", { ascending: true, nullsFirst: true })
      .limit(3),
    supabase
      .from("contacts")
      .select("id, email, display_name, last_interaction_at, message_count, birthday")
      .eq("clerk_user_id", userId)
      .eq("is_hidden", false)
      .not("birthday", "is", null),
  ]);

  const driftingRows: SuggestionRow[] = drifting ?? [];
  const newRows: SuggestionRow[] = newThisWeek ?? [];
  const pinnedRows: SuggestionRow[] = pinnedQuiet ?? [];

  const birthdayRows: BirthdayRow[] = ((birthdayCandidates ?? []) as Array<
    SuggestionRow & { birthday: string | null }
  >)
    .map((r) => {
      if (!r.birthday) return null;
      const info = birthdayInfo(r.birthday, BIRTHDAY_WINDOW_DAYS);
      if (!info) return null;
      return { ...r, birthday: r.birthday, ...info } as BirthdayRow;
    })
    .filter((r): r is BirthdayRow => r !== null)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 4);

  const totalCards =
    driftingRows.length + newRows.length + pinnedRows.length + birthdayRows.length;
  if (totalCards === 0) {
    return null;
  }

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold tracking-tight">This week</h2>
      </div>

      {birthdayRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-medium">
            <Cake className="h-3.5 w-3.5" />
            Upcoming birthdays
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {birthdayRows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <ContactAvatar
                  email={r.email ?? ""}
                  displayName={r.display_name}
                  size="sm"
                />
                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <Link
                    href={`/app/contact/${r.id}`}
                    className="text-sm font-medium truncate hover:underline"
                  >
                    {r.display_name ?? r.email ?? "(no name)"}
                  </Link>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {r.daysAway === 0
                      ? "today!"
                      : r.daysAway === 1
                        ? `tomorrow · ${r.monthDay}`
                        : `${r.monthDay} · in ${r.daysAway} days`}
                    {r.age !== null && ` · turns ${r.age}`}
                  </span>
                </div>
                {r.email && (
                  <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <a
                      href={`mailto:${r.email}?subject=${encodeURIComponent("Happy birthday!")}`}
                      aria-label={`Email ${r.display_name ?? r.email}`}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Link
                    href={`/app/contact/${r.id}`}
                    aria-label={`Open ${r.display_name ?? r.email ?? "contact"}`}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SuggestionGroup
          title="Reach back out"
          icon={<Clock className="h-3.5 w-3.5" />}
          rows={driftingRows}
          emptyMessage="No drifting contacts."
          reasonFor={(r) =>
            r.last_interaction_at
              ? `Haven't talked in ${daysSince(r.last_interaction_at)} days`
              : "Haven't talked"
          }
        />
        <SuggestionGroup
          title="Pinned & quiet"
          icon={<Clock className="h-3.5 w-3.5" />}
          rows={pinnedRows}
          emptyMessage="Pin your most important contacts to see them here."
          reasonFor={(r) =>
            r.last_interaction_at
              ? `${formatRelativeTime(r.last_interaction_at)} since last`
              : "No interaction yet"
          }
        />
        <SuggestionGroup
          title="New this week"
          icon={<Sparkles className="h-3.5 w-3.5" />}
          rows={newRows}
          emptyMessage="No new connections this week."
          reasonFor={(r) =>
            `${r.message_count} ${r.message_count === 1 ? "msg" : "msgs"} so far`
          }
        />
      </div>
    </Card>
  );
}

function daysSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function SuggestionGroup({
  title,
  icon,
  rows,
  emptyMessage,
  reasonFor,
}: {
  title: string;
  icon: React.ReactNode;
  rows: SuggestionRow[];
  emptyMessage: string;
  reasonFor: (r: SuggestionRow) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-medium">
        {icon}
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
            >
              <ContactAvatar
                email={r.email ?? ""}
                displayName={r.display_name}
                size="sm"
              />
              <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                <Link
                  href={`/app/contact/${r.id}`}
                  className="text-sm font-medium truncate hover:underline"
                >
                  {r.display_name ?? r.email ?? "(no name)"}
                </Link>
                <span className="text-[11px] text-muted-foreground truncate">
                  {reasonFor(r)}
                </span>
              </div>
              {r.email && (
                <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <a
                    href={`mailto:${r.email}`}
                    aria-label={`Email ${r.display_name ?? r.email}`}
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0">
                <Link
                  href={`/app/contact/${r.id}`}
                  aria-label={`Open ${r.display_name ?? r.email ?? "contact"}`}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
