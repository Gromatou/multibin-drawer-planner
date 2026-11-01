import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8765/";
const OUT = path.resolve("tests/out");
fs.mkdirSync(OUT, { recursive: true });

const types = ["lite", "square"];
const dims = [[680, 540], [551, 351], [500, 300], [750, 550], [900, 600], [400, 400]];
const cases = [];
let n = 0;
function add(opts) {
  n++;
  cases.push(Object.assign({
    id: String(n).padStart(3, "0"),
    type: "lite", w: 680, d: 540, max: 5, sym: true, edge: true,
    mode: "stack", clip: "none", gap: 0.2
  }, opts));
}
for (const type of types) {
  for (const [w, d] of dims) {
    for (const sym of [true, false]) {
      add({ type, w, d, sym, edge: true, mode: "stack" });
      if ((w === 680 && d === 540) || (w === 551 && d === 351)) {
        add({ type, w, d, sym, edge: false, mode: "stack" });
      }
      if (w === 680 && d === 540) {
        add({ type, w, d, sym, edge: true, mode: "beds" });
      }
    }
  }
}
add({ type: "square", w: 680, d: 540, sym: true, edge: true, mode: "stack", clip: "s" });
add({ type: "lite", w: 680, d: 540, sym: true, edge: true, mode: "stack", clip: "s" });
add({ type: "lite", w: 680, d: 540, sym: true, edge: true, mode: "stack", max: 4 });
add({ type: "square", w: 680, d: 540, sym: true, edge: true, mode: "stack", max: 6 });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE", m.text()); });

async function setCase(c) {
  await page.goto(APP_URL + "?v=matrix-" + Date.now(), { waitUntil: "load" });
  await page.evaluate((c) => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("w", c.w); set("d", c.d); set("clearance", 2); set("maxSize", c.max);
    set("bedX", 320); set("bedY", 320); set("bedZ", 350);
    set("printMode", c.mode); set("stackGap", c.gap); set("clipType", c.clip);
    const es = document.getElementById("edgeFill"); es.checked = !!c.edge; es.dispatchEvent(new Event("change", { bubbles: true }));
    const sy = document.getElementById("symmetric"); sy.checked = !!c.sym; sy.dispatchEvent(new Event("change", { bubbles: true }));
    const t = document.getElementById("ptype"); t.value = c.type; t.dispatchEvent(new Event("change", { bubbles: true }));
  }, c);
  await new Promise((r) => setTimeout(r, 1800));
}

async function info() {
  return await page.evaluate(() => {
    const layout = window.__spg.layout();
    const pack = window.__spg.pack();
    if (!layout || !pack || pack.error) return { ok: false, error: layout ? (layout.reason || pack.error) : "no layout" };
    const unit = layout.unit;
    const checks = [];
    const stacks = [];
    if (pack.mode === "stack") {
      for (let bi = 0; bi < pack.bins.length; bi++) {
        pack.bins[bi].items.filter((it) => it.item.stack).forEach((it) => {
          const stack = it.item.stack;
          let below = { x: it.x, y: it.y, w: it.w, h: it.h };
          let baseCoreX = it.x + stack.base.gx;
          let baseCoreY = it.y + stack.base.gy;
          stack.items.forEach((pi, idx) => {
            const pw = pi.coreRot ? pi.item.h : pi.item.w;
            const ph = pi.coreRot ? pi.item.w : pi.item.h;
            const x = it.x + (pi.dx || 0);
            const y = it.y + (pi.dy || 0);
            const coreX = x + (pi.gx || 0);
            const coreY = y + (pi.gy || 0);
            const cOffX = Math.abs((coreX - baseCoreX) / unit - Math.round((coreX - baseCoreX) / unit));
            const cOffY = Math.abs((coreY - baseCoreY) / unit - Math.round((coreY - baseCoreY) / unit));
            const over = {
              left: Math.max(0, below.x - x),
              right: Math.max(0, (x + pw) - (below.x + below.w)),
              bottom: Math.max(0, below.y - y),
              top: Math.max(0, (y + ph) - (below.y + below.h))
            };
            stacks.push({
              pile: bi, layer: idx + 1, size: [pi.item.cw, pi.item.ch], physical: [pw, ph],
              sym: pi.sym || 0, coreRot: pi.coreRot || 0,
              coreOffset: [coreX - baseCoreX, coreY - baseCoreY],
              gridAligned: cOffX < 0.02 && cOffY < 0.02,
              overhang: over,
              overhangMax: Math.max(over.left, over.right, over.bottom, over.top)
            });
            below = { x, y, w: pw, h: ph };
          });
        });
      }
    }
    return {
      ok: true, mode: pack.mode, bins: pack.bins.length, stacks: pack.stacks ? pack.stacks.length : 0,
      plates: layout.pieces.length, clips: pack.clipCount || 0, stacksDetail: stacks
    };
  });
}

async function shoot(c, suffix, topdown) {
  await page.$eval("#view3dWrap", (el) => el.scrollIntoView({ block: "center" }));
  await new Promise((r) => setTimeout(r, 200));
  if (topdown) {
    const canvas = await page.$("#view3dWrap canvas");
    if (!canvas) return;
    const box = await canvas.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx, cy + 250, { steps: 15 }); await page.mouse.up();
    await new Promise((r) => setTimeout(r, 300));
  }
  const el = await page.$("#view3dWrap");
  await el.screenshot({ path: path.join(OUT, c.id + "-" + suffix + ".png") });
}

const report = [];
for (const c of cases) {
  const t0 = Date.now();
  try {
    await setCase(c);
    const before = await info();
    await page.evaluate(() => document.getElementById("view3dBtn").click());
    await page.waitForFunction(() => document.querySelectorAll("#view3dWrap canvas").length > 0, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1800));
    await shoot(c, "3d", false);
    await shoot(c, "top", true);
    const data = { ...c, ...before, ok: before.ok !== false, files: [c.id + "-3d.png", c.id + "-top.png"], ms: Date.now() - t0 };
    report.push(data);
    const layers = before.mode === "stack" ? (before.stacks || 0) : 0;
    const bad = (before.stacksDetail || []).filter((s) => !s.gridAligned || s.overhangMax > 0.01);
    console.log(c.id, c.type, c.w + "x" + c.d, "sym=" + c.sym, "edge=" + c.edge, c.mode, "layers=" + layers, data.ok ? "ok" : "ERR", "alignBad=" + bad.length, (Date.now() - t0) + "ms");
  } catch (e) {
    report.push({ ...c, ok: false, error: e.message, ms: Date.now() - t0 });
    console.error(c.id, "FAIL", e.message);
  }
}
await browser.close();

// Pull detailed stack checks per case from a second lightweight evaluation is not possible after close;
// the images + report are the artifacts. Re-run checks are embedded below in report.json generation
// by reading the detailed stacks if present.
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log("WROTE", path.join(OUT, "report.json"), "cases", report.length);
