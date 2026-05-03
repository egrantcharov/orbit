import { getAnthropic, SONNET } from "@/lib/anthropic/client";

export type DraftInput = {
  fromName: string | null;
  fromEmail: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
  contactTitle: string | null;
  contactSummary: string | null;
  recentThreads: Array<{
    subject: string | null;
    excerpt: string | null;
    last_message_at: string | null;
  }>;
  intent: string | null;
};

export type DraftOutput = {
  subject: string;
  body: string;
};

const SYSTEM = `You draft short, warm, in-character emails on behalf of the user. Match the tone of the user's past replies as inferred from the recent threads — direct but human, no marketing language, no exclamation marks unless the user uses them.

Constraints:
- 2-4 short paragraphs. No more than ~120 words.
- End with the user's first name only on its own line. If the user's name is unknown, sign with a placeholder em-dash.
- Subject is concise (≤ 8 words), specific, lowercase or sentence case (match the surrounding thread style).
- Don't fabricate facts. If you reference a recent topic, cite it from the thread excerpts. If excerpts are empty, keep it generic.
- No "Hope this finds you well" or other corporate filler.

Output strict JSON: {"subject":"…","body":"…"}. No surrounding prose.`;

function asString(v: unknown, max = 4000): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function draftEmail(input: DraftInput): Promise<DraftOutput> {
  const client = getAnthropic();
  const fromFirst = (input.fromName ?? "").split(" ")[0] || "—";

  const threadLines = input.recentThreads
    .slice(0, 3)
    .map((t, i) => {
      const date = t.last_message_at ? t.last_message_at.slice(0, 10) : "—";
      return `${i + 1}. [${date}] ${t.subject ?? "(no subject)"}\n   ${(t.excerpt ?? "").slice(0, 600)}`;
    })
    .join("\n\n");

  const userText = `# YOU
Name: ${input.fromName ?? "(unknown)"}
First name to sign with: ${fromFirst}
Email: ${input.fromEmail ?? "(unknown)"}

# CONTACT
Name: ${input.contactName ?? "(unknown)"}
Email: ${input.contactEmail ?? "(unknown)"}
Company: ${input.contactCompany ?? "(unknown)"}
Title: ${input.contactTitle ?? "(unknown)"}
Relationship summary: ${input.contactSummary ?? "(none)"}

# RECENT THREADS WITH THIS CONTACT
${threadLines || "(none)"}

# INTENT
${input.intent ?? "(unspecified — write a short, friendly check-in)"}`;

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
    subject: asString(parsed.subject, 200) || "Quick note",
    body: asString(parsed.body, 4000) || "—",
  };
}
