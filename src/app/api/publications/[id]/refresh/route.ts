import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { pollPublication } from "@/lib/feeds/poll";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const result = await pollPublication(userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "refresh_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, inserted: result.inserted });
}
