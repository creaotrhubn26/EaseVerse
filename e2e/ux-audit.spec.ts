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
};

const PERF_DOM_CONTENT_MS_WARN = 2500;
const PERF_LOAD_MS_WARN = 4500;

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
    const issues: AuditIssue[] = [];
    const routeMetrics: RouteMetric[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

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
        await expect(page.getByText(/No lyrics loaded|Ready to sing|Session Review/i)).toBeVisible({
          timeout: 20_000,
        });
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
        await expect(page.getByText(/EasePocket/i)).toBeVisible({ timeout: 20_000 });
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
    const logoMeta = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
      const matches = images
        .filter((img) => (img.currentSrc || img.src || "").includes("easeverse_logo_App"))
        .map((img) => {
          const rect = img.getBoundingClientRect();
          const style = window.getComputedStyle(img);
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
          };
        });
      return matches;
    });

    if (logoMeta.length === 0) {
      pushIssue(issues, "high", "branding", "EaseVerse logo is not visible on sing screen.");
    } else {
      const visible = logoMeta.filter((item) => item.visibility !== "hidden" && item.display !== "none");
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
    await expect(page.getByText("Saved & ready for live")).toBeVisible({ timeout: 15_000 });

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

      await page.goto("/lyrics", { waitUntil: "domcontentloaded" });
      await expect(page.getByPlaceholder("Write your lyrics here...")).toHaveValue(updatedLyrics, {
        timeout: 20_000,
      });
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
    }

    await page.goto("/sessions", { waitUntil: "domcontentloaded" });
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
        pushIssue(issues, "medium", "api", "Failed API request during audit", error);
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

