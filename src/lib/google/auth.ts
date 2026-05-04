import { createOAuth2Client } from "@/lib/google/oauth";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/types/database";

// v3 single-mailbox-per-user assertion: if a user ever ends up with
// multiple mailbox_connections rows, we need to take an explicit mailboxId.
// For now we surface the row's id so callers can persist mailbox_id on
// derived rows (threads, enrichment_state, etc.).
export async function getAuthClient(
  clerkUserId: string,
  mailboxId?: string,
) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("mailbox_connections")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .eq("provider", "gmail");

  if (mailboxId) {
    query = query.eq("id", mailboxId);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    throw new Error("No Gmail connection for user");
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
    const update: Database["public"]["Tables"]["mailbox_connections"]["Update"] = {};
    if (tokens.access_token) update.access_token = tokens.access_token;
    if (tokens.expiry_date) {
      update.access_token_expires_at = new Date(tokens.expiry_date).toISOString();
    }
    if (tokens.refresh_token) {
      update.refresh_token_encrypted = encryptToken(tokens.refresh_token);
    }
    if (Object.keys(update).length > 0) {
      await supabase
        .from("mailbox_connections")
        .update(update)
        .eq("id", data.id);
    }
  });

  return {
    oauth2,
    googleEmail: data.account_email ?? data.google_email,
    scopes: data.scopes ?? [],
    mailboxId: data.id,
  };
}
