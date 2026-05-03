import { getAnthropic, SONNET } from "@/lib/anthropic/client";
import type { SelfProfile, ScoresRationale } from "@/lib/types/database";

export type ScoreInput = {
  contact: {
    displayName: string | null;
    email: string | null;
    company: string | null;
    jobTitle: string | null;
    industry: string | null;
    location: string | null;
    messageCount: number;
    userSentCount: number;
    userRepliedCount: number;
    lastInteractionAt: string | null;
    aiSummary: string | null;
    tags: string[];
  };
  threads: Array<{
    subject: string | null;
    bodyExcerpt: string | null;
    lastMessageAt: string | null;
  }>;
  self: SelfProfile;
};

export type ScoreOutput = {
  closeness: number;
  keep_in_touch: number;
  industry_overlap: number;
  age_proximity: number;
  career_relevance: number;
  rationale: ScoresRationale;
};

const SYSTEM = `You score the relationship between the user ("you") and a contact across five dimensions, each on a 0..1 scale. Output strict JSON.

Dimensions:
- closeness: actual current intimacy of the relationship. High when there's two-way email volume + replies; low when it's been one-way or stale for months.
- keep_in_touch: how much effort the user should put into maintaining this contact. Weighted by closeness, career relevance, and how easy it is to lose them. A close family member is high; a distant former colleague who's now a stranger is low; a high-leverage warm-but-quiet contact (mentor, ex-boss, founder) is also high — these are people worth nudging.
- industry_overlap: similarity of professional context. Use the user's industry/role and the contact's company/title/industry. 1.0 = same industry and adjacent function. 0 = totally different domains. If either side is unknown, use the AI summary or recent thread topics; if still unknown, return 0.5 (neutral).
- age_proximity: estimate the contact's age bracket from email signals + LinkedIn metadata (company tenure, title seniority, language) and compare to the user's age bracket. 1.0 = same decade. 0 = >20 years apart. If the user hasn't filled in their age bracket, return 0.5.
- career_relevance: how useful this contact is for the user's professional trajectory. High for industry leaders, hiring managers, mentors, investors, and peers in the user's field. Low for pure personal/social contacts, family, or fully unrelated industries.

Calibration:
- 0.0..0.2 = clearly absent / very low
- 0.3..0.4 = below average
- 0.5 = unknown / neutral
- 0.6..0.7 = above average
- 0.8..1.0 = strong / unambiguous

Each rationale string is ONE concise sentence (≤ 20 words) explaining the score, citing concrete evidence (a thread topic, a job title, a cadence). Do not invent data.

Return ONLY JSON matching this exact shape:
{"closeness":0.0,"keep_in_touch":0.0,"industry_overlap":0.0,"age_proximity":0.0,"career_relevance":0.0,"rationale":{"closeness":"…","keep_in_touch":"…","industry_overlap":"…","age_proximity":"…","career_relevance":"…"}}`;

function clamp01(n: unknown): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 100) / 100;
}

function asString(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function scoreRelationship(input: ScoreInput): Promise<ScoreOutput> {
  const client = getAnthropic();
  const c = input.contact;
  const lastSeen = c.lastInteractionAt
    ? new Date(c.lastInteractionAt).toISOString().slice(0, 10)
    : "unknown";

  const threadLines = input.threads
    .slice(0, 5)
    .map((t, i) => {
      const date = t.lastMessageAt ? t.lastMessageAt.slice(0, 10) : "—";
      const subject = t.subject ?? "(no subject)";
      const body = t.bodyExcerpt ? t.bodyExcerpt.slice(0, 400) : "";
      return `${i + 1}. [${date}] ${subject}\n   ${body}`;
    })
    .join("\n");

  const selfBlock = [
    `Industry: ${input.self.industry ?? "(unset)"}`,
    `Role: ${input.self.role ?? "(unset)"}`,
    `Age bracket: ${input.self.age_bracket ?? "(unset)"}`,
    `Location: ${input.self.location ?? "(unset)"}`,
  ].join("\n");

  const contactBlock = [
    `Name: ${c.displayName ?? "(unknown)"}`,
    c.email ? `Email: ${c.email}` : null,
    c.company ? `Company: ${c.company}` : null,
    c.jobTitle ? `Title: ${c.jobTitle}` : null,
    c.industry ? `Industry: ${c.industry}` : null,
    c.location ? `Location: ${c.location}` : null,
    c.tags.length > 0 ? `Tags: ${c.tags.join(", ")}` : null,
    `Message count (30d): ${c.messageCount}`,
    `User → contact (sent): ${c.userSentCount}`,
    `User → contact (replied): ${c.userRepliedCount}`,
    `Last interaction: ${lastSeen}`,
    c.aiSummary ? `Existing AI summary: ${c.aiSummary}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userText = `# YOU
${selfBlock}

# CONTACT
${contactBlock}

# RECENT THREADS
${threadLines || "(none)"}

Score now.`;

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
    messages: [{ role: "user", content: userText }],
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
    }
  }

  // Extract first {…} JSON object from the response. The system prompt
  // demands strict JSON but we defend against stray prose just in case.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("model did not return JSON");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    throw new Error("model JSON did not parse");
  }

  const rat = (parsed.rationale ?? {}) as Record<string, unknown>;

  return {
    closeness: clamp01(parsed.closeness),
    keep_in_touch: clamp01(parsed.keep_in_touch),
    industry_overlap: clamp01(parsed.industry_overlap),
    age_proximity: clamp01(parsed.age_proximity),
    career_relevance: clamp01(parsed.career_relevance),
    rationale: {
      closeness: asString(rat.closeness),
      keep_in_touch: asString(rat.keep_in_touch),
      industry_overlap: asString(rat.industry_overlap),
      age_proximity: asString(rat.age_proximity),
      career_relevance: asString(rat.career_relevance),
    },
  };
}
