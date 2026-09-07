"use strict";
// Isolated application/coverage tests. No network or database writes.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
globalThis.AsyncLocalStorage ??= require("node:async_hooks").AsyncLocalStorage;
const { NextRequest, NextResponse } = require("next/server");
const testing = require("next/experimental/testing/server");
const doesProxyMatch = testing.unstable_doesProxyMatch ?? testing.unstable_doesMiddlewareMatch;
const root = path.resolve(__dirname, "..");
let passed = 0;
function load(file, imports) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(out, { exports, require: (name) => { if (!(name in imports)) throw Error("Unexpected import " + name); return imports[name]; }, process: { env: {} }, console });
  return exports;
}
const catalog = load("src/lib/modules.ts", {});
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  await test("seven unique module IDs", () => assert.equal(new Set(catalog.MODULE_IDS).size, 7));
  for (const value of [null, {}, ["unknown"], ["pos", "pos"], [null]]) await test("reject invalid module payload " + JSON.stringify(value), () => assert.equal(catalog.isModuleList(value), false));
  await test("empty selection allowed", () => assert.equal(catalog.isModuleList([]), true));
  await test("core routes are not gated", () => { for (const p of ["/", "/settings", "/products", "/customers", "/suppliers", "/platform", "/pos-other"]) assert.equal(catalog.routeModule(p), null); });
  let options = {};
  const module = load("src/proxy.ts", {
    "@/lib/modules": catalog,
    "next/server": { NextResponse },
    "@supabase/ssr": { createServerClient: (_url, _key, config) => ({
      auth: { getUser: async () => { config.cookies.setAll([{ name: "test-session", value: "refreshed", options: { httpOnly: true } }]); return { data: { user: options.anonymous ? null : { id: "staff" } } }; }, signOut: async () => ({ error: null }) },
      rpc: async (name) => {
        if (name === "is_platform_admin") return { data: options.platform || false, error: null };
        if (name === "current_business_id") return { data: "business", error: null };
        if (name === "my_business_modules") return { data: options.modules ?? [], error: options.failure ? { message: "offline" } : null };
        throw Error("Unexpected RPC " + name);
      },
    }) },
  });
  const request = (url, method = "GET") => module.proxy(new NextRequest("https://example.test" + url, { method }));
  for (const id of catalog.MODULE_IDS) {
    await test(id + " page and descendants gated", async () => {
      options = {};
      for (const p of ["/" + id, "/" + id + "/new", "/" + id + "/export"]) {
        const response = await request(p);
        assert.equal(response.status, 303);
        assert.equal(new URL(response.headers.get("location")).pathname, "/module-unavailable");
        assert.equal(response.cookies.get("test-session").value, "refreshed");
        assert.equal(response.headers.get("cache-control"), "private, no-store");
      }
    });
    await test(id + " enabled works", async () => { options = { modules: [id] }; assert.equal((await request("/" + id)).headers.get("x-middleware-next"), "1"); });
    await test(id + " writes and API blocked", async () => { options = {}; assert.equal((await request("/" + id, "POST")).status, 403); assert.equal((await request("/api/" + id)).status, 403); });
    await test(id + " matcher includes extension paths", () => assert.equal(doesProxyMatch({ config: module.config, nextConfig: {}, url: "/" + id + "/fake.png" }), true));
  }
  await test("access lookup errors fail closed", async () => { options = { failure: true }; assert.equal((await request("/pos")).status, 503); });
  await test("malformed entitlements fail closed", async () => { options = { modules: ["fake"] }; assert.equal((await request("/pos")).status, 503); });
  await test("platform access retained", async () => { options = { platform: true }; assert.equal((await request("/platform/businesses/example/modules")).headers.get("x-middleware-next"), "1"); });
  await test("business staff cannot reach platform", async () => { options = {}; assert.equal((await request("/platform/businesses/example/modules")).status, 403); });
  await test("anonymous redirected to login", async () => { options = { anonymous: true }; assert.equal(new URL((await request("/pos")).headers.get("location")).pathname, "/login"); });
  await test("history and dashboard routes remain independent", async () => { options = { modules: ["reports", "accounting"] }; for (const p of ["/", "/reports", "/accounting"]) assert.equal((await request(p)).headers.get("x-middleware-next"), "1"); });
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/020_business_modules.sql"), "utf8");
  await test("all 27 SQL function bodies retain paired dollar delimiters", () => assert.equal([...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.\w+\s*\([\s\S]*?\bAS\s+(\$[a-z_]*\$)([\s\S]*?)\1\s*;/gi)].length, 27));
  await test("22 transaction RPC definitions guarded", () => assert.equal((sql.match(/PERFORM public.require_business_module\('/g) || []).length, 22));
  await test("22 live SQL definitions checked before replacement", () => assert.equal((sql.match(/Unexpected live definition for /g) || []).length, 22));
  await test("direct-write tables guarded", () => { for (const table of ["purchase_orders", "purchase_order_lines", "expense_categories"]) assert.ok(sql.includes("ON public." + table + "\n  FOR EACH ROW EXECUTE FUNCTION public.enforce_module_write")); });
  await test("no historical rows or read policies removed", () => { assert.doesNotMatch(sql, /\bdelete\s+from\b/i); assert.doesNotMatch(sql, /\bdrop\s+(?:table|view|policy)\b/i); assert.doesNotMatch(sql, /create\s+(?:or\s+replace\s+)?view/i); });
  await test("module writes serialize with disable", () => assert.ok(sql.includes("FOR SHARE")));
  await test("optimistic module revision enforced", () => assert.ok(sql.includes("modules_revision = p_expected_revision")));
  console.log(`\n${passed} isolated checks passed. PostgreSQL execution and live UI QA are separate checks.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
