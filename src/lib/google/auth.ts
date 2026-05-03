import { createOAuth2Client } from "@/lib/google/oauth";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/types/database";

// Shared OAuth client builder used by sync, send, calendar, etc. Throws if
// the user has no Google connection. Persists rotated credentials so we
// don't pay the refresh cost on every call.
export async function getAuthClient(clerkUserId: string) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("google_connections")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .single();
  if (error || !data) {
    throw new Error("No Google connection for user");
  }

  const oauth2 = createOAuth2Client();
  const refreshToken = decryptToken(data.refresh_token_encrypted);
  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: data.access_token ?? undefined,
    expiry_date: data.access_token_expires_at
      ? new Date(data.access_token_expires_at).getTime()
      : undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    const update: Database["public"]["Tables"]["google_connections"]["Update"] = {};
    if (tokens.access_token) update.access_token = tokens.access_token;
    if (tokens.expiry_date) {
      update.access_token_expires_at = new Date(tokens.expiry_date).toISOString();
    }
    if (tokens.refresh_token) {
      update.refresh_token_encrypted = encryptToken(tokens.refresh_token);
    }
    if (Object.keys(update).length > 0) {
      await supabase
        .from("google_connections")
        .update(update)
        .eq("clerk_user_id", clerkUserId);
    }
  });

  return {
    oauth2,
    googleEmail: data.google_email,
    scopes: data.scopes ?? [],
  };
}
