import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

type Severity = "high" | "medium" | "low";

type AuditIssue = {
  severity: Severity;
  area: string;
  message: string;
  evidence?: string;
};

type RouteMetric = {
  route: string;
  domContentLoadedMs: number | null;
  loadMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  clsScore: number | null;
};

const PERF_DOM_CONTENT_MS_WARN = 2500;
const PERF_LOAD_MS_WARN = 4500;
const PERF_LCP_MS_WARN = 3000;
const PERF_CLS_WARN = 0.1;

type LayoutShiftEntry = PerformanceEntry & {
  hadRecentInput: boolean;
  value: number;
};

const expectedApiHost = (() => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return null;
  try {
    return new URL(apiUrl).host;
  } catch {
    return null;
  }
})();

function pushIssue(
  issues: AuditIssue[],
  severity: Severity,
  area: string,
  message: string,
  evidence?: string
) {
  issues.push({ severity, area, message, evidence });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeAuditReport(payload: unknown) {
  const reportPath = path.resolve(process.cwd(), "test-results", "ux-audit-report.json");
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), "utf8");
}

test.describe("UX audit", () => {
  test.setTimeout(240_000);

  test("comprehensive interface and workflow audit", async ({ page, request }, testInfo) => {
    const apiBase =
      process.env.E2E_API_BASE ||
      process.env.EXPO_PUBLIC_API_URL ||
      `http://127.0.0.1:${process.env.E2E_PORT || "5051"}`;
    await page.addInitScript((value) => {
      (window as Window & { __E2E_API_BASE__?: string }).__E2E_API_BASE__ = value;
    }, apiBase);
    if (process.env.EXPO_PUBLIC_DISABLE_LEARNING === "1" || process.env.EXPO_PUBLIC_DISABLE_LEARNING === "true") {
      await page.addInitScript(() => {
        (window as Window & { __E2E_DISABLE_LEARNING__?: boolean }).__E2E_DISABLE_LEARNING__ = true;
      });
    }
    const issues: AuditIssue[] = [];
    const routeMetrics: RouteMetric[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const responseErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    page.on("requestfailed", (requestData) => {
      failedRequests.push(
        `${requestData.failure()?.errorText || "requestfailed"} ${requestData.method()} ${requestData.url()}`
      );
    });

    page.on("response", (response) => {
      const status = response.status();
      if (status >= 400) {
        responseErrors.push(`${status} ${response.request().method()} ${response.url()}`);
      }
    });

    const captureMetrics = async (route: string) => {
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const fcp = performance.getEntriesByName("first-contentful-paint")[0];
        return {
          domContentLoadedMs:
            nav && Number.isFinite(nav.domContentLoadedEventEnd)
              ? Math.round(nav.domContentLoadedEventEnd)
              : null,
          loadMs: nav && Number.isFinite(nav.loadEventEnd) ? Math.round(nav.loadEventEnd) : null,
          fcpMs: fcp && Number.isFinite(fcp.startTime) ? Math.round(fcp.startTime) : null,
          lcpMs: (() => {
            const entries = performance.getEntriesByType("largest-contentful-paint");
            const last = entries[entries.length - 1] as PerformanceEntry | undefined;
            return last && Number.isFinite(last.startTime) ? Math.round(last.startTime) : null;
          })(),
          clsScore: (() => {
            const shifts = performance
              .getEntriesByType("layout-shift")
              .filter((entry) => !(entry as LayoutShiftEntry).hadRecentInput) as LayoutShiftEntry[];
            if (shifts.length === 0) return null;
            const total = shifts.reduce((sum, entry) => sum + entry.value, 0);
            return Number.isFinite(total) ? Number(total.toFixed(3)) : null;
          })(),
        };
      });

      routeMetrics.push({ route, ...metrics });

      if (metrics.domContentLoadedMs !== null && metrics.domContentLoadedMs > PERF_DOM_CONTENT_MS_WARN) {
        pushIssue(
          issues,
          "medium",
          "performance",
          `Slow DOMContentLoaded on ${route}`,
          `${metrics.domContentLoadedMs}ms`
        );
      }

      if (metrics.loadMs !== null && metrics.loadMs > PERF_LOAD_MS_WARN) {
        pushIssue(issues, "low", "performance", `Slow full load on ${route}`, `${metrics.loadMs}ms`);
      }

      if (metrics.lcpMs !== null && metrics.lcpMs > PERF_LCP_MS_WARN) {
        pushIssue(issues, "medium", "performance", `Slow LCP on ${route}`, `${metrics.lcpMs}ms`);
      }

      if (metrics.clsScore !== null && metrics.clsScore > PERF_CLS_WARN) {
        pushIssue(issues, "low", "performance", `Layout shift score high on ${route}`, `${metrics.clsScore}`);
      }
    };

    const auditRoute = async (
      route: string,
      assertion: () => Promise<void>,
      screenshotName: string
    ) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await assertion();
      await captureMetrics(route);
      await page.screenshot({
        path: testInfo.outputPath(`ux-${screenshotName}.png`),
        fullPage: true,
      });
    };

    await auditRoute(
      "/",
      async () => {
        const candidateTexts = ["Ready to sing", "No lyrics loaded", "Session Review"];
        let found = false;

        for (const text of candidateTexts) {
          try {
            await expect(page.getByText(text).first()).toBeVisible({ timeout: 6_000 });
            found = true;
            break;
          } catch {
            // Try the next candidate.
          }
        }

        if (!found) {
          throw new Error("Sing screen state text not visible.");
        }
      },
      "sing-home"
    );

    await auditRoute(
      "/lyrics",
      async () => {
        await expect(page.getByPlaceholder("Song title")).toBeVisible({ timeout: 20_000 });
        await expect(page.getByPlaceholder("Write your lyrics here...")).toBeVisible({ timeout: 20_000 });
      },
      "lyrics"
    );

    await auditRoute(
      "/sessions",
      async () => {
        await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible({ timeout: 20_000 });
      },
      "sessions"
    );

    await auditRoute(
      "/profile",
      async () => {
        await expect(page.getByRole("button", { name: /Sync Latest Lyrics/i })).toBeVisible({
          timeout: 20_000,
        });
      },
      "profile"
    );

    await auditRoute(
      "/easepocket",
      async () => {
        await expect(page.getByRole("heading", { name: /EasePocket/i })).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByRole("button", { name: /Start|Record Take/i }).first()).toBeVisible({
          timeout: 20_000,
        });
      },
      "easepocket"
    );

    await auditRoute(
      "/warmup",
      async () => {
        await expect(page.getByRole("heading", { name: "Vocal Warm-Up" })).toBeVisible({
          timeout: 20_000,
        });
      },
      "warmup"
    );

    await auditRoute(
      "/mindfulness",
      async () => {
        await expect(page.getByRole("heading", { name: "Mindfulness" })).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByRole("button", { name: /Use female mindfulness voice/i })).toBeVisible({
          timeout: 20_000,
        });
      },
      "mindfulness"
    );

    // Navigation audit (is it easy to move between core tabs from bottom navigation?)
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const navLinks = await page.locator('a[href="/"], a[href="/lyrics"], a[href="/sessions"], a[href="/profile"]').all();
    if (navLinks.length < 4) {
      pushIssue(
        issues,
        "high",
        "navigation",
        "Bottom navigation appears difficult to discover with semantic links.",
        `Found ${navLinks.length} of 4 expected tab links`
      );
    } else {
      const expected = ["/", "/lyrics", "/sessions", "/profile"];
      for (const target of expected) {
        const link = page.locator(`a[href="${target}"]`).first();
        if ((await link.count()) === 0) {
          pushIssue(issues, "medium", "navigation", `Missing direct nav link`, target);
          continue;
        }
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${escapeRegex(target)}$`), { timeout: 10_000 });
      }
    }

    // Brand/logo audit on main sing screen.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    
    // Wait for React Native Web to render the logo (Image component may take a moment to hydrate)
    await page.waitForTimeout(300);
    
    const logoMeta = await page.evaluate(() => {
      const logoNodes = Array.from(
        document.querySelectorAll('[aria-label="EaseVerse logo"], img[alt="EaseVerse logo"], img')
      ) as HTMLElement[];
      const fromImages = logoNodes
        .map((node) => {
          if (!(node instanceof HTMLImageElement)) return null;
          const src = node.currentSrc || node.src || "";
          if (!src.includes("easeverse_logo")) return null;
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
          };
        })
        .filter(Boolean) as Array<{ width: number; height: number; top: number; left: number; display: string; visibility: string; opacity: string }>;

      const fromBackgrounds = Array.from(document.querySelectorAll("*"))
        .map((node) => {
          const style = window.getComputedStyle(node as Element);
          const bg = style.backgroundImage || "";
          if (!bg.includes("easeverse_logo")) return null;
          const rect = (node as Element).getBoundingClientRect();
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
          };
        })
        .filter(Boolean) as Array<{ width: number; height: number; top: number; left: number; display: string; visibility: string; opacity: string }>;

      return [...fromImages, ...fromBackgrounds];
    });

    if (logoMeta.length === 0) {
      pushIssue(issues, "high", "branding", "EaseVerse logo is not visible on sing screen.");
    } else {
      const visible = logoMeta.filter((item) => 
        item.visibility !== "hidden" && 
        item.display !== "none" &&
        parseFloat(item.opacity) > 0.1 &&
        item.width > 0 &&
        item.height > 0
      );
      const largest = visible.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!largest) {
        pushIssue(issues, "high", "branding", "Logo exists in DOM but not visibly rendered.");
      } else {
        if (largest.width < 90) {
          pushIssue(
            issues,
            "medium",
            "branding",
            "Primary logo appears too small to read clearly.",
            `largest logo width=${largest.width}px`
          );
        }
        if (largest.width > 520) {
          pushIssue(
            issues,
            "low",
            "branding",
            "Primary logo may be oversized and dominate hero area.",
            `largest logo width=${largest.width}px`
          );
        }
      }
    }

    // Core sync and session flow using direct route navigation.
    const songTitle = `UX Audit Song ${Date.now()}`;
    const initialLyrics = "Hello world\nThis is test";
    const updatedLyrics = `${initialLyrics}\nNew line from collab`;

    await page.goto("/lyrics", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Song title").fill(songTitle);
    await page.getByPlaceholder("Write your lyrics here...").fill(initialLyrics);
    await expect(page.getByTestId("lyrics-save-indicator")).toContainText("Saved", {
      timeout: 15_000,
    });

    const externalTrackId = `ux-audit-${Date.now()}`;
    const seed = await request.post("/api/v1/collab/lyrics", {
      data: {
        externalTrackId,
        projectId: "proj-ux-audit",
        title: songTitle,
        artist: "QA",
        lyrics: updatedLyrics,
        source: "playwright-ux-audit",
      },
    });
    if (!seed.ok()) {
      pushIssue(
        issues,
        "high",
        "sync",
        "Failed to seed remote collaboration lyrics.",
        `status=${seed.status()}`
      );
    } else {
      await page.goto("/profile", { waitUntil: "domcontentloaded" });
      const syncButton = page.getByRole("button", { name: /Sync Latest Lyrics/i });
      await syncButton.click();
      try {
        await expect(page.getByText(/Synced latest lyrics|Lyrics synced|Lyrics sync failed/i)).toBeVisible({
          timeout: 20_000,
        });
      } catch (error) {
        pushIssue(
          issues,
          "medium",
          "sync",
          "Sync completion toast not observed.",
          String(error)
        );
      }

      await page.goto("/lyrics", { waitUntil: "domcontentloaded" });
      try {
        await expect(page.getByPlaceholder("Write your lyrics here...")).toHaveValue(updatedLyrics, {
          timeout: 20_000,
        });
      } catch (error) {
        pushIssue(
          issues,
          "high",
          "sync",
          "Lyrics sync did not update local editor.",
          String(error)
        );
      }
    }

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: songTitle })).toBeVisible({ timeout: 20_000 });

    const recordButton = page.getByTestId("record-button");
    if ((await recordButton.count()) === 0) {
      pushIssue(issues, "high", "recording", "Record button missing on sing screen.");
    } else {
      await recordButton.click();
      const stopButton = page.getByTestId("stop-button");
      await expect(stopButton).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(3_800);
      await stopButton.click();
      await expect(page.getByRole("heading", { name: "Session Review" })).toBeVisible({
        timeout: 30_000,
      });
      
      // Wait a bit for AsyncStorage writes to complete
      await page.waitForTimeout(500);
    }

    const sessionsTab = page.locator('a[href="/sessions"]').first();
    let usedTabNav = false;
    if ((await sessionsTab.count()) > 0) {
      const isVisible = await sessionsTab.isVisible().catch(() => false);
      if (isVisible) {
        await sessionsTab.click({ timeout: 5_000 });
        await expect(page).toHaveURL(/\/sessions$/, { timeout: 10_000 });
        usedTabNav = true;
      }
    }
    if (!usedTabNav) {
      await page.goto("/sessions", { waitUntil: "domcontentloaded" });
    }
    
    // Wait for the page to fully hydrate - the "recordings" stat label should appear
    await expect(page.getByText("recordings")).toBeVisible({ timeout: 5_000 });
    
    // Give a bit more time for the list to render from storage
    await page.waitForTimeout(500);
    
    const noSessions = page.getByText("No sessions yet");
    if (await noSessions.isVisible()) {
      pushIssue(
        issues,
        "medium",
        "sessions",
        "Session list still empty after recording flow. Session persistence may be unstable."
      );
    }

    // Responsive check across key breakpoints.
    const sizes = [
      { width: 360, height: 800, label: "mobile-360" },
      { width: 768, height: 1024, label: "ipad-768" },
      { width: 1280, height: 800, label: "desktop-1280" },
      { width: 2560, height: 1440, label: "desktop-2k" },
    ];

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const navBounds = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href="/"], a[href="/lyrics"], a[href="/sessions"], a[href="/profile"]'));
        return links.map((link) => {
          const rect = (link as HTMLElement).getBoundingClientRect();
          return { w: rect.width, h: rect.height };
        });
      });

      if (navBounds.length > 0) {
        const tooSmallTapTargets = navBounds.filter((bound) => bound.w < 44 || bound.h < 44);
        if (tooSmallTapTargets.length > 0) {
          pushIssue(
            issues,
            "medium",
            "accessibility",
            `Tap targets below 44x44 on ${size.label}`,
            `${tooSmallTapTargets.length} items`
          );
        }
      }

      await page.screenshot({
        path: testInfo.outputPath(`ux-responsive-${size.label}.png`),
        fullPage: true,
      });
    }

    // Aggregate runtime failures.
    for (const error of pageErrors) {
      pushIssue(issues, "high", "stability", "Unhandled page exception", error);
    }
    for (const error of failedRequests) {
      if (error.includes("/api/")) {
        if (error.includes("net::ERR_ABORTED")) {
          const isBenignLyricsAbort =
            /\bGET\b/.test(error) && error.includes("/api/v1/collab/lyrics");
          if (!isBenignLyricsAbort) {
            pushIssue(issues, "low", "navigation", "API request aborted during navigation", error);
          }
          continue;
        }
        if (expectedApiHost && !error.includes(expectedApiHost)) {
          pushIssue(issues, "low", "environment", "API request failed against unexpected host", error);
        } else {
          pushIssue(issues, "medium", "api", "Failed API request during audit", error);
        }
      }
    }
    for (const error of responseErrors) {
      if (error.includes("/api/")) {
        if (expectedApiHost && !error.includes(expectedApiHost)) {
          pushIssue(issues, "low", "environment", "API error response from unexpected host", error);
        } else if (error.includes("/api/session-score") && /^503\s/.test(error)) {
          pushIssue(issues, "low", "environment", "Session scoring unavailable in test env", error);
        } else if (/ 5\d\d /.test(error)) {
          pushIssue(issues, "high", "api", "API responded with server error", error);
        } else {
          pushIssue(issues, "medium", "api", "API responded with error status", error);
        }
      } else {
        pushIssue(issues, "low", "network", "Network error response observed", error);
      }
    }
    for (const error of consoleErrors) {
      if (/404|500|failed|error/i.test(error)) {
        pushIssue(issues, "low", "console", "Console error observed", error);
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      routeMetrics,
      issueCount: {
        high: issues.filter((issue) => issue.severity === "high").length,
        medium: issues.filter((issue) => issue.severity === "medium").length,
        low: issues.filter((issue) => issue.severity === "low").length,
      },
      issues,
      consoleErrors,
      pageErrors,
      failedRequests,
      responseErrors,
    };

    await writeAuditReport(report);
    await testInfo.attach("ux-audit-report.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    // Keep this test report-oriented rather than blocker-oriented.
    expect(true).toBeTruthy();
  });
});
