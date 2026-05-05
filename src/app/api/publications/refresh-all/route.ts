import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { pollPublication } from "@/lib/feeds/poll";

export const maxDuration = 60;

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();
  const { data: pubs } = await supabase
    .from("publications")
    .select("id")
    .eq("clerk_user_id", userId);
  if (!pubs || pubs.length === 0) {
    return NextResponse.json({ ok: true, polled: 0 });
  }
  // Run with concurrency 4 to stay friendly to upstream.
  let inserted = 0;
  let errors = 0;
  for (let i = 0; i < pubs.length; i += 4) {
    const slice = pubs.slice(i, i + 4);
    const results = await Promise.all(
      slice.map((p) => pollPublication(userId, p.id)),
    );
    for (const r of results) {
      if (r.ok) inserted += r.inserted;
      else errors += 1;
    }
  }
  return NextResponse.json({
    ok: true,
    polled: pubs.length,
    inserted,
    errors,
  });
}
