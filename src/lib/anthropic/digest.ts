import { getAnthropic, SONNET } from "@/lib/anthropic/client";

export type DigestItem = {
  from: string;
  subject: string;
  body: string | null;
  date: string;
};

const SYSTEM = `You write a weekly digest of newsletter and bulk-email activity for one user.

Input: a numbered list of newsletter messages from the past 7 days. Each item has the sender, date, subject, and body excerpt (the first ~2 KB of the message body, decoded from HTML where needed).

Output: a single Markdown document.
- Open with one short sentence framing the week ("Five themes ran through your inbox this week:" — be specific).
- Group items into 3-5 topical clusters using ## headers (e.g. "## AI infrastructure", "## Frontend tooling", "## Markets"). Cluster by *content*, not by sender.
- Under each header, write 3-5 bullet points. Each bullet states a CONCRETE idea, news item, or insight from the body excerpt — not "X published a newsletter." End each bullet with a citation in italics: \`— *Sender Name*\`.
- If a body excerpt is pure marketing fluff (CTAs, coupons, "shop now"), skip it. Don't fabricate.
- ≤ 350 words total. No fluff.
- Never respond with "I cannot summarize" or apologies. If the inputs are mostly thin, just ship a shorter digest of whatever signal exists.`;

const ONE_SHOT_USER = `Write the weekly digest for these newsletter items:

1. From: Stratechery
   Date: 2026-04-29
   Subject: AI's Real Cost
   Body: The framing of "AI is expensive" misses the point: hyperscalers are paying a one-time training cost to extract recurring inference revenue. Anthropic's $50B run-rate hint at Q1 implies a higher gross margin than most people expect. The real moat is the data center build-out — Microsoft and Meta have committed $200B between them in 2026.

2. From: The Pragmatic Engineer
   Date: 2026-04-30
   Subject: Why Tech Layoffs Are Different This Time
   Body: Three structural shifts: (1) AI-driven productivity letting smaller teams ship more, (2) post-ZIRP hiring discipline that doesn't reverse on a rate cut, (3) staff engineers becoming "force-multiplier roles" instead of headcount-padding. Junior hiring is down 40% YoY across FAANG.`;

const ONE_SHOT_ASSISTANT = `Two themes ran through your inbox this week:

## AI economics
- Hyperscalers are paying one-time training costs to extract recurring inference revenue, with Anthropic's hinted $50B Q1 run-rate implying a higher gross margin than skeptics expect. — *Stratechery*
- The real moat is data-center build-out: Microsoft and Meta together have committed $200B in 2026 capex. — *Stratechery*

## Tech labor market
- Three structural forces are reshaping hiring: AI productivity, post-ZIRP discipline, and staff engineers as force multipliers rather than headcount fillers. — *The Pragmatic Engineer*
- Junior hiring is down 40% YoY across FAANG and isn't expected to recover on a rate cut alone. — *The Pragmatic Engineer*`;

export async function weeklyDigest(items: DigestItem[]): Promise<string> {
  if (items.length === 0) {
    return "_No newsletter activity in the past 7 days. Try again next week._";
  }
  const client = getAnthropic();

  const userText = items
    .slice(0, 60)
    .map(
      (it, i) =>
        `${i + 1}. From: ${it.from}\n   Date: ${it.date.slice(0, 10)}\n   Subject: ${it.subject}\n   Body: ${(it.body ?? "").slice(0, 2000)}`,
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      { role: "user", content: ONE_SHOT_USER },
      { role: "assistant", content: ONE_SHOT_ASSISTANT },
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
