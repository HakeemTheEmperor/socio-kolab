// Which element is the LCP, and when did each candidate appear? (mobile, Slow 4G, 4x CPU, one cold load per route)
// Usage: node metrics/browser/lcp-element.mjs <path> [<path> ...]
import { chromium } from "playwright";
import { BASE, MOBILE, throttle } from "./common.mjs";
const browser = await chromium.launch();
for (const path of process.argv.slice(2)) {
  const ctx = await browser.newContext({ ...MOBILE, storageState: "metrics/results/raw/state-exec.json" });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__lcp = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lcp.push({ t: Math.round(e.startTime), size: e.size, tag: e.element?.tagName, cls: (e.element?.className?.toString?.() ?? "").slice(0, 80), text: (e.element?.textContent ?? "").trim().slice(0, 50), url: e.url })) ).observe({ type: "largest-contentful-paint", buffered: true }); });
  await throttle(page);
  await page.goto(BASE + path, { waitUntil: "load" }); await page.waitForTimeout(2500);
  console.log(path, JSON.stringify(await page.evaluate(() => window.__lcp)));
  await ctx.close();
}
await browser.close();
