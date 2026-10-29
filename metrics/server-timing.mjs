// Server response time per route without a browser: time to first byte and to last byte of the HTML (RSC stream
// included), 15 requests after 2 warm-ups, authenticated as the club president. Usage: node metrics/server-timing.mjs [base]
import fs from "node:fs";
import { ids, routeList, median, range } from "./browser/common.mjs";
const base = process.argv[2] ?? "http://localhost:3100";
const state = JSON.parse(fs.readFileSync("metrics/results/raw/state-exec.json", "utf8"));
const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const id = await ids();
const rows = {};
for (const r of routeList(id).filter((r) => r.auth)) {
  const t = { ttfb: [], total: [], bytes: 0 };
  for (let i = 0; i < 17; i++) {
    const t0 = performance.now();
    const res = await fetch(base + r.path, { headers: { cookie }, redirect: "manual" });
    const reader = res.body.getReader(); let first = null, bytes = 0;
    for (;;) { const { done, value } = await reader.read(); if (first === null) first = performance.now() - t0; if (done) break; bytes += value.length; }
    if (i >= 2) { t.ttfb.push(first); t.total.push(performance.now() - t0); t.bytes = bytes; }
  }
  rows[r.name] = { ttfb: { median: median(t.ttfb), min: range(t.ttfb)[0], max: range(t.ttfb)[1] }, total: { median: median(t.total), min: range(t.total)[0], max: range(t.total)[1] }, htmlKB: +(t.bytes / 1024).toFixed(1) };
  console.log(`| ${r.name} | ${rows[r.name].ttfb.median.toFixed(0)} (${rows[r.name].ttfb.min.toFixed(0)}–${rows[r.name].ttfb.max.toFixed(0)}) | ${rows[r.name].total.median.toFixed(0)} (${rows[r.name].total.min.toFixed(0)}–${rows[r.name].total.max.toFixed(0)}) | ${rows[r.name].htmlKB} |`);
}
fs.writeFileSync(`metrics/results/raw/server-timing${base.includes("3101") ? "-dblat" : ""}.json`, JSON.stringify(rows, null, 2));
