import { getAnthropic, SONNET } from "@/lib/anthropic/client";

export type TaxonomyInputContact = {
  id: string;
  display_name: string | null;
  company: string | null;
  job_title: string | null;
  // Existing values — if present, we honor them and skip filling.
  industry: string | null;
  sector: string | null;
  team: string | null;
};

export type TaxonomyInferenceResult = {
  id: string;
  industry: string | null;
  sector: string | null;
  team: string | null;
  seniority: string | null;
};

const SYSTEM = `You infer professional taxonomy fields for contacts based on their company name and job title. The user is networking; this metadata feeds search, scoring, and pipeline grouping.

Output strict JSON: an array of objects, one per input contact, in the same order:
[
  { "id": "<contact id>", "industry": "...", "sector": "...", "team": "...", "seniority": "..." },
  ...
]

Rules:
- "industry" — broad bucket: Finance, Tech, Healthcare, Consulting, Media, Real Estate, Government, Education, Energy, Retail, Manufacturing, Legal, Nonprofit, Other.
- "sector" — sub-bucket inside the industry. Examples: Finance → Investment Banking / Asset Management / Hedge Fund / Private Equity / Venture Capital / Trading. Tech → SaaS / AI / Cloud Infra / Consumer / Devtools / Fintech / Hardware / Crypto. Healthcare → Pharma / Biotech / Provider / Insurance / Health Tech.
- "team" — specific group/desk inside the company when the title implies it (e.g., "Investment Banking Analyst, TMT" → "TMT"; "Healthcare Coverage Associate" → "Healthcare Coverage"; otherwise null).
- "seniority" — one of: Intern, Analyst, Associate, Manager, Senior Manager, Director, VP, Senior VP, Partner, Executive (C-suite), Founder, Other. Use null if title is too vague to map.
- Be honest. If you can't infer a field with confidence, return null. NEVER fabricate a sector you're not sure about.
- "id" must echo the input id verbatim.

If a contact has no company AND no title, return null for everything except id.`;

function asString(v: unknown, max = 80): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "unknown") {
    return null;
  }
  return t.slice(0, max);
}

export async function inferTaxonomy(
  contacts: TaxonomyInputContact[],
): Promise<TaxonomyInferenceResult[]> {
  if (contacts.length === 0) return [];
  const client = getAnthropic();

  const userText = contacts
    .map((c) => {
      const lines = [
        `id: ${c.id}`,
        `name: ${c.display_name ?? "(unknown)"}`,
        `company: ${c.company ?? "(none)"}`,
        `title: ${c.job_title ?? "(none)"}`,
      ];
      if (c.industry) lines.push(`already-set industry: ${c.industry}`);
      if (c.sector) lines.push(`already-set sector: ${c.sector}`);
      if (c.team) lines.push(`already-set team: ${c.team}`);
      return lines.join("\n");
    })
    .join("\n---\n");

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
      {
        role: "user",
        content: `Infer taxonomy for these ${contacts.length} contact${contacts.length === 1 ? "" : "s"}:\n\n${userText}`,
      },
    ],
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const validIds = new Set(contacts.map((c) => c.id));
  return parsed
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => {
      const id = typeof r.id === "string" ? r.id : "";
      if (!validIds.has(id)) return null;
      return {
        id,
        industry: asString(r.industry, 60),
        sector: asString(r.sector, 80),
        team: asString(r.team, 80),
        seniority: asString(r.seniority, 40),
      };
    })
    .filter((r): r is TaxonomyInferenceResult => r !== null);
}
