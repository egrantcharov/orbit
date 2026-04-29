import { getAnthropic, SONNET } from "@/lib/anthropic/client";
import type { ContactKind } from "@/lib/types/database";

export type ClassifyTarget = {
  id: string;
  email: string;
  display_name: string | null;
  message_count: number;
  sample_subjects: string[];
};

export type ClassifyResult = {
  id: string;
  kind: ContactKind;
  reason: string;
};

const SYSTEM_PROMPT = `You classify email contacts as one of: person, newsletter, automated, noreply, spam, unknown.

Definitions:
- person: A real human individual you'd actually want to maintain a relationship with — colleagues, friends, professional contacts, classmates, mentors, family, anyone who could plausibly reply if you wrote to them. Names like "Alex Rivera", "Dr. Wong", or first.last@company-domain are usually people.
- newsletter: Subscription content sent to many recipients — Substack writers, news digests, marketing newsletters, "X via Substack", weekly bulletins, product updates from companies you follow. Even when an individual's name is in the From, if the volume + content shape is one-way broadcast, it is a newsletter.
- automated: Transactional or system mail — booking confirmations, password resets, billing receipts, alerts, build/deploy notifications, calendar invites from systems, "noreply-comments@" but actually emitting comment notifications. Not a newsletter, not a real person.
- noreply: A hard noreply / mailer-daemon / bounce / postmaster address you would never realistically reply to.
- spam: Outright junk — phishing, scams, generic cold sales spam from clearly-mass-mailed lists.
- unknown: Insufficient signal to decide. Use sparingly.

Heuristics:
- A real person almost always has a recognizable human name in the display name and a personal-looking email (their initials, name pieces, or a custom personal domain).
- Subjects that look like newsletters ("Today in X", "The Weekly Update", "5 things to know") usually mean newsletter.
- Subjects that are generic outreach ("Following up", "Quick question", same first line for many recipients) often mean spam or sales-automation.
- If a contact has only 1 message AND no display name AND a transactional-looking domain, it is almost certainly automated.

You will be given a JSON list of contacts. For each, decide the kind and write one short reason (≤ 12 words). Always classify every contact you are given. Prefer "person" when the evidence genuinely points to a human; prefer the more specific non-person kind when it doesn't.`;

const TOOL_NAME = "submit_classifications";

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    classifications: {
      type: "array" as const,
      description: "One entry per input contact, in the same order.",
      items: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const, description: "The contact id from input." },
          kind: {
            type: "string" as const,
            enum: ["person", "newsletter", "automated", "noreply", "spam", "unknown"],
          },
          reason: {
            type: "string" as const,
            description: "Short justification, ≤ 12 words.",
          },
        },
        required: ["id", "kind", "reason"],
      },
    },
  },
  required: ["classifications"],
};

export async function classifyBatch(
  contacts: ClassifyTarget[],
): Promise<ClassifyResult[]> {
  if (contacts.length === 0) return [];

  const client = getAnthropic();
  const userPayload = contacts.map((c) => ({
    id: c.id,
    email: c.email,
    display_name: c.display_name ?? null,
    message_count: c.message_count,
    sample_subjects: c.sample_subjects.slice(0, 5),
  }));

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 4096,
    // Cache the rubric so repeated batches reuse the system prefix.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description:
          "Submit classifications for the input contacts. Always call this exactly once per request.",
        input_schema: TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: `Classify these contacts:\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === TOOL_NAME) {
      const input = block.input as {
        classifications: Array<{ id: string; kind: ContactKind; reason: string }>;
      };
      return input.classifications.map((c) => ({
        id: c.id,
        kind: c.kind,
        reason: `claude: ${c.reason}`,
      }));
    }
  }
  throw new Error("No classification tool call returned");
}
