import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { SelfProfile } from "@/lib/types/database";

const ALLOWED_KEYS: (keyof SelfProfile)[] = [
  "industry",
  "role",
  "age_bracket",
  "location",
];

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const profile: SelfProfile = {};
  for (const k of ALLOWED_KEYS) {
    if (k in body) profile[k] = clean(body[k]);
  }

  const supabase = createSupabaseServiceClient();
  // Ensure app_users row exists, then merge profile.
  const { data: existing } = await supabase
    .from("app_users")
    .select("self_profile")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const merged: SelfProfile = {
    ...(existing?.self_profile ?? {}),
    ...profile,
  };

  const { error } = await supabase
    .from("app_users")
    .upsert(
      { clerk_user_id: userId, self_profile: merged },
      { onConflict: "clerk_user_id" },
    );
  if (error) {
    console.error("self profile update failed", { userId, code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, profile: merged });
}
