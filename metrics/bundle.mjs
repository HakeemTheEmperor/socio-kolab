// First-load JS per route (from Next's own route-bundle-stats.json) and the
// client-vs-server split of each route's source modules (static import graph).
// Usage: node metrics/bundle.mjs [outName]   (run after `next build`)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import ts from "typescript";

const out = process.argv[2] ?? "bundle";
const stats = JSON.parse(fs.readFileSync(".next/diagnostics/route-bundle-stats.json", "utf8"));
const SRC = path.resolve("src");
const exts = [".tsx", ".ts", "/index.tsx", "/index.ts"];

const resolveImport = (from, spec) => {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // package import
  for (const e of ["", ...exts]) { const p = base + e; if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; }
  return null;
};
const cache = new Map();
const parse = (file) => {
  if (cache.has(file)) return cache.get(file);
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const first = sf.statements[0];
  const isClient = !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use client";
  const isServerAction = sf.statements.slice(0, 3).some((st) => ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && st.expression.text === "use server");
  const imports = [], pkgs = [];
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && !(ts.isImportDeclaration(n) && n.importClause?.isTypeOnly)) {
      const r = resolveImport(file, n.moduleSpecifier.text); if (r) imports.push(r); else pkgs.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(n.arguments[0])) { const r = resolveImport(file, n.arguments[0].text); if (r) imports.push(r); }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const o = { isClient, isServerAction, imports, pkgs, bytes: Buffer.byteLength(text) };
  cache.set(file, o); return o;
};

/** Entry files for a route: the page/route handler plus every layout from app/ down to it. */
const isGroup = (f) => /^\(.+\)$/.test(f);
const isDyn = (f) => /^\[.+\]$/.test(f);
const subdirs = (d) => fs.readdirSync(d).filter((f) => fs.statSync(path.join(d, f)).isDirectory());
/** d plus (recursively) its route groups: they add no URL segment. */
const withGroups = (d) => [d, ...subdirs(d).filter(isGroup).flatMap((g) => withGroups(path.join(d, g)))];
const entriesFor = (route) => {
  const segs = route === "/" ? [] : route.split("/").filter(Boolean);
  const found = new Set();
  // Returns true when the segments below `dir` resolved to a page.
  const rec = (dir, i) => {
    const ds = withGroups(dir);
    let hit = false;
    const add = (f) => { if (fs.existsSync(f)) found.add(f); };
    if (i === segs.length) {
      for (const d of ds) for (const f of ["page.tsx", "route.ts"]) if (fs.existsSync(path.join(d, f))) { hit = true; add(path.join(d, f)); }
      if (hit) for (const d of ds) if (found.has(path.join(d, "page.tsx")) || found.has(path.join(d, "route.ts")) || d === dir) add(path.join(d, "layout.tsx"));
      return hit;
    }
    for (const d of ds) { const nd = path.join(d, segs[i]); if (fs.existsSync(nd) && rec(nd, i + 1)) { hit = true; add(path.join(d, "layout.tsx")); } }
    if (hit) add(path.join(dir, "layout.tsx"));
    if (!hit) for (const d of ds) for (const sub of subdirs(d).filter(isDyn)) if (rec(path.join(d, sub), i + 1)) { hit = true; add(path.join(d, "layout.tsx")); }
    if (hit) add(path.join(dir, "layout.tsx"));
    return hit;
  };
  rec(path.join(SRC, "app"), 0);
  // Layouts of every group that actually holds the page were added; a sibling group's layout was not.
  return [...found];
};

function split(route) {
  const entries = entriesFor(route);
  const mode = new Map(); // file -> "client" | "server"
  const stack = entries.map((f) => [f, false]);
  const clientRoots = new Set();
  while (stack.length) {
    const [f, underClient] = stack.pop();
    const info = parse(f);
    // A "use server" module is replaced by an RPC stub in the client bundle: it stays server-side.
    const client = info.isServerAction ? false : underClient || info.isClient;
    if (info.isClient && !underClient) clientRoots.add(f);
    const prev = mode.get(f);
    if (prev === "client" || (prev === "server" && !client)) continue;
    mode.set(f, client ? "client" : "server");
    for (const i of info.imports) stack.push([i, client]);
  }
  let c = 0, s = 0, cb = 0, sb = 0; const pk = new Set();
  for (const [f, m] of mode) { const i = parse(f); if (m === "client") { c++; cb += i.bytes; i.pkgs.forEach((p) => pk.add(p)); } else { s++; sb += i.bytes; } }
  return { entries: entries.map((e) => path.relative(SRC, e)), clientModules: c, serverModules: s, clientSrcBytes: cb, serverSrcBytes: sb, clientPct: +((100 * cb) / (cb + sb || 1)).toFixed(1), clientBoundaries: [...clientRoots].map((f) => path.relative(SRC, f)), clientPackages: [...pk].filter((p) => !p.startsWith("react")).sort() };
}

const gz = (p) => zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length;
const rows = stats.filter((r) => !/api|_not-found|_global/.test(r.route)).map((r) => {
  const chunks = r.firstLoadChunkPaths;
  const raw = chunks.reduce((a, p) => a + fs.statSync(p).size, 0);
  const gzip = chunks.reduce((a, p) => a + gz(p), 0);
  return { route: r.route, firstLoadRawBytes: r.firstLoadUncompressedJsBytes, summedChunkBytes: raw, firstLoadGzipBytes: gzip, chunks: chunks.length, ...split(r.route) };
}).sort((a, b) => a.route.localeCompare(b.route));
fs.mkdirSync("metrics/results/raw", { recursive: true });
fs.writeFileSync(`metrics/results/raw/${out}.json`, JSON.stringify(rows, null, 2));
const kb = (n) => (n / 1024).toFixed(1);
console.log("route".padEnd(34), "firstLoad(raw KB)", "gzip KB", " client/server modules", " client src%");
for (const r of rows) console.log(r.route.padEnd(34), kb(r.firstLoadRawBytes).padStart(9), kb(r.firstLoadGzipBytes).padStart(10), `${r.clientModules}/${r.serverModules}`.padStart(14), String(r.clientPct).padStart(10));
if (process.env.LIST) { const r = rows.find((x) => x.route === process.env.LIST); console.log(r.clientBoundaries, r.clientPackages); }
