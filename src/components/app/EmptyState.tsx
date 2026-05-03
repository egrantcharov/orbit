import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, ArrowRight } from "lucide-react";

export function ConnectGoogleEmpty({ error }: { error?: string }) {
  return (
    <Card className="mx-auto max-w-xl p-8 flex flex-col items-center text-center gap-5">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
        <Mail className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          Connect your Google account
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed text-balance">
          Orbit reads Gmail to build a relationship timeline, sends email on
          your behalf, and creates calendar events. Tokens are encrypted at
          rest and you can disconnect at any time.
        </p>
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn’t connect: {error}
        </p>
      )}
      <Button asChild size="lg">
        <a href="/api/google/connect">
          Connect Google <ArrowRight />
        </a>
      </Button>
      <p className="text-xs text-muted-foreground">
        Read-only access. Tokens encrypted at rest.
      </p>
    </Card>
  );
}

export function NoContactsEmpty() {
  return (
    <Card className="mx-auto max-w-md p-8 flex flex-col items-center text-center gap-3">
      <h2 className="text-lg font-semibold tracking-tight">
        Ready to populate
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Press <span className="font-medium text-foreground">Sync</span> in the
        header to pull your last 30 days of email. The first sync usually takes
        about 30 seconds.
      </p>
    </Card>
  );
}
