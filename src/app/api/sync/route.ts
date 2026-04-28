import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { syncRecentMessages } from "@/lib/gmail/sync";

export const maxDuration = 60;

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncRecentMessages(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("sync failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync_failed" },
      { status: 500 },
    );
  }
}
