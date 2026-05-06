import { getAnthropic, SONNET } from "@/lib/anthropic/client";
import type { SynthCard } from "@/lib/types/database";

// Two synthesis passes. Both consume the same item shape — articles
// (RSS) and bulk-newsletter Gmail threads tagged with their source — and
// emit JSON for the UI to render.

export type SynthSourceItem = {
  kind: "article" | "newsletter_thread";
  from: string; // sender / publication
  title: string;
  body: string | null;
  date: string; // ISO
  sourceId?: string;
  sourceUrl?: string;
};

export type SynthDailyOutput = {
  cards: SynthCard[];
};

export type SynthWeeklyOutput = {
  clusters: Array<{
    title: string;
    takeaways: SynthCard[];
  }>;
};

const DAILY_SYSTEM = `You produce a "Daily Punch" — a tight 3 to 5 bullet briefing of what mattered across the user's reading sources today.

Input: a numbered list of items, each tagged with its source (article = RSS subscription; newsletter_thread = bulk email with List-Unsubscribe). For each: sender / publication, date, title, body excerpt.

Output strict JSON:
{
  "cards": [
    { "takeaway": "<concrete claim, news, or insight>", "citation": "<sender>", "source_id": "<id if provided>", "source_url": "<url if provided>" },
    ...
  ]
}

Rules:
- 3 to 5 cards total. Concrete bullets — real numbers, named entities, specific claims. No "X published a piece about Y."
- Each takeaway ≤ 25 words.
- Pull from real body content. Don't invent.
- If items are mostly fluff or there are < 3 substantial items, return {"cards": []}. The page will show a graceful empty state — don't fabricate filler.
- citation = sender / publication, no quote marks.
- source_id + source_url are optional pass-throughs for the UI to link back.`;

const WEEKLY_SYSTEM = `You produce a "Weekly Synth" — a topic-clustered summary of the user's reading from the past week.

Input: a numbered list of items, each tagged with source (article or newsletter_thread). For each: sender / publication, date, title, body excerpt.

Output strict JSON:
{
  "clusters": [
    {
      "title": "<3-5 word cluster title>",
      "takeaways": [
        { "takeaway": "<bullet>", "citation": "<sender>", "source_id": "...", "source_url": "..." },
        ...
      ]
    },
    ...
  ]
}

Rules:
- 3 to 5 clusters. Cluster by topic, not by sender — articles from different publications about the same theme go together.
- Each cluster has 3-5 takeaways. Each takeaway ≤ 25 words, concrete.
- If a cluster only has 1-2 items, merge it into another cluster or drop it.
- If you can't find 3 distinct clusters, return fewer. Don't pad.
- Skip pure marketing / "shop now" / coupon body excerpts.
- Never respond with apologies. If signal is thin, return {"clusters": []}.`;

const ONE_SHOT_USER = `1. [article] From: Stratechery
   Date: 2026-04-29
   Title: AI's Real Cost
   Body: The framing of "AI is expensive" misses the point: hyperscalers pay a one-time training cost to extract recurring inference revenue. Anthropic's $50B run-rate hint at Q1 implies a higher gross margin than most people expect. The real moat is the data center build-out — Microsoft and Meta have committed $200B between them in 2026.

2. [article] From: The Pragmatic Engineer
   Date: 2026-04-30
   Title: Why Tech Layoffs Are Different This Time
   Body: Three structural shifts: AI-driven productivity letting smaller teams ship more, post-ZIRP hiring discipline that doesn't reverse on a rate cut, staff engineers becoming "force-multiplier roles". Junior hiring is down 40% YoY across FAANG.`;

const ONE_SHOT_DAILY_ASSISTANT = `{"cards":[
{"takeaway":"Anthropic's hinted $50B Q1 run-rate implies higher AI gross margins than skeptics expect; training is one-time, inference compounds.","citation":"Stratechery"},
{"takeaway":"Microsoft and Meta have committed $200B in 2026 data-center capex — the real AI moat is build-out, not models.","citation":"Stratechery"},
{"takeaway":"Junior hiring is down 40% YoY across FAANG; this isn't a rate-cut cycle, it's structural shift to force-multiplier staff engineers.","citation":"The Pragmatic Engineer"}
]}`;

const ONE_SHOT_WEEKLY_ASSISTANT = `{"clusters":[
{"title":"AI economics","takeaways":[
{"takeaway":"Hyperscalers pay one-time training costs to extract recurring inference revenue; Anthropic's $50B run-rate hint suggests strong gross margins.","citation":"Stratechery"},
{"takeaway":"$200B 2026 capex committed by Microsoft and Meta — data centers are the moat.","citation":"Stratechery"}
]},
{"title":"Tech labor market","takeaways":[
{"takeaway":"Three structural shifts behind tech hiring slowdown: AI productivity, post-ZIRP discipline, force-multiplier staff engineers.","citation":"The Pragmatic Engineer"},
{"takeaway":"Junior hiring down 40% YoY at FAANG — not expected to reverse on a rate cut.","citation":"The Pragmatic Engineer"}
]}
]}`;

function asString(v: unknown, max = 800): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function buildItemBlock(items: SynthSourceItem[]): string {
  return items
    .slice(0, 80)
    .map((it, i) => {
      const date = it.date.slice(0, 10);
      const body = (it.body ?? "").slice(0, 1500);
      return `${i + 1}. [${it.kind}] From: ${it.from}\n   Date: ${date}\n   Title: ${it.title}\n   Body: ${body}`;
    })
    .join("\n\n");
}

function normalizeCards(raw: unknown): SynthCard[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      takeaway: asString(c.takeaway, 320),
      citation: asString(c.citation, 200) || "(unknown)",
      source_id: typeof c.source_id === "string" ? c.source_id : undefined,
      source_url: typeof c.source_url === "string" ? c.source_url : undefined,
    }))
    .filter((c) => c.takeaway.length > 0);
}

function tryJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function synthDaily(
  items: SynthSourceItem[],
): Promise<SynthDailyOutput> {
  if (items.length < 3) return { cards: [] };
  const client = getAnthropic();
  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 1200,
    system: [
      {
        type: "text",
        text: DAILY_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      { role: "user", content: ONE_SHOT_USER },
      { role: "assistant", content: ONE_SHOT_DAILY_ASSISTANT },
      { role: "user", content: buildItemBlock(items) },
    ],
  });
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  const parsed = tryJson(text);
  if (!parsed) return { cards: [] };
  return { cards: normalizeCards(parsed.cards) };
}

export async function synthWeekly(
  items: SynthSourceItem[],
): Promise<SynthWeeklyOutput> {
  if (items.length < 3) return { clusters: [] };
  const client = getAnthropic();
  const response = await client.messages.create({
    model: SONNET,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: WEEKLY_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      { role: "user", content: ONE_SHOT_USER },
      { role: "assistant", content: ONE_SHOT_WEEKLY_ASSISTANT },
      { role: "user", content: buildItemBlock(items) },
    ],
  });
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  const parsed = tryJson(text);
  if (!parsed) return { clusters: [] };
  const clustersRaw = Array.isArray(parsed.clusters) ? parsed.clusters : [];
  return {
    clusters: clustersRaw
      .filter(
        (c): c is Record<string, unknown> => !!c && typeof c === "object",
      )
      .map((c) => ({
        title: asString(c.title, 80) || "Topic",
        takeaways: normalizeCards(c.takeaways),
      }))
      .filter((c) => c.takeaways.length > 0),
  };
}
