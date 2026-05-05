import { getAnthropic, SONNET } from "@/lib/anthropic/client";

export type TldrInput = {
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  publication: string;
  content: string;
};

export type TldrOutput = {
  tldr: string;
  takeaways: string[];
};

const SYSTEM = `You write tight TL;DRs of articles, newsletters, and essays.

Output strict JSON: {"tldr": "<2-3 sentences>", "takeaways": ["...", "...", "..."]}.

Rules:
- TLDR is 2-3 sentences, ≤ 60 words. Captures the core argument or news, not the writing style. Plain prose, no headers, no quotes.
- Takeaways: 3-5 specific, concrete bullets. Each ≤ 18 words. Pull real numbers, claims, and named entities from the text. Skip filler.
- Never invent. If the article is mostly fluff, say so honestly in the TLDR and return [] for takeaways.`;

function asString(v: unknown, max = 4000): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function asStringArray(v: unknown, max = 5): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 220))
    .slice(0, max);
}

export async function generateTldr(input: TldrInput): Promise<TldrOutput> {
  const client = getAnthropic();
  const dateLine = input.publishedAt
    ? `Published: ${input.publishedAt.slice(0, 10)}`
    : "";
  const userText = `Publication: ${input.publication}
Title: ${input.title ?? "(untitled)"}
${input.author ? `Author: ${input.author}` : ""}
${dateLine}

Body:
${input.content.slice(0, 14_000)}

Write the TL;DR now.`;

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 700,
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("model did not return JSON");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  return {
    tldr: asString(parsed.tldr, 1200),
    takeaways: asStringArray(parsed.takeaways, 5),
  };
}
