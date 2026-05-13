import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowRight,
  Sparkles,
  Sunrise,
  Mic,
  Command,
  Wand2,
  Newspaper,
  Network,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { HeroMock } from "@/components/brand/HeroMock";
import { APP_VERSION } from "@/lib/version";

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
        <section className="w-full max-w-3xl pt-16 pb-10 lg:pt-28 lg:pb-14 flex flex-col items-center text-center gap-8">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Personal CRM · reading digest · AI chief-of-staff
          </span>
          <h1 className="text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] text-balance">
            Stay close to the people and ideas that matter.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground leading-relaxed text-balance">
            Orbit auto-ingests Gmail and your calendar, augments it with your
            LinkedIn export, then composes real tools — daily nudges, meeting
            prep, voice memos, cross-source synthesis — into one calm surface.
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

        <section className="w-full max-w-4xl pb-16 lg:pb-24">
          <HeroMock />
        </section>

        <section className="w-full max-w-5xl pb-6">
          <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-px w-8 bg-border" />
            shipped in v3
            <span className="h-px w-8 bg-border" />
          </div>
        </section>

        <section className="w-full max-w-5xl grid gap-4 md:grid-cols-3 pb-10">
          <FeatureCard
            icon={<Sunrise className="h-5 w-5" />}
            title="Today section"
            body="A daily list of nudges — drifting contacts, upcoming meeting briefs, birthdays, scheduled follow-ups. Composed from your real signal, not a checklist."
          />
          <FeatureCard
            icon={<Command className="h-5 w-5" />}
            title="⌘K Quick Capture"
            body="One keystroke from anywhere to log a coffee chat, a phone call, an iMessage thread, or a voice memo against the right contact."
          />
          <FeatureCard
            icon={<Mic className="h-5 w-5" />}
            title="Voice memos on every contact"
            body="Hit record, talk for two minutes after the call, get it transcribed by Claude and stitched into the relationship timeline with the audio attached."
          />
          <FeatureCard
            icon={<Wand2 className="h-5 w-5" />}
            title="Auto-enrich"
            body="Drop a CSV, fire-and-forget. Claude infers taxonomy 30 contacts at a time with prompt caching so the first scroll is already enriched."
          />
          <FeatureCard
            icon={<Newspaper className="h-5 w-5" />}
            title="Synth"
            body="Two-pass cross-source synthesis — newsletters and RSS feeds clustered into themes, citations preserved. Reading 200 emails as five paragraphs."
          />
          <FeatureCard
            icon={<Network className="h-5 w-5" />}
            title="Network view"
            body="Industry → company → person pivot across your network. See who you know in fintech, at OpenAI, on the platform team."
          />
          <FeatureCard
            icon={<ListChecks className="h-5 w-5" />}
            title="Smart lists"
            body="Saved filters that survive: 'NY designers I haven't talked to in 90 days', 'people at portfolio companies', staged pipelines."
          />
          <FeatureCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Audited"
            body="Service-role-only DB access, AES-256-GCM at rest for OAuth refresh tokens, RLS on every table, no client-side secrets. See SECURITY.md."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Meeting briefs"
            body="Open any upcoming calendar event and get a one-pager — last conversation, recent threads, talking points — generated on demand."
          />
        </section>
      </main>

      <footer className="border-t px-6 lg:px-10 py-6 text-xs text-muted-foreground flex items-center justify-between">
        <span>Orbit · MPCS 51238 · Spring 2026</span>
        <span>{APP_VERSION}</span>
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
