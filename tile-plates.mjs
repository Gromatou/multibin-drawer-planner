import fs from 'fs';
import path from 'path';
import Module from 'manifold-3d';

const wasm = await Module();
wasm.setup();
const { Manifold, Mesh } = wasm;

const REF_DIR = process.env.MB_REFS || path.join(process.cwd(), 'refs');
const OUT = path.join(process.cwd(), 'stls');
const X1 = 37.5;
const X2 = 87.5;

function readStl(file) {
  const buf = fs.readFileSync(file);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(80, true);
  if (84 + n * 50 !== buf.length) throw new Error('STL non binaire : ' + file);
  const map = new Map();
  const verts = [];
  const tris = new Uint32Array(n * 3);
  let vi = 0;
  for (let i = 0; i < n; i++) {
    const base = 84 + i * 50 + 12;
    for (let j = 0; j < 3; j++) {
      const x = dv.getFloat32(base + j * 12, true);
      const y = dv.getFloat32(base + j * 12 + 4, true);
      const z = dv.getFloat32(base + j * 12 + 8, true);
      const key = x.toFixed(4) + ',' + y.toFixed(4) + ',' + z.toFixed(4);
      let id = map.get(key);
      if (id === undefined) { id = vi++; map.set(key, id); verts.push(x, y, z); }
      tris[i * 3 + j] = id;
    }
  }
  return new Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: tris });
}

function writeStl(file, manifold) {
  const mesh = manifold.getMesh();
  const vp = mesh.vertProperties;
  const tv = mesh.triVerts;
  const n = tv.length / 3;
  const out = Buffer.alloc(84 + n * 50);
  out.write('Binary STL - Square Plate Generator', 0, 'ascii');
  out.writeUInt32LE(n, 80);
  let off = 84;
  for (let i = 0; i < n; i++) {
    const a = tv[i * 3], b = tv[i * 3 + 1], c = tv[i * 3 + 2];
    const ax = vp[a * 3], ay = vp[a * 3 + 1], az = vp[a * 3 + 2];
    const bx = vp[b * 3], by = vp[b * 3 + 1], bz = vp[b * 3 + 2];
    const cx = vp[c * 3], cy = vp[c * 3 + 1], cz = vp[c * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    out.writeFloatLE(nx, off); out.writeFloatLE(ny, off + 4); out.writeFloatLE(nz, off + 8);
    out.writeFloatLE(ax, off + 12); out.writeFloatLE(ay, off + 16); out.writeFloatLE(az, off + 20);
    out.writeFloatLE(bx, off + 24); out.writeFloatLE(by, off + 28); out.writeFloatLE(bz, off + 32);
    out.writeFloatLE(cx, off + 36); out.writeFloatLE(cy, off + 40); out.writeFloatLE(cz, off + 44);
    off += 50;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
}

function writeMesh(file, manifold) {
  const mesh = manifold.getMesh();
  const vp = mesh.vertProperties;
  const tv = mesh.triVerts;
  const nv = Math.floor(vp.length / 3);
  const nt = Math.floor(tv.length / 3);
  const out = Buffer.alloc(16 + nv * 12 + nt * 12);
  out.write('MBM1', 0, 'ascii');
  out.writeUInt32LE(nv, 4);
  out.writeUInt32LE(nt, 8);
  out.writeUInt32LE(0, 12);
  let off = 16;
  for (let i = 0; i < nv * 3; i++) { out.writeFloatLE(vp[i], off); off += 4; }
  for (let i = 0; i < nt * 3; i++) { out.writeUInt32LE(tv[i], off); off += 4; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
}

function buildSlabs(base) {
  const bb = base.boundingBox();
  const y1 = X1, y2 = X2;
  const xs = [bb.min[0], X1, X2, bb.max[0]];
  const ys = [bb.min[1], y1, y2, bb.max[1]];
  const h = bb.max[2] - bb.min[2] + 2;
  const slabs = {};
  const rolesX = ['left', 'mid', 'right'];
  const rolesY = ['bottom', 'mid', 'top'];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const x0 = xs[i], x3 = xs[i + 1], y0 = ys[j], y3 = ys[j + 1];
      const box = Manifold.cube([x3 - x0, y3 - y0, h]).translate([x0, y0, bb.min[2] - 1]);
      const slab = Manifold.intersection(base, box);
      slabs[rolesX[i] + '/' + rolesY[j]] = {
        mesh: slab,
        x0, y0, w: x3 - x0, d: y3 - y0
      };
    }
  }
  return { slabs, bb, xs, ys, wLeft: xs[1] - xs[0], wMid: xs[2] - xs[1], wRight: xs[3] - xs[2],
           dBottom: ys[1] - ys[0], dMid: ys[2] - ys[1], dTop: ys[3] - ys[2] };
}

function rolesFor(n, outerA, mid) {
  if (n < 2) throw new Error('min 2');
  if (n === 2) return [outerA, outerA === 'left' ? 'right' : 'top'];
  return [outerA, ...Array(n - 2).fill(mid), outerA === 'left' ? 'right' : 'top'];
}

function tile(slabsInfo, n, m) {
  const { slabs, wLeft, wMid, wRight, dBottom, dMid, dTop } = slabsInfo;
  const xr = rolesFor(n, 'left', 'mid');
  const yr = rolesFor(m, 'bottom', 'mid');
  const xw = { left: wLeft, mid: wMid, right: wRight };
  const yw = { bottom: dBottom, mid: dMid, top: dTop };
  const xOff = []; let acc = 0;
  for (const r of xr) { xOff.push(acc); acc += xw[r]; }
  const yOff = []; acc = 0;
  for (const r of yr) { yOff.push(acc); acc += yw[r]; }
  const rows = [];
  for (let j = 0; j < yr.length; j++) {
    const rowParts = [];
    for (let i = 0; i < xr.length; i++) {
      const slab = slabs[xr[i] + '/' + yr[j]];
      rowParts.push(slab.mesh.translate([xOff[i] - slab.x0, yOff[j] - slab.y0, 0]));
    }
    const row = Manifold.union(rowParts);
    rowParts.forEach(function (p) { p.delete(); });
    rows.push(row);
  }
  let out = Manifold.union(rows);
  rows.forEach(function (r) { r.delete(); });
  const shifted = out.translate([0, 0, -slabsInfo.bb.min[2]]);
  out.delete();
  return shifted;
}

const jobs = [
  { name: 'base', file: path.join(REF_DIR, '3x3 CU - Multibin Base Plate.stl'), type: 'base', label: 'CU - Multibin Base Plate', out: path.join(OUT, 'base'), unit: 'CU' },
  { name: 'lite', file: path.join(REF_DIR, '3x3 LU - Lite MultiBin Panel.stl'), type: 'lite', label: 'LU - Lite MultiBin Panel', out: path.join(OUT, 'lite'), unit: 'LU' }
];

for (const job of jobs) {
  console.log('\n====', job.name);
  const mesh = readStl(job.file);
  const base = new Manifold(mesh);
  const bb = base.boundingBox();
  console.log('base volume', base.volume(), 'bbox', bb);
  const info = buildSlabs(base);
  const re3 = tile(info, 3, 3);
  console.log('3x3 volume diff', re3.volume() - base.volume(), 'bbox', re3.boundingBox());
  const manifest = [];
  for (let a = 2; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      const t0 = Date.now();
      const m = tile(info, a, b);
      const fileName = a + 'x' + b + ' ' + job.unit + ' - ' + (job.type === 'base' ? 'Multibin Base Plate' : 'Lite MultiBin Panel') + '.stl';
      writeStl(path.join(job.out, fileName), m);
      const meshName = fileName.replace(/\.stl$/i, '.mesh');
      writeMesh(path.join(job.out, meshName), m);
      manifest.push({ key: a + 'x' + b, a, b, file: meshName });
      console.log('✅', a + 'x' + b, 'volume', Math.round(m.volume()), 'facets', m.numTri(), (Date.now() - t0) + 'ms');
      m.delete();
    }
  }
  fs.writeFileSync(path.join(job.out, 'manifest.json'), JSON.stringify({ unit: 50, type: job.type, files: manifest }, null, 2));
  console.log('manifest', path.join(job.out, 'manifest.json'), 'files', manifest.length);
}
