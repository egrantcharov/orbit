import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  BOOKMARK_KINDS,
  type BookmarkKind,
} from "@/lib/types/database";
import { classifyUrl, extractMetadata } from "@/lib/jina/extract";

export const maxDuration = 30;

function isBookmarkKind(v: unknown): v is BookmarkKind {
  return typeof v === "string" && (BOOKMARK_KINDS as string[]).includes(v);
}

function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select("id, url, title, description, kind, tags, created_at")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("bookmarks GET failed", { userId, code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ bookmarks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    url?: unknown;
    title?: unknown;
    description?: unknown;
    kind?: unknown;
    tags?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.url !== "string") {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }
  const url = normalizeUrl(body.url);
  if (!url) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  // Auto-derive missing fields from the URL.
  const fallbackKind = classifyUrl(url);
  const kind: BookmarkKind = isBookmarkKind(body.kind) ? body.kind : fallbackKind;

  let title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  let description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  if (!title || !description) {
    const meta = await extractMetadata(url);
    if (!title) title = meta.title;
    if (!description) description = meta.description;
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)
    : [];

  // Ensure app_user row exists so the bookmark FK resolves. Idempotent.
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("app_users")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" });

  const { data, error } = await supabase
    .from("bookmarks")
    .upsert(
      {
        clerk_user_id: userId,
        url,
        title,
        description,
        kind,
        tags,
      },
      { onConflict: "clerk_user_id,url" },
    )
    .select("id, url, title, description, kind, tags, created_at")
    .single();

  if (error) {
    console.error("bookmark POST failed", { userId, code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, bookmark: data });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("id", id);
  if (error) {
    console.error("bookmark DELETE failed", { userId, id, code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
