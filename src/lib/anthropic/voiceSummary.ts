/**
 * Voice memo post-processor. The raw browser transcript is messy (no
 * punctuation, drops words, no paragraphs); Claude turns it into a clean
 * one-line title, a 2–3 sentence summary, and a short list of follow-ups
 * we surface as action items on the contact page.
 *
 * Uses prompt caching on the rubric block. Same Sonnet 4.6 + tight token
 * cap pattern as the relationship summary.
 */

import { getAnthropic, SONNET } from "@/lib/anthropic/client";

const SYSTEM = `You convert a raw voice-memo transcript into structured notes about a conversation between the user ("you") and a contact.

Output STRICT JSON matching this TypeScript type:
{
  "title": string,            // 4-8 word headline of what the conversation was about
  "summary": string,          // 2-3 sentences, second person ("you discussed…"), grounded in the transcript
  "actionItems": string[]     // 0-4 short, concrete follow-ups for the user. Each ≤ 12 words. Omit when the transcript doesn't imply any.
}

Rules:
- Stay grounded in the transcript. If something isn't said, don't invent it.
- Speech-to-text errors are common. Light-touch correct obvious garbles; don't rewrite content.
- Action items must be imperative ("Send Sarah the deck", "Follow up Friday").
- No markdown, no surrounding prose, no code fences. Output JSON only.`;

export type VoiceSummary = {
  title: string;
  summary: string;
  actionItems: string[];
};

export async function summarizeVoiceMemo(
  transcript: string,
  contactName: string | null,
): Promise<VoiceSummary | null> {
  const trimmed = transcript.trim();
  if (!trimmed) return null;

  const client = getAnthropic();
  const name = contactName?.trim() || "the contact";

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 600,
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Contact: ${name}

Raw transcript (browser speech-to-text, may have errors):
"""
${trimmed.slice(0, 20_000)}
"""

Return the JSON now.`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type !== "text") continue;
    const text = block.text.trim();
    // Strip ```json fences just in case the model ignores instructions.
    const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
    try {
      const parsed = JSON.parse(json) as Partial<VoiceSummary>;
      const title =
        typeof parsed.title === "string" ? parsed.title.slice(0, 200) : "";
      const summary =
        typeof parsed.summary === "string"
          ? parsed.summary.slice(0, 2_000)
          : "";
      const actionItems = Array.isArray(parsed.actionItems)
        ? parsed.actionItems
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter(Boolean)
            .slice(0, 6)
            .map((v) => v.slice(0, 240))
        : [];
      if (!title && !summary) return null;
      return { title, summary, actionItems };
    } catch {
      return null;
    }
  }
  return null;
}
