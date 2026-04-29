"use client";

import { useState } from "react";
import { Sparkles, Loader2, Send, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "Who haven't I talked to in over a month?",
  "Who do I email most at uchicago.edu?",
  "Which pinned contacts have I been quiet with?",
];

export function AskOrbit() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!question.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ask failed (${res.status})`);
      setAnswer(data.answer || "(no answer)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold tracking-tight">Ask Orbit</h2>
        <span className="text-[11px] text-muted-foreground">
          natural-language search across your network
        </span>
      </div>
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Who haven't I emailed in 6 weeks at @stripe.com?"
          className="flex-1 h-10 rounded-full bg-background"
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !question.trim()}>
          {isLoading ? <Loader2 className="animate-spin" /> : <Send />}
          Ask
        </Button>
      </form>
      {!answer && !isLoading && !error && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuestion(s)}
              className="rounded-full border bg-background px-3 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {(answer || error) && (
        <div className="rounded-lg border bg-background p-4 flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Answer
            </span>
            <button
              type="button"
              onClick={() => {
                setAnswer(null);
                setError(null);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear answer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</p>
          )}
        </div>
      )}
    </Card>
  );
}
