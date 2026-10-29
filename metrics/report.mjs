// Turns metrics/results/raw/*.json into the markdown tables used in METRICS.md.
// Usage: node metrics/report.mjs > /tmp/tables.md
import fs from "node:fs";
const R = (n) => { try { return JSON.parse(fs.readFileSync(`metrics/results/raw/${n}.json`, "utf8")); } catch { return null; } };
const f = (n, d = 0) => (n == null ? "–" : Number(n).toFixed(d));
const rng = (s, d = 0) => (s ? `${f(s.median, d)} (${f(s.min, d)}–${f(s.max, d)})` : "–");
const out = [];
const P = (s = "") => out.push(s);

// 1. Vitals
{
  const b = R("vitals-before").results, a = R("vitals-after").results;
  P("### 1a. Core Web Vitals per route (median (min–max) of 5 cold loads; mobile, Slow 4G, 4x CPU)\n");
  P("| Route | TTFB ms | FCP ms | LCP ms | CLS at load | INP ms | CLS after interaction |");
  P("|---|---|---|---|---|---|---|");
  for (const k of Object.keys(b)) {
    const row = (r) => `${rng(r.summary.ttfb)} | ${rng(r.summary.fcp)} | ${rng(r.summary.lcp)} | ${rng(r.summary.clsLoad, 3)} | ${r.summary.inp ? rng(r.summary.inp) : "no interaction"} | ${rng(r.summary.clsTotal, 3)}`;
    const x = a[k]; const changed = JSON.stringify([b[k].summary.clsLoad, b[k].summary.clsTotal]) !== JSON.stringify([x.summary.clsLoad, x.summary.clsTotal]);
    P(`| ${k} (before) | ${row(b[k])} |`);
    P(`| ${k} (after) | ${row(x)} |`);
  }
}
// 2. Bundle
{
  const b = R("bundle-before"), a = R("bundle-after");
  P("\n### 2. First-load JS per route and client/server source split\n");
  P("| Route | First-load JS before (raw KB / gzip KB) | after (raw / gzip) | Client modules / server modules (after) | Client share of route source bytes (after) |");
  P("|---|---|---|---|---|");
  for (const r of b) { const x = a.find((y) => y.route === r.route); const kb = (n) => (n / 1024).toFixed(1);
    P(`| ${r.route} | ${kb(r.firstLoadRawBytes)} / ${kb(r.firstLoadGzipBytes)} | ${kb(x.firstLoadRawBytes)} / ${kb(x.firstLoadGzipBytes)} | ${x.clientModules} / ${x.serverModules} | ${x.clientPct}% |`); }
}
// 3. Streaming
for (const [title, bn, an] of [["local DB, mobile throttling", "streaming-before", "streaming-after"], ["local DB, no throttling", "streaming-unthrottled-before", "streaming-unthrottled-after"], ["DB +80 ms round trip, mobile throttling", "streaming-dblat-before", "streaming-dblat-after"], ["DB +80 ms round trip, no throttling", "streaming-dblat-unthrottled-before", "streaming-dblat-unthrottled-after"]]) {
  const b = R(bn), a = R(an); if (!b || !a) continue;
  P(`\n### 3. Streaming — ${title} (ms from navigation start, median (min–max), 5 runs)\n`);
  P("| Route | TTFB | Skeleton painted | Full content painted | Gap (full − skeleton) | Gap after fixes |");
  P("|---|---|---|---|---|---|");
  for (const k of Object.keys(b.results)) { const s = b.results[k].summary, t = a.results[k].summary;
    P(`| ${k} | ${rng(s.ttfb)} | ${rng(s.skelPaint)} | ${rng(s.fullPaint)} | ${rng(s.gap)} | ${rng(t.gap)} |`); }
}
// 4. a11y routes
{
  const b = R("a11y-routes-before").results, a = R("a11y-routes-after").results;
  P("\n### 4a. axe-core violations per route (WCAG 2.0–2.2 A/AA rules; element counts by impact)\n");
  P("| Viewport / route | Before: critical / serious / moderate / minor | After | Rules after |");
  P("|---|---|---|---|");
  let tb = { critical: 0, serious: 0, moderate: 0, minor: 0 }, ta = { ...tb };
  for (const k of Object.keys(b)) { const x = b[k].byImpactNodes, y = a[k].byImpactNodes; for (const i of Object.keys(tb)) { tb[i] += x[i]; ta[i] += y[i]; }
    P(`| ${k} | ${x.critical} / ${x.serious} / ${x.moderate} / ${x.minor} | ${y.critical} / ${y.serious} / ${y.moderate} / ${y.minor} | ${a[k].rules.map((r) => r.id).join(", ") || "none"} |`); }
  P(`| **Total** | **${tb.critical} / ${tb.serious} / ${tb.moderate} / ${tb.minor}** | **${ta.critical} / ${ta.serious} / ${ta.moderate} / ${ta.minor}** | |`);
  const unstable = [...Object.entries(b), ...Object.entries(a)].filter(([, v]) => !v.stable).map(([k]) => k);
  P(`\nCounts identical across the 5 repeats on every route: ${unstable.length === 0 ? "yes" : "NO — unstable: " + unstable.join(", ")}.`);
}
// 4b builder
{
  const b = R("a11y-builder-before"), a = R("a11y-builder-after");
  P("\n### 4b. Form builder (axe inside the dialog)\n");
  P("| State | Before: crit/serious/mod/minor | After |");
  P("|---|---|---|");
  for (const s of b.scans) { const t = a.scans.find((x) => x.label === s.label); const q = (z) => z ? `${z.byImpactNodes.critical}/${z.byImpactNodes.serious}/${z.byImpactNodes.moderate}/${z.byImpactNodes.minor} ${z.rules.map((r) => r.id).join(",")}` : "–"; P(`| ${s.label} | ${q(s)} | ${q(t)} |`); }
  P("\nKeyboard-only build + reorder + save, and screen-reader announcements:\n");
  for (const [n, z] of [["before", b], ["after", a]]) P(`- **${n}**: ${JSON.stringify({ ...z.keyboard, focusStepsOk: undefined })}; focus steps ${JSON.stringify(z.keyboard.focusStepsOk)}; announcements: pickedUp=${z.announcements.hasPickedUp}, movedOver=${z.announcements.hasMovedOver}, dropped=${z.announcements.hasDropped}; captured: ${JSON.stringify(z.announcements.captured)}`);
}
// 5 FOUC
{
  const b = R("theming-fouc-before").results, a = R("theming-fouc-after").results;
  P("\n### 5b. First paint / flash of unthemed content (5 cold loads per page, mobile throttled)\n");
  P("| Page | Frames painted from FCP on | …not in the expected theme | rAF frames before FCP with wrong tokens | CLS (median) before → after | JS-disabled load themed |");
  P("|---|---|---|---|---|---|");
  for (const k of Object.keys(b)) { const s = b[k].summary, t = a[k].summary;
    P(`| ${k} | ${t.totalFramesCaptured - t.totalPrePaintBlankFramesIgnored} | ${t.totalFramesNotMatchingThemeBg} | ${t.totalRafFramesBeforeFcpWrongTokens} | ${f(s.cls.median, 3)} → ${f(t.cls.median, 3)} | ${t.noJsTokensMatch} |`); }
}
// Lighthouse
{
  const b = R("lighthouse-before").results, a = R("lighthouse-after").results;
  P("\n### 1b. Lighthouse (mobile preset, simulated Slow 4G + 4x CPU), median (min–max) of 5 runs\n");
  P("| Route | Performance before | after | Accessibility before | after | LCP ms after | TBT ms after | CLS after |");
  P("|---|---|---|---|---|---|---|---|");
  for (const k of Object.keys(b)) { const s = b[k].summary, t = a[k].summary;
    P(`| ${k}${b[k].runs[0].finalUrl !== b[k].path ? " (redirects to " + b[k].runs[0].finalUrl + ")" : ""} | ${rng(s.perf)} | ${rng(t.perf)} | ${rng(s.a11y)} | ${rng(t.a11y)} | ${f(t.lcp.median)} | ${f(t.tbt.median)} | ${f(t.cls.median, 3)} |`); }
}
console.log(out.join("\n"));
