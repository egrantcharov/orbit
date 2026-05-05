import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildTodayCards } from "@/lib/today/build";
import type { TodayBriefingBody } from "@/lib/types/database";

export const maxDuration = 30;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const supabase = createSupabaseServiceClient();

  if (!refresh) {
    const { data: cached } = await supabase
      .from("briefings")
      .select("body, generated_at")
      .eq("clerk_user_id", userId)
      .eq("kind", "today")
      .maybeSingle();
    if (cached?.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({
          ok: true,
          cached: true,
          ...(cached.body as TodayBriefingBody),
        });
      }
    }
  }

  const cards = await buildTodayCards(userId);
  const body: TodayBriefingBody = {
    generatedAt: new Date().toISOString(),
    cards,
  };

  // Upsert cache. Partial-unique index on (clerk_user_id) where kind='today'.
  const { data: existing } = await supabase
    .from("briefings")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("kind", "today")
    .maybeSingle();
  if (existing) {
    await supabase
      .from("briefings")
      .update({ body, generated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("briefings")
      .insert({ clerk_user_id: userId, kind: "today", body });
  }

  return NextResponse.json({ ok: true, cached: false, ...body });
}
