import { getAnthropic, SONNET } from "@/lib/anthropic/client";

export type SummaryInput = {
  displayName: string | null;
  email: string;
  messageCount: number;
  lastInteractionAt: string | null;
  threads: Array<{
    subject: string | null;
    snippet: string | null;
    last_message_at: string | null;
    role: "from" | "to" | "cc" | null;
  }>;
};

const SYSTEM = `You write 2-3 sentence relationship summaries between the user ("you") and a contact, in second person.

Rules:
- Open with how the user knows or interacts with this person, based on email subjects and cadence.
- Mention 1-2 recent topics by name when there is real signal, otherwise generalize honestly.
- Mention the rough cadence ("you and X email weekly", "you've exchanged a couple of threads in the last month").
- Stay specific. Do not invent topics that aren't in the threads. If the threads are sparse, say so plainly.
- No bullet points, no headers, no quotes. Plain prose, ≤ 80 words.`;

export async function summarizeRelationship(input: SummaryInput): Promise<string> {
  const client = getAnthropic();
  const name = input.displayName ?? input.email.split("@")[0];
  const lastSeen = input.lastInteractionAt
    ? new Date(input.lastInteractionAt).toISOString().slice(0, 10)
    : "unknown";

  const threadLines = input.threads
    .slice(0, 20)
    .map((t, i) => {
      const role = t.role === "from" ? "they wrote" : t.role === "to" ? "you wrote" : "cc";
      const date = t.last_message_at ? t.last_message_at.slice(0, 10) : "—";
      const subject = t.subject ?? "(no subject)";
      const snippet = t.snippet ? t.snippet.slice(0, 200) : "";
      return `${i + 1}. [${date}, ${role}] ${subject}\n   ${snippet}`;
    })
    .join("\n");

  const userText = `Contact: ${name} <${input.email}>
Total messages with this contact (last 30 days): ${input.messageCount}
Last interaction: ${lastSeen}

Recent threads:
${threadLines || "(none)"}

Write the summary now.`;

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
  });

  for (const block of response.content) {
    if (block.type === "text") return block.text.trim();
  }
  return "";
}
