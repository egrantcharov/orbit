import Link from "next/link";
import { cn } from "@/lib/utils";

export type ContactTab = "people" | "newsletters" | "all" | "pinned";

const TABS: Array<{ key: ContactTab; label: string }> = [
  { key: "people", label: "People" },
  { key: "newsletters", label: "Newsletters" },
  { key: "all", label: "All" },
  { key: "pinned", label: "Pinned" },
];

export function ContactTabs({
  active,
  counts,
}: {
  active: ContactTab;
  counts: Record<ContactTab, number>;
}) {
  return (
    <div className="flex border-b -mb-px overflow-x-auto scrollbar-thin">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const href =
          tab.key === "people" ? "/app" : `/app?tab=${tab.key}`;
        return (
          <Link
            key={tab.key}
            href={href}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              "border-b-2",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                "ml-2 text-xs tabular-nums",
                isActive ? "text-muted-foreground" : "text-muted-foreground/70",
              )}
            >
              {counts[tab.key].toLocaleString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function isContactTab(value: string | undefined): value is ContactTab {
  return value === "people" || value === "newsletters" || value === "all" || value === "pinned";
}
