import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8765/";

const cases = [
  {
    name: "680x540 square max6 edge stack (4x6x5 + 2x1x5)",
    input: { w: 680, d: 540, type: "square", maxSize: 6, edgeFill: true, symmetric: true, printMode: "stack", bedX: 350, bedY: 350, bedZ: 336 },
    expect: {
      mode: "stack", selectedPrintMode: "stack", grid: [13, 10], stackCount: 1, bins: 1,
      coreCounts: { "5x6": 4, "1x5": 2 },
      layers: [
        { core: [6, 5], physical: [315, 270], sym: 0, key: "edge:square:5x6:15,0,20,0" },
        { core: [6, 5], physical: [315, 270], sym: 0, key: "edge:square:5x6:15,0,20,0" },
        { core: [6, 5], physical: [315, 270], sym: 0, key: "edge:square:5x6:15,0,20,0" },
        { core: [6, 5], physical: [315, 270], sym: 0, key: "edge:square:5x6:15,0,20,0" },
        { core: [1, 5], physical: [50, 270], sym: 0, key: "edge:square:1x5:0,0,20,0" },
        { core: [1, 5], physical: [50, 270], sym: 0, key: "edge:square:1x5:0,0,20,0" }
      ]
    }
  },
  {
    name: "680x540 lite max5 edge: stack must be disabled",
    input: { w: 680, d: 540, type: "lite", maxSize: 5, edgeFill: true, symmetric: true, printMode: "stack", bedX: 320, bedY: 320, bedZ: 336 },
    expect: {
      mode: "beds", selectedPrintMode: "beds", grid: [13, 10], stackCount: 0, layers: []
    }
  },
  {
    name: "680x540 base max5 edge: stack must be disabled",
    input: { w: 680, d: 540, type: "base", maxSize: 5, edgeFill: true, symmetric: true, printMode: "stack", bedX: 320, bedY: 320, bedZ: 336 },
    expect: { mode: "beds", selectedPrintMode: "beds", grid: [13, 10], stackCount: 0, layers: [] }
  },
  {
    name: "680x540 square max5 edge stack (4x5x5 + 2x3x5)",
    input: { w: 680, d: 540, type: "square", maxSize: 5, edgeFill: true, symmetric: true, printMode: "stack", bedX: 320, bedY: 320, bedZ: 336 },
    expect: {
      mode: "stack", selectedPrintMode: "stack", grid: [13, 10], stackCount: 1, bins: 1,
      coreCounts: { "5x5": 4, "3x5": 2 },
      layers: [
        { core: [5, 5], physical: [265, 270], sym: 0, key: "edge:square:5x5:15,0,20,0" },
        { core: [5, 5], physical: [265, 270], sym: 0, key: "edge:square:5x5:15,0,20,0" },
        { core: [5, 5], physical: [265, 270], sym: 0, key: "edge:square:5x5:15,0,20,0" },
        { core: [5, 5], physical: [265, 270], sym: 0, key: "edge:square:5x5:15,0,20,0" },
        { core: [3, 5], physical: [150, 270], sym: 0, key: "edge:square:3x5:0,0,20,0" },
        { core: [3, 5], physical: [150, 270], sym: 0, key: "edge:square:3x5:0,0,20,0" }
      ]
    }
  }
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"]
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const failures = [];

for (const testCase of cases) {
  try {
    await page.goto(APP_URL + "?v=tdd-" + Date.now(), { waitUntil: "load" });
    await page.evaluate((input) => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set("w", input.w); set("d", input.d); set("clearance", 2); set("maxSize", input.maxSize);
      set("bedX", input.bedX); set("bedY", input.bedY); set("bedZ", input.bedZ);
      const type = document.getElementById("ptype"); type.value = input.type; type.dispatchEvent(new Event("change", { bubbles: true }));
      set("printMode", input.printMode); set("stackGap", 0.2); set("clipType", "none");
      const edge = document.getElementById("edgeFill"); edge.checked = input.edgeFill; edge.dispatchEvent(new Event("change", { bubbles: true }));
      const sym = document.getElementById("symmetric"); sym.checked = input.symmetric; sym.dispatchEvent(new Event("change", { bubbles: true }));
    }, testCase.input);
    await new Promise((r) => setTimeout(r, 500));
    await page.waitForFunction(() => {
      const status = document.getElementById("serverState");
      return status && /disponibles/.test(status.textContent);
    }, { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));
    const result = await page.evaluate(() => {
      const layout = window.__spg.layout();
      const pack = window.__spg.pack();
      if (!layout || !layout.ok || !pack || pack.error) return { error: layout ? (layout.reason || pack.error) : "no layout" };
      const stack = pack.stacks && pack.stacks[0];
      const coreCounts = {};
      layout.pieces.forEach((p) => {
        const key = Math.min(p.w, p.h) + "x" + Math.max(p.w, p.h);
        coreCounts[key] = (coreCounts[key] || 0) + 1;
      });
      const layers = (stack ? stack.items : []).map((layer) => ({
        core: [layer.item.cw, layer.item.ch],
        physical: [layer.w, layer.h],
        sym: layer.sym,
        key: layer.item.printKey,
        dx: layer.dx,
        dy: layer.dy,
        gx: layer.gx,
        gy: layer.gy
      }));
      return {
        error: null,
        mode: pack.mode,
        selectedPrintMode: window.__spg.state().printMode,
        grid: [layout.cols, layout.rows],
        coreCounts,
        stackCount: pack.stacks ? pack.stacks.length : 0,
        bins: pack.bins.length,
        layers
      };
    });
    assert.ifError(result.error);
    if (testCase.expect.mode) assert.equal(result.mode, testCase.expect.mode, "mode");
    if (testCase.expect.selectedPrintMode) assert.equal(result.selectedPrintMode, testCase.expect.selectedPrintMode, "selected printMode");
    assert.deepEqual(result.grid, testCase.expect.grid, "grid");
    if (testCase.expect.stackCount !== undefined) assert.equal(result.stackCount, testCase.expect.stackCount, "stackCount");
    if (testCase.expect.bins !== undefined) assert.equal(result.bins, testCase.expect.bins, "bins");
    if (testCase.expect.coreCounts) assert.deepEqual(result.coreCounts, testCase.expect.coreCounts, "coreCounts");
    assert.equal(result.layers.length, (testCase.expect.layers || []).length, "layer count");
    for (let i = 0; i < (testCase.expect.layers || []).length; i++) {
      const got = result.layers[i];
      const want = testCase.expect.layers[i];
      assert.deepEqual(got.core, want.core, "layer " + (i + 1) + " core");
      assert.deepEqual(got.physical, want.physical, "layer " + (i + 1) + " physical");
      assert.equal(got.sym, want.sym, "layer " + (i + 1) + " sym");
      if (want.key) assert.equal(got.key, want.key, "layer " + (i + 1) + " printKey");
      if (i > 0) {
        const prev = result.layers[i - 1];
        assert.ok(got.dx >= -1e-6 && got.dy >= -1e-6, "layer " + (i + 1) + " outside base");
        assert.ok(got.dx + got.physical[0] <= prev.dx + prev.physical[0] + 1e-6, "layer " + (i + 1) + " right overhang");
        assert.ok(got.dy + got.physical[1] <= prev.dy + prev.physical[1] + 1e-6, "layer " + (i + 1) + " top overhang");
      }
    }
    console.log("PASS", testCase.name);
  } catch (e) {
    failures.push({ name: testCase.name, error: e.message });
    console.error("FAIL", testCase.name, "\n  " + e.message);
  }
}
await browser.close();
if (failures.length) {
  console.error("\n" + failures.length + " TEST(S) FAILED");
  process.exit(1);
}
console.log("\nALL EXPECTED TESTS PASSED");
