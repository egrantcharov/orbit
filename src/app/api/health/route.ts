/**
 * GET /api/health
 *
 * Auth-gated DB reachability probe. Returns the raw Supabase error code +
 * message on failure so we can tell "project paused" from "wrong key" from
 * "missing column" without having to guess from a 500.
 *
 * Auth-gated so this can't be used to probe a paused project anonymously.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type CheckResult = {
  ok: boolean;
  ms: number;
  rows?: number;
  error?: { code?: string; message?: string; details?: string };
};

async function timed<T>(fn: () => PromiseLike<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const v = await fn();
  return [v, Date.now() - t0];
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();

  const checks: Record<string, CheckResult> = {};

  // Cheapest possible probe — should return a count even on an empty table.
  try {
    const [res, ms] = await timed(() =>
      supabase
        .from("app_users")
        .select("*", { count: "exact", head: true })
        .limit(1),
    );
    checks.app_users = res.error
      ? {
          ok: false,
          ms,
          error: {
            code: res.error.code,
            message: res.error.message,
            details: res.error.details,
          },
        }
      : { ok: true, ms, rows: res.count ?? 0 };
  } catch (err) {
    checks.app_users = {
      ok: false,
      ms: 0,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }

  // Contacts for THIS user — confirms scoping works and counts whatever the
  // user uploaded last week.
  try {
    const [res, ms] = await timed(() =>
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("clerk_user_id", userId),
    );
    checks.contacts_for_me = res.error
      ? {
          ok: false,
          ms,
          error: {
            code: res.error.code,
            message: res.error.message,
            details: res.error.details,
          },
        }
      : { ok: true, ms, rows: res.count ?? 0 };
  } catch (err) {
    checks.contacts_for_me = {
      ok: false,
      ms: 0,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }

  // Probe a column that only exists if migration 0012 ran.
  try {
    const [res, ms] = await timed(() =>
      supabase.from("interactions").select("audio_path").limit(1),
    );
    checks.migration_0012_audio = res.error
      ? {
          ok: false,
          ms,
          error: {
            code: res.error.code,
            message: res.error.message,
            details: res.error.details,
          },
        }
      : { ok: true, ms };
  } catch (err) {
    checks.migration_0012_audio = {
      ok: false,
      ms: 0,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }

  // Probe a column that only exists if migration 0013 ran.
  try {
    const [res, ms] = await timed(() =>
      supabase.from("interactions").select("ai_action_items").limit(1),
    );
    checks.migration_0013_ai = res.error
      ? {
          ok: false,
          ms,
          error: {
            code: res.error.code,
            message: res.error.message,
            details: res.error.details,
          },
        }
      : { ok: true, ms };
  } catch (err) {
    checks.migration_0013_ai = {
      ok: false,
      ms: 0,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      ok,
      env: {
        supabaseUrlSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceRoleKeySet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        anthropicSet: !!process.env.ANTHROPIC_API_KEY,
      },
      checks,
      hint: ok
        ? "Everything responding."
        : checkFailureHint(checks),
    },
    { status: ok ? 200 : 503 },
  );
}

function checkFailureHint(checks: Record<string, CheckResult>): string {
  const firstFail = Object.values(checks).find((c) => !c.ok);
  const msg = firstFail?.error?.message ?? "";
  const code = firstFail?.error?.code ?? "";
  if (/paused|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    return "Supabase project looks paused or unreachable. Open the Supabase dashboard and restore the project.";
  }
  if (/JWT|API key|invalid|unauthor/i.test(msg)) {
    return "Service-role key looks wrong. Rotate it in Supabase → Settings → API, then update SUPABASE_SERVICE_ROLE_KEY in Vercel env.";
  }
  if (code === "42703" || /column .* does not exist/i.test(msg)) {
    return "Pending migrations haven't been applied to prod. Run `npm run migrate` with the production SUPABASE_DB_URL.";
  }
  return `First failure: ${code || "(no code)"} — ${msg || "(no message)"}`;
}
