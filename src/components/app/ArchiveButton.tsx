"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ArchiveButton({
  contactId,
  archived: initialArchived,
  size = "md",
}: {
  contactId: string;
  archived: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [archived, setArchived] = useState(initialArchived);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !archived;
    setArchived(next);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: next }),
      });
      if (!res.ok) throw new Error(`Archive failed (${res.status})`);
      toast.success(next ? "Archived" : "Restored");
      startTransition(() => router.refresh());
    } catch (err) {
      setArchived(!next);
      toast.error(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setIsLoading(false);
    }
  }

  const sizing = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isLoading}
      title={archived ? "Restore" : "Archive"}
      aria-label={archived ? "Restore contact" : "Archive contact"}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-50",
        "hover:bg-accent text-muted-foreground hover:text-foreground",
        sizing,
      )}
    >
      {archived ? (
        <ArchiveRestore className="h-4 w-4" />
      ) : (
        <Archive className="h-4 w-4" />
      )}
    </button>
  );
}
