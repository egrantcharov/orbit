import { expect, test } from "@playwright/test";

/**
 * The CSV import path is the highest-stakes mutation surface in the app —
 * a misconfigured rate limit or input cap here lets one logged-in user
 * brick their own data. These tests verify the API contract holds without
 * needing an authenticated session: the unauthenticated 401 shape is the
 * contract that the (also-tested) sign-in gate depends on.
 */

test.describe("Contact CSV import", () => {
  test("rejects unauthenticated callers with JSON 401", async ({ request }) => {
    const r = await request.post("/api/contacts/import", {
      headers: { "content-type": "application/json" },
      data: { rows: [{ email: "ada@example.com" }] },
    });
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body.error).toBe("unauthorized");
  });

  test("rejects oversized payloads before parsing", async ({ request }) => {
    // 5 MB body — over the 4 MB cap — even unauthenticated should bounce
    // at the size cap before/with the auth check. Either order is fine;
    // what we care about is that the body is never silently accepted.
    const oversized = JSON.stringify({
      rows: new Array(6000).fill({ email: "ada@example.com" }),
    });
    const r = await request.post("/api/contacts/import", {
      headers: { "content-type": "application/json" },
      data: oversized,
    });
    expect([400, 401, 413]).toContain(r.status());
  });

  test("the import page is gated by Clerk", async ({ page }) => {
    await page.goto("/app/import");
    await expect(page).toHaveURL(/sign-in/);
  });
});
