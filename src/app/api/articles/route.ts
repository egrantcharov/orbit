import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// GET /api/articles?filter=unread|all|starred&pub=<publication_id>
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const pub = url.searchParams.get("pub");
  const supabase = createSupabaseServiceClient();
  let q = supabase
    .from("articles")
    .select(
      "id, publication_id, url, title, author, snippet, published_at, fetched_at, is_read, is_starred, tldr, tldr_takeaways, tldr_at",
    )
    .eq("clerk_user_id", userId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false })
    .limit(150);
  if (filter === "unread") q = q.eq("is_read", false);
  if (filter === "starred") q = q.eq("is_starred", true);
  if (pub) q = q.eq("publication_id", pub);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, articles: data ?? [] });
}
