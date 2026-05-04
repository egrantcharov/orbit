import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/AppHeader";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createSupabaseServiceClient();
  const { data: connection } = await supabase
    .from("mailbox_connections")
    .select("account_email, google_email, last_sync_at")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader connection={connection} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
