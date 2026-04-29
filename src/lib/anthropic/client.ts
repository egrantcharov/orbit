import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

/**
 * Singleton Anthropic client. The SDK is server-only — never import this from
 * a client component. The API key lives in ANTHROPIC_API_KEY (Vercel + .env.local).
 */
export function getAnthropic(): Anthropic {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

export const SONNET = "claude-sonnet-4-6" as const;
export const OPUS = "claude-opus-4-7" as const;
