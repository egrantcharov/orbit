import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { ask } from "@/lib/anthropic/ask";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ error: "missing_question" }, { status: 400 });
  }
  if (body.question.length > 2000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  try {
    const answer = await ask(body.question, userId);
    return NextResponse.json({ ok: true, answer });
  } catch (err) {
    console.error("ask failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "ask_failed" }, { status: 500 });
  }
}
