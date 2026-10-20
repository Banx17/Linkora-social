import { expect, test, type Page, type Route } from "@playwright/test";
import { injectWalletMock } from "./test-utils";

/**
 * End-to-end coverage for issue #1724:
 *  - IntersectionObserver-driven pagination appends posts,
 *  - the aria-live region announces the appended page,
 *  - skeletons occupy their reserved slot, so appending does not shift layout,
 *  - the return-to-top FAB appears after 500px and restores focus,
 *  - a 2g connection gets the manual "Load more" fallback instead.
 */

const makePosts = (start: number, count: number) =>
  Array.from({ length: count }, (_, index) => {
    const n = start + index;
    return {
      id: `e2e-post-${n}`,
      author: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
      username: `networker${n}`,
      content: `Infinite scroll post ${n}`,
      like_count: 0,
      tip_total: 0,
      timestamp: 1_700_000_000 - n,
    };
  });

async function fulfilPage(route: Route, start: number, count: number, cursor: string | null) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ posts: makePosts(start, count), cursor }),
  });
}

async function scrollToBottom(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
}

test.describe("Feed infinite scroll (#1724)", () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMock(page);
  });

  test("appends the next page, announces it, and keeps the list stable", async ({ page }) => {
    // Track layout shifts so we can prove the skeleton swap does not move the
    // posts that were already on screen. The loader itself is expected to move
    // down when a page is appended, so it is excluded from the assertion.
    await page.addInitScript(() => {
      const tracker = window as Window & { __contentCls?: number };
      tracker.__contentCls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: Array<{ node?: Element | null }>;
          };
          if (shift.hadRecentInput) continue;
          const sources = shift.sources ?? [];
          const fromLoader =
            sources.length > 0 &&
            sources.every((source) =>
              source.node?.closest(
                '[data-testid="infinite-scroll"], [data-testid="infinite-scroll-region"], [data-testid="infinite-scroll-sentinel"], [data-testid="return-to-top"]'
              )
            );
          if (!fromLoader) {
            tracker.__contentCls = (tracker.__contentCls ?? 0) + shift.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.route("**/api/posts*", async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      if (!cursor) {
        await fulfilPage(route, 1, 20, "e2e-page-2");
        return;
      }
      // Keep the next page in flight long enough for the skeleton to render.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await fulfilPage(route, 21, 10, null);
    });

    await page.goto("/feed");
    await expect(page.getByText("Infinite scroll post 1", { exact: true })).toBeVisible();

    await page.waitForTimeout(300);
    await page.evaluate(() => {
      (window as Window & { __contentCls?: number }).__contentCls = 0;
    });

    await scrollToBottom(page);

    // The FAB must stay pinned to the viewport: the page-transition wrapper is
    // transformed, so a non-portaled fixed button would scroll away with it.
    const fab = page.getByRole("button", { name: "Return to top" });
    await expect(fab).toBeVisible();
    const viewport = page.viewportSize();
    const fabBox = await fab.boundingBox();
    expect(fabBox).not.toBeNull();
    expect(fabBox!.y).toBeGreaterThan(0);
    expect(fabBox!.y + fabBox!.height).toBeLessThanOrEqual(viewport!.height);

    const lastLoadedPost = page.getByText("Infinite scroll post 20", {
      exact: true,
    });
    const beforeAppend = await lastLoadedPost.boundingBox();

    await expect(page.getByTestId("infinite-scroll-skeleton")).toBeVisible();
    await expect(page.getByText("Infinite scroll post 21", { exact: true })).toBeVisible();
    await expect(page.getByTestId("feed-announcer")).toHaveText("10 more posts loaded");

    // Posts that were already rendered must not jump when the page lands.
    const afterAppend = await lastLoadedPost.boundingBox();
    expect(afterAppend).not.toBeNull();
    expect(Math.abs(afterAppend!.y - beforeAppend!.y)).toBeLessThanOrEqual(1);

    // The FAB is still pinned after the append (portal survives re-render).
    const fabAfter = await fab.boundingBox();
    expect(fabAfter).not.toBeNull();
    expect(fabAfter!.y + fabAfter!.height).toBeLessThanOrEqual(viewport!.height);

    const contentCls = await page.evaluate(
      () => (window as Window & { __contentCls?: number }).__contentCls ?? 0
    );
    expect(contentCls).toBeLessThan(0.02);
  });

  test("shows and uses the return-to-top FAB", async ({ page }) => {
    await page.route("**/api/posts*", async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      await fulfilPage(route, cursor ? 21 : 1, cursor ? 10 : 20, cursor ? null : "e2e-page-2");
    });

    await page.goto("/feed");
    await expect(page.getByText("Infinite scroll post 1", { exact: true })).toBeVisible();

    const fab = page.getByRole("button", { name: "Return to top" });
    await expect(fab).toBeHidden();

    await scrollToBottom(page);
    await expect(fab).toBeVisible();

    await fab.click();

    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
      .toBeLessThan(500);
    await expect(page.locator("#feed-top")).toBeFocused();
  });

  test("falls back to a manual Load more button on a 2g connection", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        value: {
          effectiveType: "2g",
          saveData: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        },
      });
    });

    await page.route("**/api/posts*", async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      await fulfilPage(route, cursor ? 21 : 1, cursor ? 10 : 20, cursor ? null : "e2e-page-2");
    });

    await page.goto("/feed");
    await expect(page.getByText("Infinite scroll post 1", { exact: true })).toBeVisible();

    const loadMore = page.getByTestId("load-more");
    await expect(loadMore).toBeVisible();

    // Scrolling must NOT auto-load: the manual button is the only trigger.
    await scrollToBottom(page);
    await page.waitForTimeout(750);
    await expect(page.getByText("Infinite scroll post 21", { exact: true })).toHaveCount(0);

    await loadMore.click();
    await expect(page.getByText("Infinite scroll post 21", { exact: true })).toBeVisible();
  });
});
