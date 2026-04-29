import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Mail, MessagesSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-6 lg:px-10 py-5 flex items-center justify-between">
        <Logo size="md" />
        <nav className="flex items-center gap-2">
          {userId ? (
            <Button asChild>
              <Link href="/app">
                Open Orbit
                <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 lg:px-10">
        <section className="w-full max-w-3xl pt-16 pb-12 lg:pt-28 lg:pb-20 flex flex-col items-center text-center gap-8">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Personal CRM, reading digest, and
            an AI chief of staff in one
          </span>
          <h1 className="text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] text-balance">
            Stay close to the people and ideas that matter.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground leading-relaxed text-balance">
            Orbit reads your inbox and your calendar to build a quiet timeline
            of every relationship in your life. It nudges you toward the right
            next conversation, in your voice — without ever asking you to
            remember to do the work.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {userId ? (
              <Button asChild size="lg">
                <Link href="/app">
                  Open Orbit <ArrowRight />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href="/sign-up">
                    Start your orbit <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/sign-in">I already have an account</Link>
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="w-full max-w-5xl grid gap-4 md:grid-cols-3 pb-24">
          <FeatureCard
            icon={<Mail className="h-5 w-5" />}
            title="Auto-ingest"
            body="Sign in once with Google. Orbit pulls the last 30 days of email metadata and builds a contact list for you. Nothing to type."
          />
          <FeatureCard
            icon={<MessagesSquare className="h-5 w-5" />}
            title="Quiet context"
            body="Every contact has a relationship timeline — last interaction, cadence, recent threads — on a calm, glanceable page."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Coming next"
            body="AI summaries, drafted outreach in your voice, voice-memo notes, and a daily briefing of who to ping and what to read."
          />
        </section>
      </main>

      <footer className="border-t px-6 lg:px-10 py-6 text-xs text-muted-foreground flex items-center justify-between">
        <span>Orbit · MPCS 51238 · Spring 2026</span>
        <span>v1</span>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
