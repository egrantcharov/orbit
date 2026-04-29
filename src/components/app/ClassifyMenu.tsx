"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MoreVertical,
  User,
  Mail,
  Bot,
  Ban,
  Trash2,
  ShieldQuestion,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContactKind } from "@/lib/types/database";

const KIND_OPTIONS: Array<{
  kind: ContactKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { kind: "person", label: "Mark as person", icon: User },
  { kind: "newsletter", label: "Mark as newsletter", icon: Mail },
  { kind: "automated", label: "Mark as automated", icon: Bot },
  { kind: "noreply", label: "Mark as no-reply", icon: Ban },
  { kind: "spam", label: "Mark as spam", icon: Trash2 },
  { kind: "unknown", label: "Reset (re-classify)", icon: ShieldQuestion },
];

export function ClassifyMenu({
  contactId,
  currentKind,
  size = "md",
}: {
  contactId: string;
  currentKind: ContactKind;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function setKind(kind: ContactKind, e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error(`Classify failed (${res.status})`);
      toast.success(`Marked as ${kind}`);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Classify failed");
    } finally {
      setIsLoading(false);
    }
  }

  const sizing = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={isLoading}
        title="Reclassify contact"
        aria-label="Reclassify contact"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 ${sizing}`}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Classification</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {KIND_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isCurrent = opt.kind === currentKind;
          return (
            <DropdownMenuItem
              key={opt.kind}
              onClick={(e) => setKind(opt.kind, e)}
              disabled={isCurrent}
            >
              <Icon />
              {opt.label}
              {isCurrent && (
                <span className="ml-auto text-xs text-muted-foreground">
                  current
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
