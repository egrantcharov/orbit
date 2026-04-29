import { getAnthropic, SONNET } from "@/lib/anthropic/client";

export type DigestItem = {
  from: string;
  subject: string;
  snippet: string | null;
  date: string;
};

const SYSTEM = `You write concise weekly digests of newsletter email.

Input: a list of newsletter messages (sender, subject, snippet, date) from the last 7 days.

Output: a single Markdown digest.
- Open with one sentence framing the week ("This week's newsletters covered…").
- Group items into 2-4 topical clusters using ## headers (e.g. "## AI infrastructure", "## Frontend tooling").
- Under each header, write 2-4 bullet points. Each bullet starts with the takeaway in plain English, then a parenthetical citing source(s) in italics.
- Be specific. Reference real ideas from the snippets, not generic blurbs.
- ≤ 250 words total. No fluff.`;

export async function weeklyDigest(items: DigestItem[]): Promise<string> {
  if (items.length === 0) {
    return "_No newsletter activity in the past 7 days. Try again next week._";
  }
  const client = getAnthropic();

  const userText = items
    .slice(0, 80)
    .map(
      (it, i) =>
        `${i + 1}. From: ${it.from}\n   Date: ${it.date.slice(0, 10)}\n   Subject: ${it.subject}\n   Snippet: ${(it.snippet ?? "").slice(0, 240)}`,
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 1500,
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
        content: `Write the weekly digest for these newsletter items:\n\n${userText}`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") return block.text.trim();
  }
  return "";
}
