import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Surfaces only stubs created by v3 enrichment (source='enrichment_stub').
// v2-era 'gmail'-source archived rows were purged in migration 0007 and
// are explicitly excluded here in case any survive.
//
// We additionally filter out obviously-marketing senders so the rescue
// card stays high-signal. The user wants their network, not a brand inbox.
const MARKETING_RE =
  /^(emails?|e|em|mail|mailer|reply|news|notifications?|newsletter|message|messaging|info|update|updates|comms|hello|do-not-reply|donotreply|noreply|no-reply|offers|deals|sale|sales|promo|loyalty|rewards|alerts|support|notify|account|accounts|orders?|shipping|delivery|tracking|invoices?|statements?|receipts?|tickets?|reservations?|bookings?)\.[a-z0-9-]+\.[a-z]{2,}$/i;

const TRANSACTIONAL_LOCAL_RE =
  /^(shop|deals?|offers?|sale|sales|orders?|tickets?|reservations?|bookings?|accounts?|statements?|receipts?|invoices?|delivery|shipping|tracking|rewards?|loyalty|promo|promotions?|notify|notifications?|noreply|no-reply|donotreply|do-not-reply|alerts?|billing|support|security|verify|verification|info|hello|news|newsletter|marketing)([._+-].*)?$/i;

function looksLikeMarketing(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  const domain = email.split("@")[1] ?? "";
  if (TRANSACTIONAL_LOCAL_RE.test(local)) return true;
  if (MARKETING_RE.test(domain)) return true;
  return false;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();

  const { data: orphans } = await supabase
    .from("contacts")
    .select(
      "id, email, display_name, message_count, last_interaction_at, linkedin_url",
    )
    .eq("clerk_user_id", userId)
    .eq("source", "enrichment_stub")
    .eq("is_archived", true)
    .is("linkedin_url", null)
    .not("email", "is", null)
    .order("message_count", { ascending: false, nullsFirst: false })
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(60);

  // Drop obvious marketing — the heuristic is restricted to local-part /
  // subdomain patterns so it never false-positives on personal addresses.
  const filtered = (orphans ?? []).filter(
    (o) => o.email && !looksLikeMarketing(o.email),
  );

  return NextResponse.json({ ok: true, orphans: filtered.slice(0, 20) });
}
