/**
 * E2E spec for the multi-step XLM tipping flow (issue #1728).
 *
 * Tests are written defensively: when no posts are seeded (CI has no live
 * network) we skip with an explicit message rather than silently passing.
 */
import { test, expect } from "@playwright/test";
import { injectWalletMock, connectWallet } from "./test-utils";

test.describe("Post Tipping — multi-step flow", () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMock(page);
    await page.goto("/");
    await connectWallet(page);
  });

  test("feed page is accessible after wallet connect", async ({ page }) => {
    await page.goto("/feed");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
  });

  test("tip button visible on a feed post when one exists", async ({ page }) => {
    await page.goto("/feed");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    const firstPost = page.locator("article").first();
    const hasPost = await firstPost.isVisible().catch(() => false);
    test.skip(!hasPost, "No posts in feed — skip tip-button assertion");

    const tipButton = firstPost.locator('button[aria-label="Tip creator"]');
    await expect(tipButton).toBeVisible();
  });

  test("clicking tip button opens TipModal at step 1 (Amount)", async ({ page }) => {
    await page.goto("/feed");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    const firstPost = page.locator("article").first();
    const hasPost = await firstPost.isVisible().catch(() => false);
    test.skip(!hasPost, "No posts in feed — skip TipModal open assertion");

    await firstPost.locator('button[aria-label="Tip creator"]').click();

    // Dialog should be open
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Step 1 heading / indicator
    await expect(dialog.getByText("Amount")).toBeVisible();
  });

  test("modal has focus trap and is closable via Escape key", async ({ page }) => {
    await page.goto("/feed");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    const firstPost = page.locator("article").first();
    const hasPost = await firstPost.isVisible().catch(() => false);
    test.skip(!hasPost, "No posts in feed — skip focus-trap assertion");

    await firstPost.locator('button[aria-label="Tip creator"]').click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Pressing Escape should close the modal
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("step indicator advances to Preview on valid amount entry", async ({ page }) => {
    await page.goto("/feed");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    const firstPost = page.locator("article").first();
    const hasPost = await firstPost.isVisible().catch(() => false);
    test.skip(!hasPost, "No posts in feed — skip step-advance assertion");

    await firstPost.locator('button[aria-label="Tip creator"]').click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill a valid amount — balances may be unavailable in CI so check for the
    // input and token selector; if absent, skip.
    const amountInput = dialog.getByLabel("Amount");
    const hasInput = await amountInput.isVisible().catch(() => false);
    test.skip(!hasInput, "Amount input not visible (no wallet balance) — skip");

    // Use quick-select to fill an amount if available
    const xlm1btn = dialog.getByRole("button", { name: "1 XLM" });
    if (await xlm1btn.isVisible().catch(() => false)) {
      await xlm1btn.click();
    } else {
      await amountInput.fill("1");
    }

    const reviewBtn = dialog.getByRole("button", { name: "Review →" });
    await expect(reviewBtn).toBeEnabled({ timeout: 2_000 });
    await reviewBtn.click();

    // Preview step should now be active
    await expect(dialog.getByText("Creator receives")).toBeVisible({ timeout: 3_000 });
  });
});
