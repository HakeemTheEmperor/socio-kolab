import { chromium } from "playwright";
import { BASE, MOBILE, throttle } from "./common.mjs";
const b = await chromium.launch();
const ctx = await b.newContext({ ...MOBILE });
const p = await ctx.newPage();
await p.addInitScript(() => { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === "first-contentful-paint") window.__fcp = e.startTime; })).observe({ type: "paint", buffered: true }); });
const cdp = await throttle(p); const frames = [];
cdp.on("Page.screencastFrame", async (f) => { frames.push({ ts: f.metadata.timestamp * 1000, data: f.data }); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send("Page.startScreencast", { format: "png" });
const t0 = Date.now();
await p.goto(BASE + "/beta-club/register", { waitUntil: "load" }); await p.waitForTimeout(1200);
const o = await p.evaluate(() => ({ origin: performance.timeOrigin, fcp: window.__fcp }));
const probe = await ctx.newPage();
for (const f of frames) { const px = await probe.evaluate(async (d) => { const i = new Image(); i.src = "data:image/png;base64," + d; await i.decode(); const c = new OffscreenCanvas(i.width, i.height); const g = c.getContext("2d"); g.drawImage(i, 0, 0); const q = g.getImageData(4, 4, 1, 1).data; return [q[0], q[1], q[2]].join(","); }, f.data); console.log("frame at", (f.ts - o.origin).toFixed(0), "ms rel. to navigation; FCP at", o.fcp.toFixed(0), "pixel", px); }
await b.close();
