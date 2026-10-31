#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.cwd(), "stls");
const UNIT = 50;

function stlBbox(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(80, true);
  if (n > 0 && 84 + n * 50 <= buf.length && buf.length - (84 + n * 50) < 4096) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const base = 84 + i * 50 + 12;
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          const v = dv.getFloat32(base + j * 12 + k * 4, true);
          if (v < mn[k]) mn[k] = v;
          if (v > mx[k]) mx[k] = v;
        }
      }
    }
    return { min: mn, max: mx };
  }
  const text = buf.toString("utf8");
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(text))) {
    for (let k = 0; k < 3; k++) {
      const v = Number(m[k + 1]);
      if (v < mn[k]) mn[k] = v;
      if (v > mx[k]) mx[k] = v;
    }
  }
  return { min: mn, max: mx };
}

function meshBbox(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x314d424d) throw new Error("mesh invalide");
  const nv = dv.getUint32(4, true);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let off = 16;
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) {
      const v = dv.getFloat32(off + k * 4, true);
      if (v < mn[k]) mn[k] = v;
      if (v > mx[k]) mx[k] = v;
    }
    off += 12;
  }
  return { min: mn, max: mx };
}

function bboxOf(file) {
  const buf = fs.readFileSync(file);
  return file.toLowerCase().endsWith(".mesh") ? meshBbox(buf) : stlBbox(buf);
}

for (const type of ["square", "base", "lite"]) {
  const dir = path.join(ROOT, type);
  if (!fs.existsSync(dir)) continue;
  const map = new Map();
  for (const name of fs.readdirSync(dir)) {
    const lower = name.toLowerCase();
    if (!lower.endsWith(".stl") && !lower.endsWith(".mesh")) continue;
    try {
      const bb = bboxOf(path.join(dir, name));
      const a = Math.round((bb.max[0] - bb.min[0]) / UNIT);
      const b = Math.round((bb.max[1] - bb.min[1]) / UNIT);
      if (a < 1 || b < 1) continue;
      const key = Math.min(a, b) + "x" + Math.max(a, b);
      const existing = map.get(key);
      if (!existing || lower.endsWith(".mesh")) {
        map.set(key, { key, a: Math.min(a, b), b: Math.max(a, b), file: name });
      }
    } catch (e) {
      console.warn("Ignoré :", name, e.message);
    }
  }
  const files = Array.from(map.values()).sort((x, y) => (x.a * x.b - y.a * y.b) || (x.a - y.a));
  if (!files.length) continue;
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ unit: UNIT, type, files }, null, 2));
  console.log(type + " : " + files.length + " tailles → " + path.join(dir, "manifest.json"));
}
