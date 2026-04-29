import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 sm:px-6 py-16">
      <Card className="max-w-md w-full p-8 flex flex-col items-center text-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Search className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold tracking-tight">
            We couldn’t find that contact
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            They may have been removed, or the link is out of date.
          </p>
        </div>
        <Button asChild>
          <Link href="/app">
            <ArrowLeft />
            Back to contacts
          </Link>
        </Button>
      </Card>
    </main>
  );
}
