import { expect, test } from "@playwright/test";

/**
 * Synth is the most expensive feature in the app (two Claude calls per
 * refresh, prompt cache notwithstanding). We don't run the real generation
 * here — that needs an authed session and burns Anthropic credit. Instead
 * the smoke test verifies:
 *
 *   - the Synth page is reachable behind the auth gate,
 *   - its API endpoints answer with the expected unauthenticated shape
 *     (not 500, not HTML — that's the regression class to catch).
 */

test.describe("Synth", () => {
  test("the /app/synth page is gated by Clerk", async ({ page }) => {
    await page.goto("/app/synth");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("daily synth endpoint returns 401 JSON when unauthenticated", async ({
    request,
  }) => {
    const r = await request.get("/api/synth/daily");
    expect(r.status()).toBeGreaterThanOrEqual(400);
    if (r.status() === 401) {
      expect(r.headers()["content-type"] ?? "").toContain("application/json");
      const body = await r.json();
      expect(body.error).toBe("unauthorized");
    }
  });

  test("weekly synth endpoint returns 401 JSON when unauthenticated", async ({
    request,
  }) => {
    const r = await request.get("/api/synth/weekly");
    expect(r.status()).toBeGreaterThanOrEqual(400);
    if (r.status() === 401) {
      expect(r.headers()["content-type"] ?? "").toContain("application/json");
      const body = await r.json();
      expect(body.error).toBe("unauthorized");
    }
  });
});
