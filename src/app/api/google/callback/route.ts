import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { createOAuth2Client } from "@/lib/google/oauth";
import { encryptToken } from "@/lib/crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateUserId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/app?google_error=${error}`, req.url));
  }
  if (!code || stateUserId !== userId) {
    return NextResponse.redirect(new URL("/app?google_error=bad_state", req.url));
  }

  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  const { refresh_token, access_token, expiry_date, scope } = tokens;

  if (!refresh_token) {
    // Happens when the user has previously consented and Google didn't issue
    // a fresh refresh token. The connect URL forces prompt=consent which
    // should normally avoid this.
    return NextResponse.redirect(
      new URL("/app?google_error=missing_refresh_token", req.url),
    );
  }

  oauth2.setCredentials(tokens);
  const userinfo = await google
    .oauth2({ version: "v2", auth: oauth2 })
    .userinfo.get();
  const googleEmail = userinfo.data.email;
  if (!googleEmail) {
    return NextResponse.redirect(
      new URL("/app?google_error=missing_email", req.url),
    );
  }

  const clerkUser = await currentUser();
  const clerkEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    null;

  const supabase = createSupabaseServiceClient();

  const { error: userErr } = await supabase
    .from("app_users")
    .upsert(
      { clerk_user_id: userId, email: clerkEmail },
      { onConflict: "clerk_user_id" },
    );
  if (userErr) {
    console.error("Failed to upsert app_user", userErr);
    return NextResponse.redirect(
      new URL("/app?google_error=db_user", req.url),
    );
  }

  // v3: try to update an existing row first (single-mailbox-per-user
  // assertion). If none exists yet, insert. Avoids a unique-constraint
  // collision on the partial (clerk_user_id, provider, lower(account_email))
  // index when the user reconnects with a different google account.
  const { data: existing } = await supabase
    .from("mailbox_connections")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  // Intentionally drop the access_token from the code-exchange response.
  // Google access tokens are scope-bound at issue time, and we've seen
  // cases where the cached token presented to Gmail is rejected with
  // "Metadata scope doesn't allow format FULL" even though the scopes
  // column shows all granted scopes. By starting with no cached token,
  // the next API call refreshes via the refresh_token — that produces a
  // token that always matches the refresh_token's scope grant.
  void access_token;
  void expiry_date;
  const connectionPayload = {
    clerk_user_id: userId,
    provider: "gmail" as const,
    account_email: googleEmail,
    google_email: googleEmail,
    refresh_token_encrypted: encryptToken(refresh_token),
    access_token: null,
    access_token_expires_at: null,
    scopes: scope ? scope.split(" ") : [],
  };

  const { error: connErr } = existing
    ? await supabase
        .from("mailbox_connections")
        .update(connectionPayload)
        .eq("id", existing.id)
    : await supabase.from("mailbox_connections").insert(connectionPayload);

  if (connErr) {
    console.error("Failed to upsert mailbox_connection", connErr);
    return NextResponse.redirect(
      new URL("/app?google_error=db_conn", req.url),
    );
  }

  return NextResponse.redirect(new URL("/app?connected=1", req.url));
}
