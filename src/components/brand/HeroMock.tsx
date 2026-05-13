/**
 * Inline product mock for the landing-page hero. Hand-rolled SVG so the
 * marketing site has no asset pipeline and the mock stays in sync with
 * brand colors via Tailwind / CSS variables.
 *
 * Intentionally NOT pixel-perfect to the real UI — this is the calm
 * "what you're getting" shape, not a literal screenshot.
 */
export function HeroMock() {
  return (
    <div className="relative w-full">
      <div className="absolute -inset-8 -z-10 bg-gradient-to-br from-violet-200/40 via-transparent to-amber-200/40 dark:from-violet-900/20 dark:to-amber-900/10 rounded-3xl blur-2xl" />
      <div className="rounded-2xl border bg-card shadow-xl overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b bg-muted/30">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 text-[10px] text-muted-foreground tracking-tight font-mono">
            orbit · contact
          </span>
        </div>

        <div className="grid gap-4 p-5 md:p-6">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-semibold">
              SK
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-32 rounded bg-foreground/90" />
                <div className="h-3.5 w-12 rounded bg-amber-200 dark:bg-amber-900/60" />
              </div>
              <div className="mt-1.5 h-2.5 w-44 rounded bg-muted-foreground/30" />
              <div className="mt-2 h-2.5 w-56 rounded bg-muted-foreground/20" />
            </div>
            <div className="flex gap-1.5">
              <div className="h-7 w-16 rounded-md bg-foreground/10" />
              <div className="h-7 w-20 rounded-md bg-rose-500 flex items-center justify-center gap-1.5">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />
                </svg>
                <span className="text-[10px] font-semibold text-white">REC</span>
              </div>
            </div>
          </div>

          {/* AI summary card */}
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <div className="h-2.5 w-24 rounded bg-foreground/70" />
            </div>
            <div className="space-y-1.5">
              <div className="h-2 rounded bg-foreground/40" />
              <div className="h-2 w-[92%] rounded bg-foreground/40" />
              <div className="h-2 w-[78%] rounded bg-foreground/40" />
            </div>
          </div>

          {/* Voice memo card */}
          <div className="rounded-lg border bg-amber-50/40 dark:bg-amber-950/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-5 w-5 rounded-md bg-amber-200 dark:bg-amber-900/60 flex items-center justify-center">
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-amber-700 dark:text-amber-300"
                  aria-hidden
                >
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />
                </svg>
              </div>
              <div className="h-2.5 w-36 rounded bg-foreground/70" />
              <div className="h-2.5 w-10 rounded bg-amber-200 dark:bg-amber-900/60 ml-auto" />
            </div>
            <div className="space-y-1.5">
              <div className="h-2 rounded bg-foreground/40" />
              <div className="h-2 w-[86%] rounded bg-foreground/40" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="text-foreground/60 text-[10px]">→</div>
              <div className="h-1.5 w-40 rounded bg-foreground/30" />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-foreground/60 text-[10px]">→</div>
              <div className="h-1.5 w-28 rounded bg-foreground/30" />
            </div>
            {/* Audio bar */}
            <div className="mt-3 h-7 rounded-md bg-foreground/5 border flex items-center px-2 gap-1">
              <div className="h-3 w-3 rounded-full bg-foreground/70" />
              <div className="flex-1 h-1 rounded bg-foreground/15">
                <div className="h-1 w-1/3 rounded bg-foreground/60" />
              </div>
              <span className="text-[9px] font-mono text-muted-foreground">1:24</span>
            </div>
          </div>

          {/* History list */}
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <div className="h-5 px-2 rounded-full bg-foreground text-background flex items-center text-[9px]">
                All
              </div>
              <div className="h-5 px-2 rounded-full bg-muted text-muted-foreground flex items-center text-[9px]">
                Email
              </div>
              <div className="h-5 px-2 rounded-full bg-muted text-muted-foreground flex items-center text-[9px]">
                Calls
              </div>
              <div className="h-5 px-2 rounded-full bg-muted text-muted-foreground flex items-center text-[9px]">
                Voice
              </div>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <div className="h-5 w-5 rounded bg-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-2.5 w-48 rounded bg-foreground/60" />
                  <div className="h-2 w-[80%] mt-1.5 rounded bg-foreground/25" />
                </div>
                <div className="h-2 w-10 rounded bg-muted-foreground/30 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
