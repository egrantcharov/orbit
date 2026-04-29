import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SyncControl } from "@/components/app/SyncControl";
import { UserMenu } from "@/components/app/UserMenu";

export function AppHeader({
  connection,
}: {
  connection: { google_email: string; last_sync_at: string | null } | null;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="px-4 sm:px-6 lg:px-10 h-14 flex items-center justify-between gap-4">
        <Link href="/app" aria-label="Orbit home">
          <Logo size="md" />
        </Link>
        <div className="flex items-center gap-3">
          <SyncControl
            lastSyncAt={connection?.last_sync_at ?? null}
            connected={!!connection}
          />
          <UserMenu googleEmail={connection?.google_email ?? null} />
        </div>
      </div>
    </header>
  );
}
