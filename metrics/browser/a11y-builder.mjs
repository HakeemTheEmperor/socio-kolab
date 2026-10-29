// Form builder: axe at rest, with fields added, and DURING a drag (keyboard lift and pointer drag).
// Also checks the keyboard-only build+reorder+save flow and the screen-reader announcements.
// Usage: node metrics/browser/a11y-builder.mjs [outName]
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { BASE, MOBILE, DESKTOP, makeStorage, environment, browserVersion, save, db } from "./common.mjs";

const out = process.argv[2] ?? "a11y-builder";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const exec = await makeStorage("president@club.test", "metrics/results/raw/state-exec.json");
const browser = await chromium.launch();

const scan = async (page, label, scope) => {
  let b = new AxeBuilder({ page }).withTags(TAGS);
  if (scope) b = b.include(scope);
  const res = await b.analyze();
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of res.violations) byImpact[v.impact ?? "minor"] += v.nodes.length;
  console.log(label.padEnd(46), JSON.stringify(byImpact), res.violations.map((v) => v.id).join(","));
  return { label, byImpactNodes: byImpact, rules: res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })) };
};
const dialog = '[role="dialog"]';
const result = { scans: [], keyboard: {}, announcements: {} };

async function openDialog(page, vp) {
  await page.goto(`${BASE}/demo-club/events`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create event" }).first().click();
  await page.waitForSelector(dialog);
}
async function addField(page, name) {
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByRole("menuitem", { name }).click();
}

for (const [vpName, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
  const ctx = await browser.newContext({ ...vp, storageState: exec });
  const page = await ctx.newPage();
  await openDialog(page, vp);
  result.scans.push({ viewport: vpName, ...(await scan(page, `${vpName}: builder empty`, dialog)) });
  for (const t of ["Short text", "Dropdown", "Checkbox", "Number"]) await addField(page, t);
  await page.waitForTimeout(300);
  result.scans.push({ viewport: vpName, ...(await scan(page, `${vpName}: builder with 4 fields`, dialog)) });
  await page.getByRole("button", { name: /Edit options for/ }).first().click();
  result.scans.push({ viewport: vpName, ...(await scan(page, `${vpName}: dropdown options open`, dialog)) });

  // Keyboard lift: focus handle, Space, ArrowDown (mid-drag), scan, then Space to drop.
  const handle = page.getByRole("button", { name: /^Reorder/ }).first();
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  result.scans.push({ viewport: vpName, ...(await scan(page, `${vpName}: mid keyboard drag`, dialog)) });
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);

  // Pointer drag, mouse only meaningful on desktop viewport.
  if (vpName === "desktop") {
    const h = page.getByRole("button", { name: /^Reorder/ });
    const a = await h.nth(0).boundingBox(), c = await h.nth(2).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y + 20, { steps: 5 });
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2 + 10, { steps: 10 });
    await page.waitForTimeout(200);
    result.scans.push({ viewport: vpName, ...(await scan(page, `${vpName}: mid pointer drag`, dialog)) });
    await page.mouse.up();
  }
  await ctx.close();
}

// ---------- keyboard-only build + reorder + save, with live-region capture ----------
{
  const c = await db();
  await c.query(`delete from "Event" where title = 'KB Test Event'`);
  const ctx = await browser.newContext({ ...DESKTOP, storageState: exec });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo-club/events`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    // Record every distinct text a live region holds. Watching the whole body catches regions that are
    // created with their text already set (dnd-kit mounts its live region when a drag starts).
    window.__live = []; const last = new Map();
    const scan = () => document.querySelectorAll("[aria-live]").forEach((el) => {
      const t = el.textContent.trim(); if (t && last.get(el) !== t) { last.set(el, t); window.__live.push(t); }
    });
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  let keys = 0;
  const press = async (k) => { keys++; await page.keyboard.press(k); };
  const typeText = async (t) => { keys += t.length; await page.keyboard.type(t); };
  const active = () => page.evaluate(() => { const e = document.activeElement; return (e?.getAttribute("aria-label") || e?.textContent || e?.id || e?.tagName || "").trim().slice(0, 60); });
  // Tab until the focused element's accessible text matches.
  const tabTo = async (re, max = 80, dir = "Tab") => { for (let i = 0; i < max; i++) { if (re.test(await active())) return true; await press(dir); } return false; };
  const ok = {};
  const t0 = Date.now();
  ok.openDialog = await tabTo(/^Create event$/); await press("Enter"); await page.waitForSelector(dialog);
  ok.titleFocus = await tabTo(/^title$|Title/); await typeText("KB Test Event");
  ok.startsFocus = await tabTo(/^startsAt$/);
  // datetime-local: type digits segment by segment.
  await typeText("12312030"); await press("ArrowRight"); await typeText("1000A");
  // Add three fields via keyboard: trigger -> menu -> item.
  for (const [type, label] of [["Short text", "Alpha"], ["Number", "Beta"], ["Checkbox", "Gamma"]]) {
    ok["add" + type] = await tabTo(/^Add field$/);
    await press("Enter"); await page.waitForSelector('[role="menu"]');
    // Items open focused on first; ArrowDown to the wanted item.
    const names = ["Short text", "Paragraph", "Number", "Checkbox", "Dropdown"];
    for (let i = 0; i < 6 && !(await active()).includes(type); i++) await press("ArrowDown");
    await press("Enter");
    await page.waitForSelector(`input[aria-label="Field label"]:focus`, { timeout: 3000 }).catch(() => {});
    await page.keyboard.press("Control+a"); await typeText(label); // newly added field's label input is autofocused
  }
  const labelsNow = () => page.$$eval('input[aria-label="Field label"]', (els) => els.map((e) => e.value));
  result.keyboard.orderAfterBuild = await labelsNow();
  // Reorder: move "Gamma" (3rd) to the top with Space, ArrowUp x2, Space.
  ok.reorderHandleFocus = await tabTo(/^Reorder Gamma$/);
  await press("Space"); await page.waitForTimeout(500);
  // dnd-kit sometimes ignores an arrow press while the previous move settles, so press until the live
  // region confirms the item is over the first field (counted in keystrokes), at most 6 times.
  const liveNow = () => page.evaluate(() => document.querySelector("[id^=DndLiveRegion]")?.textContent ?? "");
  result.keyboard.arrowPressesToMoveTwoPlaces = 0;
  for (let i = 0; i < 6 && !/moved over Alpha/.test(await liveNow()); i++) { await press("ArrowUp"); result.keyboard.arrowPressesToMoveTwoPlaces++; await page.waitForTimeout(500); }
  await press("Space"); await page.waitForTimeout(600);
  result.keyboard.orderAfterReorder = await labelsNow();
  ok.createFocus = await tabTo(/^Create event$/); // footer button (the trigger is behind the modal)
  await press("Enter");
  await page.waitForSelector(dialog, { state: "detached", timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const row = (await c.query(`select "formSchema" from "Event" where title='KB Test Event'`)).rows[0];
  result.keyboard.savedOrder = row ? row.formSchema.map((f) => f.label) : null;
  result.keyboard.focusStepsOk = ok;
  result.keyboard.keystrokes = keys;
  result.keyboard.mouseUsed = false;
  result.keyboard.elapsedMs = Date.now() - t0;
  result.keyboard.expectedFinalOrder = ["Gamma", "Alpha", "Beta"];
  result.keyboard.pass = JSON.stringify(result.keyboard.savedOrder) === JSON.stringify(result.keyboard.expectedFinalOrder);
  result.announcements.captured = await page.evaluate(() => window.__live);
  result.announcements.hasPickedUp = result.announcements.captured.some((t) => /Picked up Gamma/.test(t));
  result.announcements.hasMovedOver = result.announcements.captured.some((t) => /Gamma was moved over/.test(t));
  result.announcements.hasDropped = result.announcements.captured.some((t) => /Gamma was dropped/.test(t));
  const reg = await page.evaluate(() => [...document.querySelectorAll("[aria-live]")].map((e) => ({ id: e.id, role: e.getAttribute("role"), live: e.getAttribute("aria-live") })));
  result.announcements.liveRegions = reg;
  await c.query(`delete from "Event" where title = 'KB Test Event'`);
  await c.end();
  console.log("keyboard:", JSON.stringify(result.keyboard));
  console.log("announcements:", JSON.stringify(result.announcements));
  await ctx.close();
}
await browser.close();
save(out, { environment: { ...environment(await browserVersion()), axe: "axe-core 4.14.0, tags " + TAGS.join(",") }, ...result });
