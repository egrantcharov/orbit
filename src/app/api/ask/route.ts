import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { ask } from "@/lib/anthropic/ask";
import {
  isPlainObject,
  readJsonBody,
  rateLimitResponse,
} from "@/lib/security/input";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const maxDuration = 60;

const ASK_BODY_MAX = 4 * 1024; // 4 KB — the field cap is 2000 chars, this is plenty
const ASK_LIMIT_PER_MIN = 20;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`ask:${userId}`, ASK_LIMIT_PER_MIN, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const parsed = await readJsonBody(req, ASK_BODY_MAX);
  if (!parsed.ok) return parsed.response;
  if (!isPlainObject(parsed.value)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const question = parsed.value.question;
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "missing_question" }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  try {
    const answer = await ask(question, userId);
    return NextResponse.json({ ok: true, answer });
  } catch (err) {
    console.error("ask failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "ask_failed" }, { status: 500 });
  }
}
