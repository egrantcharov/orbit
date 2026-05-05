import { getAnthropic, SONNET } from "@/lib/anthropic/client";

export type MeetingBriefInput = {
  eventSummary: string;
  startISO: string;
  durationMin: number | null;
  description: string | null;
  attendees: Array<{
    displayName: string | null;
    email: string;
    company: string | null;
    jobTitle: string | null;
    industry: string | null;
    aiSummary: string | null;
    interests: string | null;
    notes: string | null;
    metAt: string | null;
    metVia: string | null;
    recentThreads: Array<{
      subject: string | null;
      excerpt: string | null;
      lastMessageAt: string | null;
    }>;
    recentInteractions: Array<{
      kind: string;
      title: string | null;
      body: string | null;
      occurredAt: string;
    }>;
  }>;
};

export type MeetingBriefOutput = {
  brief: string;
  talkingPoints: string[];
};

const SYSTEM = `You write 90-second meeting prep cards. The user is about to walk into a meeting; they want a quick refresher and 2-3 specific talking points they can lead with.

Output strict JSON: {"brief": "<markdown>", "talkingPoints": ["...", "..."]}.

Rules for the brief:
- Plain markdown, ≤ 120 words.
- Lead with how the user knows this person (one sentence, draw from threads / interactions / metadata).
- Then 2-3 sentences of context: what they've been working on, what's recent, what they care about.
- If recent threads or interactions reveal a pending question or open thread, call it out.
- No headers. No "Hello,". No fluff.

Rules for talkingPoints:
- 2-4 short suggestions, each ≤ 15 words. Examples: "Ask how the Series B closing is going", "Follow up on the design system migration she mentioned in March".
- Specific. Tie to actual data when present.
- Skip if there's truly nothing to say (return []).

Never invent facts. If data is sparse, say so honestly in the brief.`;

function asString(v: unknown, max = 4000): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function asStringArray(v: unknown, maxItems = 4): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 200))
    .slice(0, maxItems);
}

export async function generateMeetingBrief(
  input: MeetingBriefInput,
): Promise<MeetingBriefOutput> {
  const client = getAnthropic();

  const attendeeBlocks = input.attendees
    .slice(0, 5)
    .map((a, i) => {
      const meta = [
        a.displayName ?? a.email,
        a.jobTitle && a.company
          ? `${a.jobTitle} at ${a.company}`
          : a.jobTitle ?? a.company,
        a.industry ? `(${a.industry})` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const summary = a.aiSummary ? `Summary: ${a.aiSummary}` : null;
      const personal = [
        a.metAt ? `Met at: ${a.metAt}` : null,
        a.metVia ? `Met via: ${a.metVia}` : null,
        a.interests ? `Interests: ${a.interests}` : null,
        a.notes ? `Notes: ${a.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n  ");
      const threads = a.recentThreads
        .slice(0, 3)
        .map((t) => {
          const date = t.lastMessageAt ? t.lastMessageAt.slice(0, 10) : "—";
          return `  - [${date}] ${t.subject ?? "(no subject)"}: ${(
            t.excerpt ?? ""
          ).slice(0, 200)}`;
        })
        .join("\n");
      const interactions = a.recentInteractions
        .slice(0, 5)
        .map((it) => {
          const date = it.occurredAt.slice(0, 10);
          const kind = it.kind.replace(/_/g, " ");
          return `  - [${date}, ${kind}] ${it.title ?? ""}${
            it.body ? `: ${it.body.slice(0, 200)}` : ""
          }`;
        })
        .join("\n");
      return [
        `Attendee ${i + 1}: ${meta}`,
        summary,
        personal || null,
        threads ? `Recent threads:\n${threads}` : null,
        interactions ? `Recent activity:\n${interactions}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const userText = `Meeting: ${input.eventSummary}
When: ${input.startISO}${input.durationMin ? ` · ${input.durationMin} min` : ""}
${input.description ? `Description: ${input.description.slice(0, 500)}` : ""}

${attendeeBlocks || "(no attendees in user's contact list)"}

Write the prep card now.`;

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
    brief: asString(parsed.brief, 4000),
    talkingPoints: asStringArray(parsed.talkingPoints, 4),
  };
}
