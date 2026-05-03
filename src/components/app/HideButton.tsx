"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function HideButton({
  contactId,
  hidden: initialHidden,
  size = "md",
}: {
  contactId: string;
  hidden: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(initialHidden);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !hidden;
    setHidden(next);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_hidden: next }),
      });
      if (!res.ok) throw new Error(`Hide failed (${res.status})`);
      toast.success(next ? "Hidden" : "Unhidden");
      startTransition(() => router.refresh());
    } catch (err) {
      setHidden(!next);
      toast.error(err instanceof Error ? err.message : "Hide failed");
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
      title={hidden ? "Unhide" : "Hide"}
      aria-label={hidden ? "Unhide contact" : "Hide contact"}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-50",
        "hover:bg-accent text-muted-foreground hover:text-foreground",
        sizing,
      )}
    >
      {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  );
}
