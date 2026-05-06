import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchSynthSources } from "@/lib/synth/sources";
import { synthDaily } from "@/lib/anthropic/synth";
import type { SynthDailyBody } from "@/lib/types/database";

export const maxDuration = 30;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const WINDOW_HOURS = 30; // be a bit lenient — capture overnight feed pulls

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
      .eq("kind", "synth_daily")
      .maybeSingle();
    if (cached?.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({
          ok: true,
          cached: true,
          ...(cached.body as SynthDailyBody),
        });
      }
    }
  }

  const items = await fetchSynthSources({
    clerkUserId: userId,
    windowHours: WINDOW_HOURS,
    cap: 60,
  });

  let result;
  try {
    result = await synthDaily(items);
  } catch (err) {
    console.error("synth daily failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "synth_failed" }, { status: 500 });
  }

  const body: SynthDailyBody = {
    generatedAt: new Date().toISOString(),
    cards: result.cards,
    itemsConsidered: items.length,
  };

  // Upsert cache
  const { data: existing } = await supabase
    .from("briefings")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("kind", "synth_daily")
    .maybeSingle();
  if (existing) {
    await supabase
      .from("briefings")
      .update({ body, generated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("briefings")
      .insert({ clerk_user_id: userId, kind: "synth_daily", body });
  }

  return NextResponse.json({ ok: true, cached: false, ...body });
}
