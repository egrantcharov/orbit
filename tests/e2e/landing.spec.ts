import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders the v3 surface, not the stale v1 footer", async ({ page }) => {
    await page.goto("/");

    // The headline copy is the most stable thing on the page.
    await expect(
      page.getByRole("heading", {
        name: /Stay close to the people and ideas that matter\./,
      }),
    ).toBeVisible();

    // Sanity-check the feature grid actually surfaces what shipped in v3.
    await expect(
      page.getByRole("heading", { name: "Today section" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "⌘K Quick Capture" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Voice memos on every contact" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Synth" })).toBeVisible();

    // The bug the professor flagged: the footer used to say "v1".
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer).not.toContainText(/^v1$/);
    await expect(footer).toContainText(/v\d+\.\d+/);
  });

  test("offers sign-in + sign-up entry points when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  });
});
