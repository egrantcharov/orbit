"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to client console only — server-side errors are logged separately.
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 sm:px-6 py-16">
      <Card className="max-w-md w-full p-8 flex flex-col items-center text-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold tracking-tight">
            Something broke loading this page
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {error.message || "An unexpected error occurred."}
            {error.digest && (
              <span className="block mt-2 text-xs font-mono opacity-60">
                ref {error.digest}
              </span>
            )}
          </p>
        </div>
        <Button onClick={reset}>
          <RefreshCw />
          Try again
        </Button>
      </Card>
    </main>
  );
}
