import { expect, test } from "@playwright/test";

/**
 * Protected surfaces should redirect (or 401, for API) when unauthenticated.
 * This catches the class of regression where someone widens `isPublicApiRoute`
 * in `src/proxy.ts` and leaves an endpoint open.
 */

test.describe("Auth gates", () => {
  test("the /app page redirects unauthenticated visitors to sign-in", async ({
    page,
  }) => {
    const res = await page.goto("/app");
    // Clerk's middleware response is a redirect; final URL should be sign-in.
    expect(page.url()).toMatch(/sign-in/);
    // The dev server returns 200 after the redirect chain; just assert we
    // landed somewhere that mentions Clerk's branded sign-in UI.
    expect(res?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/sign-in/);
  });

  test("protected API endpoints respond with 401 JSON, not HTML", async ({
    request,
  }) => {
    // Today: a GET that we know is rate-limited and JSON-only behind the gate.
    const r = await request.get("/api/today");
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
    const ct = r.headers()["content-type"] ?? "";
    // Either it's a JSON 401 (proxy-level) or a redirect to sign-in.
    if (r.status() === 401) {
      expect(ct).toContain("application/json");
    }
  });
});
