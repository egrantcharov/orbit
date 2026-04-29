import { auth } from "@clerk/nextjs/server";
import { Card } from "@/components/ui/card";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { BookmarkForm } from "@/components/app/library/BookmarkForm";
import {
  LibraryFilter,
} from "@/components/app/library/LibraryFilter";
import type { BookmarkRowData } from "@/components/app/library/BookmarkRow";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("bookmarks")
    .select("id, url, title, description, kind, tags, created_at")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false });

  const bookmarks: BookmarkRowData[] = data ?? [];

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 flex flex-col gap-6 max-w-4xl w-full mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">
          GitHub repos, newsletters, articles, tools — anything you want to
          stay close to.
        </p>
      </div>

      <Card className="p-4">
        <BookmarkForm />
      </Card>

      <LibraryFilter bookmarks={bookmarks} />
    </main>
  );
}
