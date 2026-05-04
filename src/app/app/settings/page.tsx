import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { SelfProfileForm } from "@/components/app/SelfProfileForm";
import type { SelfProfile } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("app_users")
    .select("self_profile")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const profile: SelfProfile = data?.self_profile ?? {};

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-3xl w-full mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-muted-foreground">
          Used to ground relationship scores — without it, industry overlap and
          age proximity can&apos;t be estimated. Stays on your account; never
          shared.
        </p>
      </div>

      <SelfProfileForm initial={profile} />

      <a
        href="/app/settings/mailboxes"
        className="text-sm text-primary hover:underline"
      >
        Manage connected mailboxes →
      </a>
    </main>
  );
}
