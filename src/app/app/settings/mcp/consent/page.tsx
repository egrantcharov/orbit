import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { ConsentForm } from "@/components/app/mcp/ConsentForm";
import { ALL_SCOPES, SCOPE_LABELS, type Scope } from "@/lib/mcp/scopes";

export const dynamic = "force-dynamic";

const CONSENT_COOKIE = "orbit_mcp_consent";

type ConsentPayload = {
  clientId: string;
  redirectUri: string;
  scopes: Scope[];
  state: string;
  pkce: string;
  issuedAt: number;
};

function readConsent(): ConsentPayload | null {
  // next/headers cookies() is async in Next 16.
  // Cast through unknown until the types update everywhere.
  return null;
}

export default async function ConsentPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ck: any = await (cookies as unknown as () => Promise<any>)();
  const raw = ck.get?.(CONSENT_COOKIE)?.value as string | undefined;
  if (!raw) {
    return (
      <main className="px-6 py-12 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight">No pending authorization</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The consent cookie has expired or this page was visited directly. Re-start the flow from your MCP client.
        </p>
      </main>
    );
  }

  let consent: ConsentPayload | null;
  try {
    consent = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as ConsentPayload;
  } catch {
    consent = null;
  }
  if (!consent) {
    return (
      <main className="px-6 py-12 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight">Authorization expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">Restart the flow from your MCP client.</p>
      </main>
    );
  }

  const supabase = createSupabaseServiceClient();
  const { data: client } = await supabase
    .from("mcp_clients")
    .select("client_id, client_name, redirect_uris, revoked_at")
    .eq("client_id", consent.clientId)
    .maybeSingle();
  if (!client || client.revoked_at) {
    return (
      <main className="px-6 py-12 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight">Unknown client</h1>
        <p className="mt-2 text-sm text-muted-foreground">That MCP client doesn&apos;t exist or has been revoked.</p>
      </main>
    );
  }

  // Default the granted scopes to whatever the client requested, narrowed to
  // the supported set.
  const requested = (consent.scopes ?? []).filter((s) =>
    (ALL_SCOPES as string[]).includes(s),
  ) as Scope[];

  return (
    <main className="px-6 py-12 max-w-2xl mx-auto flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Authorize {client.client_name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A client is asking to connect to your Orbit account. Review the
          permissions below and approve or deny.
        </p>
      </header>

      <ConsentForm
        clientName={client.client_name}
        requestedScopes={requested}
        scopeLabels={SCOPE_LABELS}
      />
    </main>
  );
}

// Hint for eslint that we wired async cookie access intentionally.
void readConsent;
