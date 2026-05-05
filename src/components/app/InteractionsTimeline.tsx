import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  ClipboardList,
  Phone,
  MessageSquare,
  Mic,
  Mail,
  CalendarClock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";
import type { InteractionKind } from "@/lib/types/database";

const KIND_META: Record<
  InteractionKind,
  { label: string; icon: typeof Mail; tone: string }
> = {
  email_thread: {
    label: "Email",
    icon: Mail,
    tone: "text-blue-700 bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300",
  },
  calendar_event: {
    label: "Meeting",
    icon: CalendarClock,
    tone: "text-violet-700 bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300",
  },
  note: {
    label: "Note",
    icon: ClipboardList,
    tone: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  voice_memo: {
    label: "Voice",
    icon: Mic,
    tone: "text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300",
  },
  phone: {
    label: "Phone",
    icon: Phone,
    tone: "text-cyan-700 bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300",
  },
  imessage: {
    label: "Chat",
    icon: MessageSquare,
    tone: "text-indigo-700 bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
};

export async function InteractionsTimeline({
  clerkUserId,
  contactId,
}: {
  clerkUserId: string;
  contactId: string;
}) {
  const supabase = createSupabaseServiceClient();
  const { data: rows } = await supabase
    .from("interactions")
    .select("id, kind, occurred_at, title, body")
    .eq("clerk_user_id", clerkUserId)
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(20);

  if (!rows || rows.length === 0) return null;

  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Activity log</h3>
        <span className="text-xs text-muted-foreground">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const meta = KIND_META[r.kind as InteractionKind];
          const Icon = meta.icon;
          return (
            <li key={r.id} className="flex items-start gap-3">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.tone}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="text-sm font-medium truncate">
                      {r.title || meta.label}
                    </h4>
                    <Badge variant="muted" className="font-normal text-[10px]">
                      {meta.label}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatRelativeTime(r.occurred_at)}
                  </span>
                </div>
                {r.body && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed mt-1">
                    {r.body}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
