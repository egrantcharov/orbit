import { Users, MessagesSquare, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";

export function StatsBar({
  totalContacts,
  totalThreads,
  lastSyncAt,
  topContactName,
  topContactCount,
}: {
  totalContacts: number;
  totalThreads: number;
  lastSyncAt: string | null;
  topContactName: string | null;
  topContactCount: number;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat
        icon={<Users className="h-4 w-4" />}
        label="Contacts"
        value={totalContacts.toLocaleString()}
      />
      <Stat
        icon={<MessagesSquare className="h-4 w-4" />}
        label="Threads (30d)"
        value={totalThreads.toLocaleString()}
      />
      <Stat
        icon={<Clock className="h-4 w-4" />}
        label="Last sync"
        value={lastSyncAt ? formatRelativeTime(lastSyncAt) : "—"}
      />
      <Stat
        icon={<MessagesSquare className="h-4 w-4" />}
        label="Most active"
        value={
          topContactName
            ? `${topContactName} · ${topContactCount}`
            : "—"
        }
        truncate
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  truncate,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground shrink-0">
        {icon}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={`text-base font-semibold tracking-tight ${truncate ? "truncate" : ""}`}
        >
          {value}
        </span>
      </div>
    </Card>
  );
}
