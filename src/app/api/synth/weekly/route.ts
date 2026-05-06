import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchSynthSources } from "@/lib/synth/sources";
import { synthWeekly } from "@/lib/anthropic/synth";
import type { SynthWeeklyBody } from "@/lib/types/database";

export const maxDuration = 60;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const WINDOW_HOURS = 7 * 24;

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
      .eq("kind", "synth_weekly")
      .maybeSingle();
    if (cached?.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({
          ok: true,
          cached: true,
          ...(cached.body as SynthWeeklyBody),
        });
      }
    }
  }

  const items = await fetchSynthSources({
    clerkUserId: userId,
    windowHours: WINDOW_HOURS,
    cap: 80,
  });

  let result;
  try {
    result = await synthWeekly(items);
  } catch (err) {
    console.error("synth weekly failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "synth_failed" }, { status: 500 });
  }

  const body: SynthWeeklyBody = {
    generatedAt: new Date().toISOString(),
    clusters: result.clusters,
    itemsConsidered: items.length,
  };

  const { data: existing } = await supabase
    .from("briefings")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("kind", "synth_weekly")
    .maybeSingle();
  if (existing) {
    await supabase
      .from("briefings")
      .update({ body, generated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("briefings")
      .insert({ clerk_user_id: userId, kind: "synth_weekly", body });
  }

  return NextResponse.json({ ok: true, cached: false, ...body });
}
