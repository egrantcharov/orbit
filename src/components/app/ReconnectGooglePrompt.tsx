import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertCircle } from "lucide-react";

export function ReconnectGooglePrompt() {
  return (
    <Card className="border-amber-300/60 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
      <div className="flex items-start gap-3 flex-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-200/60 dark:bg-amber-400/20">
          <AlertCircle className="h-4 w-4 text-amber-800 dark:text-amber-300" />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">
            Reconnect Google to enable v2 features
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We expanded permissions so Orbit can read newsletter bodies for the
            digest, send email on your behalf, and create calendar events. Your
            existing data stays put.
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <a href="/api/google/connect">
          Reconnect <ArrowRight />
        </a>
      </Button>
    </Card>
  );
}
