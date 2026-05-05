import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/types/database";

type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function normalizeEmail(v: unknown): string | null {
  const s = clean(v, 320);
  if (!s) return null;
  if (!s.includes("@")) return null;
  return s.toLowerCase();
}

// POST /api/contacts — manual entry. CSV bulk import goes through
// /api/contacts/import. Returns the created contact id so the modal can
// route the user to the new dashboard.
export async function POST(req: NextRequest) {
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

  const email = normalizeEmail(body.email);
  const displayName = clean(body.display_name);
  if (!email && !displayName) {
    return NextResponse.json({ error: "missing_identity" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  // Ensure app_user row exists.
  await supabase
    .from("app_users")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" });

  // Dedupe by email if present.
  if (email) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      // If the user is re-adding an archived stub, un-archive it.
      await supabase
        .from("contacts")
        .update({ is_archived: false, source: "manual" })
        .eq("id", existing.id);
      return NextResponse.json({ ok: true, id: existing.id, existed: true });
    }
  }

  const insert: ContactInsert = {
    clerk_user_id: userId,
    email,
    display_name: displayName,
    company: clean(body.company),
    job_title: clean(body.job_title),
    industry: clean(body.industry),
    sector: clean(body.sector),
    team: clean(body.team),
    school: clean(body.school),
    linkedin_url: clean(body.linkedin_url, 500),
    location: clean(body.location),
    met_at: clean(body.met_at),
    met_via: clean(body.met_via),
    interests: clean(body.interests, 4000),
    notes: clean(body.notes, 4000),
    birthday: typeof body.birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birthday)
      ? body.birthday
      : null,
    met_on: typeof body.met_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.met_on)
      ? body.met_on
      : null,
    source: "manual",
    is_archived: false,
    kind_locked: true,
  };

  const { data, error } = await supabase
    .from("contacts")
    .insert(insert)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    console.error("contact create failed", { userId, code: error?.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
