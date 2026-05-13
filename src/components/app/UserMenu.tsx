"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { LogOut, Unplug, ChevronDown, Settings } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { APP_VERSION } from "@/lib/version";

export function UserMenu({
  googleEmail,
}: {
  googleEmail: string | null;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    "you@orbit";
  const fullName =
    user?.fullName ??
    user?.firstName ??
    email.split("@")[0];

  async function disconnect() {
    if (
      !confirm(
        "Disconnect your Google account? Orbit will keep the contacts already synced, but won't be able to pull new email until you reconnect.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(`Disconnect failed (${res.status})`);
      toast.success("Disconnected from Google");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full pr-2 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background">
        <ContactAvatar email={email} displayName={fullName} size="sm" />
        <span className="hidden lg:inline text-sm font-medium max-w-[140px] truncate">
          {(fullName ?? email).split(" ")[0]}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground truncate">
              {fullName}
            </span>
            <span className="text-xs text-muted-foreground truncate font-normal">
              {email}
            </span>
          </div>
        </DropdownMenuLabel>
        {googleEmail && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">
              Google connection
            </DropdownMenuLabel>
            <div className="px-2 pb-2 text-xs text-muted-foreground truncate">
              {googleEmail}
            </div>
            <DropdownMenuItem
              onClick={disconnect}
              disabled={busy}
              className="text-destructive focus:text-destructive"
            >
              <Unplug />
              {busy ? "Disconnecting…" : "Disconnect Google"}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Settings />
            Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signOut(() => router.push("/"))}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-3 py-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Orbit</span>
          <span>{APP_VERSION}</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
