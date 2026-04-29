import { auth } from "@clerk/nextjs/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { DigestPanel } from "@/components/app/digest/DigestPanel";

export const dynamic = "force-dynamic";

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default async function DigestPage() {
  const { userId } = await auth();
  if (!userId) return null;
  const supabase = createSupabaseServiceClient();

  const weekStart = mondayOf(new Date());
  const { data: digest } = await supabase
    .from("digests")
    .select("body, created_at, week_start, contacts_in, threads_in")
    .eq("clerk_user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-4xl w-full mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Newsletter digest
        </h1>
        <p className="text-sm text-muted-foreground">
          A clustered, AI-written summary of your newsletter inbox from the
          past week.
        </p>
      </div>

      <DigestPanel
        initialBody={digest?.body ?? null}
        initialCreatedAt={digest?.created_at ?? null}
        initialWeekStart={digest?.week_start ?? weekStart}
        initialContactsIn={digest?.contacts_in ?? 0}
        initialThreadsIn={digest?.threads_in ?? 0}
      />
    </main>
  );
}
