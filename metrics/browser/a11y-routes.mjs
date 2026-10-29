// axe-core on every route (desktop 1280x800 and mobile 412 wide), counted by impact.
// Rule set: WCAG 2.0/2.1/2.2 A + AA tags (violations only). Repeats RUNS times to confirm counts are stable.
// Usage: node metrics/browser/a11y-routes.mjs [outName] ; env RUNS (default 5)
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { BASE, RUNS, MOBILE, DESKTOP, ids, routeList, ADMIN_ROUTES, makeStorage, environment, browserVersion, save } from "./common.mjs";

const out = process.argv[2] ?? "a11y-routes";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const id = await ids();
const exec = await makeStorage("president@club.test", "metrics/results/raw/state-exec.json");
const admin = await makeStorage("admin@platform.test", "metrics/results/raw/state-admin.json");
const routes = [...routeList(id).map((r) => ({ ...r, state: r.auth ? exec : null })), ...ADMIN_ROUTES.map((r) => ({ ...r, state: admin }))];
const browser = await chromium.launch();
const results = {};
for (const vp of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
  for (const r of routes) {
    const perRun = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({ ...vp[1], storageState: r.state ?? undefined });
      const page = await ctx.newPage();
      await page.goto(BASE + r.path, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const v of res.violations) byImpact[v.impact ?? "minor"] += v.nodes.length;
      perRun.push({ byImpactNodes: byImpact, rules: res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })) });
      await ctx.close();
    }
    const stable = perRun.every((x) => JSON.stringify(x.byImpactNodes) === JSON.stringify(perRun[0].byImpactNodes));
    results[`${vp[0]} ${r.name}`] = { stable, ...perRun[0] };
    const b = perRun[0].byImpactNodes;
    console.log(`${vp[0].padEnd(8)} ${r.name.padEnd(32)} critical ${b.critical} serious ${b.serious} moderate ${b.moderate} minor ${b.minor}  ${stable ? "" : "UNSTABLE"} ${perRun[0].rules.map((x) => x.id).join(",")}`);
  }
}
await browser.close();
save(out, { environment: { ...environment(await browserVersion()), axe: "axe-core 4.14.0, tags " + TAGS.join(",") }, runs: RUNS, results });
