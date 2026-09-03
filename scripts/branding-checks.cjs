/* Local isolated tests. No network, credentials, or database writes. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const sharp = require("sharp");
const root = path.resolve(__dirname, "..");
function moduleFrom(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }}).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Buffer, File, FormData, URL, process: { env: {} },
    require: (id) => {
      if (id === "server-only") return {};
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === "sharp" || id === "node:crypto") return require(id);
      throw new Error("Unexpected dependency: " + id);
    },
  }, { filename: file });
  return exports;
}
const branding = moduleFrom("src/lib/branding.ts");
const logo = moduleFrom("src/lib/platform/logo.ts", { "@/lib/branding": branding });
const id = "11111111-1111-4111-8111-111111111111";
const version = "2026-09-03T10:00:00+00:00";
let count = 0;
async function check(name, fn) {
  await fn(); count++; console.log("PASS " + name);
}
function fixture(overrides = {}) {
  const form = new FormData();
  Object.entries({ id, version, name: "Test Business", phone: "", email: "", address: "",
    primary_color: "#1d4ed8", accent_color: "#2563eb", active: "on", ...overrides
  }).forEach(([key, value]) => { if (value !== null) form.set(key, value); });
  return form;
}
function actions(options = {}) {
  const calls = [];
  const exports = moduleFrom("src/app/platform/businesses/[id]/actions.ts", {
    "@/lib/branding": branding,
    "@/lib/platform/logo": { normalizeLogo: async () => Buffer.from("test") },
    "@/lib/platform/access": { requirePlatformAccess: async () => {
      if (options.deny) throw new Error("DENIED");
      return { rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === "platform_get_business") return { data: { id, updated_at: options.stale ? "old" : version }, error: null };
        return { error: options.code ? { code: options.code } : null };
      }};
    }},
    "next/cache": { revalidatePath: () => calls.push({ name: "revalidate" }) },
    "next/navigation": { redirect: (url) => { throw new Error("REDIRECT " + url); } },
    "@supabase/supabase-js": { createClient: () => { throw new Error("Network forbidden in tests"); } },
  });
  return { ...exports, calls };
}
(async () => {
  await check("dark theme uses white text", () => assert.equal(branding.themeText("#1d4ed8", "#2563eb"), "#ffffff"));
  await check("light theme uses black text", () => assert.equal(branding.themeText("#eeeeee", "#ffffff"), "#000000"));
  await check("unreadable gradient rejected", () => assert.equal(branding.themeText("#000000", "#ffffff"), null));
  await check("gradient interior contrast checked", () => assert.equal(branding.themeText("#ee4400", "#00aa00"), null));
  await check("CSS injection rejected", () => assert.equal(branding.themeText("red;display:none", "#ffffff"), null));
  await check("valid public logo URL", () => assert.match(branding.logoUrl("https://example.supabase.co", id + "/" + id + ".webp"), /object\/public\/infoaxon-business-logos/));
  await check("path traversal rejected", () => assert.equal(branding.logoUrl("https://example.supabase.co", "../secret"), null));
  await check("invalid base URL safely ignored", () => assert.equal(branding.logoUrl("not a url", id + "/" + id + ".webp"), null));
  await check("insecure remote logo host rejected", () => assert.equal(branding.logoUrl("http://example.com", id + "/" + id + ".webp"), null));
  for (const format of ["png", "jpeg", "webp"]) {
    await check(format + " normalized and resized", async () => {
      const input = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#334455" } })[format]().toBuffer();
      const output = await logo.normalizeLogo(new File([input], "logo." + format, { type: "image/" + format }));
      const meta = await sharp(output).metadata();
      assert.equal(meta.format, "webp"); assert.equal(meta.width, 512);
      assert.ok(meta.height <= 512); assert.ok(!meta.exif); assert.ok(!meta.xmp);
    });
  }
  await check("SVG disguised as PNG rejected", async () => assert.rejects(logo.normalizeLogo(new File(["<svg/>"], "logo.png", { type: "image/png" }))));
  await check("oversized logo rejected", async () => assert.rejects(logo.normalizeLogo(new File([Buffer.alloc(524289)], "logo.png", { type: "image/png" }))));
  await check("empty logo rejected", async () => assert.rejects(logo.normalizeLogo(new File([], "logo.png", { type: "image/png" }))));
  await check("wrong MIME rejected", async () => assert.rejects(logo.normalizeLogo(new File(["anything"], "logo.gif", { type: "image/gif" }))));
  await check("pixel limit enforced", async () => {
    const input = await sharp({ create: { width: 4001, height: 4001, channels: 3, background: "#fff" } }).png().toBuffer();
    assert.ok(input.length < 524288);
    await assert.rejects(logo.normalizeLogo(new File([input], "large.png", { type: "image/png" })));
  });
  await check("details authorize before any RPC", async () => {
    const a = actions({ deny: true }); await assert.rejects(a.saveDetails({}, fixture()), /DENIED/); assert.equal(a.calls.length, 0);
  });
  await check("logo authorizes before any RPC", async () => {
    const a = actions({ deny: true }); await assert.rejects(a.saveLogo({}, fixture()), /DENIED/); assert.equal(a.calls.length, 0);
  });
  for (const invalid of [{ id: "bad" }, { version: "bad" }, { name: "x" }, { email: "bad" }, { primary_color: "red" }]) {
    await check("invalid details " + Object.keys(invalid)[0], async () => {
      const a = actions(); assert.ok((await a.saveDetails({}, fixture(invalid))).error); assert.equal(a.calls.length, 0);
    });
  }
  await check("unreadable colors blocked before RPC", async () => {
    const a = actions(); assert.ok((await a.saveDetails({}, fixture({ primary_color: "#000000", accent_color: "#ffffff" }))).error); assert.equal(a.calls.length, 0);
  });
  await check("deactivation confirmation required", async () => {
    const a = actions(); assert.ok((await a.saveDetails({}, fixture({ active: null }))).error); assert.equal(a.calls.length, 0);
  });
  await check("confirmed deactivation saves false", async () => {
    const a = actions(); await assert.rejects(a.saveDetails({}, fixture({ active: null, confirmInactive: "yes" })), /REDIRECT/);
    assert.equal(a.calls[0].args.p_active, false);
  });
  await check("concurrent details update rejected", async () => {
    const a = actions({ code: "40001" }); assert.match((await a.saveDetails({}, fixture())).error, /another tab/); assert.equal(a.calls.length, 1);
  });
  await check("revoked database permission reported", async () => {
    const a = actions({ code: "42501" }); assert.match((await a.saveDetails({}, fixture())).error, /no longer/);
  });
  await check("valid details preserve expected version", async () => {
    const a = actions(); await assert.rejects(a.saveDetails({}, fixture()), /REDIRECT/); assert.equal(a.calls[0].args.p_expected_updated_at, version);
  });
  await check("stale logo does not upload or save", async () => {
    const a = actions({ stale: true }); assert.match((await a.saveLogo({}, fixture({ removeLogo: "yes" }))).error, /another tab/); assert.equal(a.calls.length, 1);
  });
  await check("logo removal only clears reference", async () => {
    const a = actions(); await assert.rejects(a.saveLogo({}, fixture({ removeLogo: "yes" })), /REDIRECT/);
    assert.equal(a.calls[1].name, "platform_set_business_logo"); assert.equal(a.calls[1].args.p_logo_path, null);
  });
  await check("missing file rejected", async () => {
    const a = actions(); assert.match((await a.saveLogo({}, fixture())).error, /Choose/); assert.equal(a.calls.length, 1);
  });
  console.log(count + " checks passed. Live database/RLS and browser QA remain required.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
