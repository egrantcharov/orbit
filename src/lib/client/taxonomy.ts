// Fire-and-forget taxonomy enrichment loop. Runs in the browser after a
// successful import. Loops until the server reports `pending=0` or we hit
// the safety cap. No await needed — call as `void runTaxonomyEnrichment()`.

const MAX_BATCHES = 6;

export async function runTaxonomyEnrichment(): Promise<void> {
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    try {
      const res = await fetch("/api/enrich/taxonomy", { method: "POST" });
      if (!res.ok) return;
      const j = (await res.json()) as { processed?: number };
      if ((j.processed ?? 0) === 0) return;
      // Tiny pause so we don't hammer the API back-to-back.
      await new Promise((r) => setTimeout(r, 250));
    } catch {
      return;
    }
  }
}
