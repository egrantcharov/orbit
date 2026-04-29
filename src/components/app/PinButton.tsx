"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PinButton({
  contactId,
  pinned: initialPinned,
  size = "md",
}: {
  contactId: string;
  pinned: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pinned, setPinned] = useState(initialPinned);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !pinned;
    setPinned(next); // optimistic
    setIsLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: next }),
      });
      if (!res.ok) throw new Error(`Pin failed (${res.status})`);
      startTransition(() => router.refresh());
    } catch (err) {
      setPinned(!next); // rollback
      toast.error(err instanceof Error ? err.message : "Pin failed");
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
      title={pinned ? "Unpin" : "Pin"}
      aria-label={pinned ? "Unpin contact" : "Pin contact"}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-50",
        "hover:bg-accent text-muted-foreground hover:text-foreground",
        pinned && "text-amber-600 dark:text-amber-400 hover:text-amber-700",
        sizing,
      )}
    >
      {pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
    </button>
  );
}
