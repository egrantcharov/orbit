import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { CONTACT_KINDS, type ContactKind } from "@/lib/types/database";

const ALLOWED_BULK_KINDS: ContactKind[] = [
  "newsletter",
  "automated",
  "noreply",
  "spam",
  "bulk_marketing",
  "transactional",
  "unknown",
];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { kinds?: unknown };
  try {
    body = (await req.json()) as { kinds?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.kinds)) {
    return NextResponse.json({ error: "invalid_kinds" }, { status: 400 });
  }
  const kinds = body.kinds.filter(
    (k): k is ContactKind =>
      typeof k === "string" &&
      (CONTACT_KINDS as string[]).includes(k) &&
      (ALLOWED_BULK_KINDS as string[]).includes(k),
  );
  if (kinds.length === 0) {
    return NextResponse.json({ error: "no_valid_kinds" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ is_hidden: true, hidden_reason: "bulk_hide" })
    .eq("clerk_user_id", userId)
    .eq("is_hidden", false)
    .eq("kind_locked", false)
    .in("kind", kinds)
    .select("id");

  if (error) {
    console.error("bulk-hide failed", { userId, code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, hidden: data?.length ?? 0 });
}
