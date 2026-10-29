import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import pg from "pg";
import { chromium, devices } from "playwright";

export const BASE = process.env.BASE ?? "http://localhost:3100";
export const RUNS = Number(process.env.RUNS ?? 5);
export const RAW = "metrics/results/raw";
fs.mkdirSync(RAW, { recursive: true });

// Mobile profile: Pixel 5 emulation (412x915 @2.625, touch, mobile UA).
export const MOBILE = devices["Pixel 5"];
// Lighthouse "Slow 4G": 150 ms RTT, 1638.4 Kbps down, 750 Kbps up; CPU 4x slowdown.
export const THROTTLE = {
  network: { offline: false, latency: 150, downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  cpuRate: 4,
};
export const DESKTOP = { viewport: { width: 1280, height: 800 } };

export async function throttle(page, on = true) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", on ? THROTTLE.network : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: on ? THROTTLE.cpuRate : 1 });
  return cdp;
}

export const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const range = (a) => [Math.min(...a), Math.max(...a)];
export const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? "n/a" : n.toFixed(d));

export async function db() {
  const url = process.env.DATABASE_URL ?? fs.readFileSync(".env", "utf8").match(/DATABASE_URL="([^"]+)"/)[1];
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Real ids from the seeded DB, so routes with [id] can be requested. */
export async function ids() {
  const c = await db();
  const q = async (sql) => (await c.query(sql)).rows[0]?.id;
  const out = {
    event: await q(`select e.id from "Event" e join "Club" c on c.id=e."clubId" where c.slug='demo-club' and e.title='General Meeting'`),
    partner: await q(`select p.id from "Partner" p join "Club" c on c.id=p."clubId" where c.slug='demo-club' limit 1`),
    member: await q(`select m.id from "Membership" m join "Club" c on c.id=m."clubId" where c.slug='demo-club' and m.status='ACTIVE' order by m."createdAt" limit 1`),
  };
  await c.end();
  return out;
}

export function routeList(id) {
  const s = "/demo-club";
  return [
    { name: "/login", path: "/login", auth: false },
    { name: "/signup", path: "/signup", auth: false },
    { name: "/[club]/register", path: `${s}/register`, auth: false },
    { name: "/[club]/events/[id]/register", path: `${s}/events/${id.event}/register`, auth: false },
    { name: "/clubs", path: "/clubs", auth: true },
    { name: "/[club]/dashboard", path: `${s}/dashboard`, auth: true },
    { name: "/[club]/members", path: `${s}/members`, auth: true },
    { name: "/[club]/members/[id]", path: `${s}/members/${id.member}`, auth: true },
    { name: "/[club]/dues", path: `${s}/dues`, auth: true },
    { name: "/[club]/events", path: `${s}/events`, auth: true },
    { name: "/[club]/events/[id]", path: `${s}/events/${id.event}`, auth: true },
    { name: "/[club]/elections", path: `${s}/elections`, auth: true },
    { name: "/[club]/partners", path: `${s}/partners`, auth: true },
    { name: "/[club]/partners/[id]", path: `${s}/partners/${id.partner}`, auth: true },
    { name: "/[club]/settings", path: `${s}/settings`, auth: true },
    { name: "/[club]/profile", path: `${s}/profile`, auth: true },
  ];
}
export const ADMIN_ROUTES = [
  { name: "/admin", path: "/admin" },
  { name: "/admin/clubs", path: "/admin/clubs" },
  { name: "/admin/users", path: "/admin/users" },
];

export async function login(page, email, password = "password123") {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

/** Logs in once per role and stores cookies, so each measured run starts from a fresh, cold context. */
export async function makeStorage(email, file) {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await login(p, email);
  await ctx.storageState({ path: file });
  await b.close();
  return file;
}

export function environment(browserVersion) {
  const cpus = os.cpus();
  return {
    date: new Date().toISOString(),
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: `${cpus[0].model} x${cpus.length} logical cores`,
    memoryGB: +(os.totalmem() / 1e9).toFixed(1),
    node: process.version,
    browser: browserVersion,
    playwright: createRequire(import.meta.url)("playwright/package.json").version,
    mobileProfile: "Playwright 'Pixel 5' (412x915 CSS px, DPR 2.625, touch, mobile UA)",
    throttling: "CDP: latency 150 ms, down 1638.4 Kbps, up 750 Kbps (Slow 4G); CPU 4x slowdown",
    server: "next start (production build), same machine as the browser; Postgres 16 on localhost",
  };
}
export async function browserVersion() { const b = await chromium.launch(); const v = b.version(); await b.close(); return `Chromium ${v} (headless)`; }
export const save = (name, data) => fs.writeFileSync(`${RAW}/${name}.json`, JSON.stringify(data, null, 2));
