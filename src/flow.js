// Exploitation du champ de vitesse : echantillonnage, particules, cisaillement, trajectoire de vol.
import * as THREE from 'three';
import { makeFieldFn, specimenBox } from './tpms.js';
import { turbo } from './format.js';

export const MU = 0.75e-3; // viscosite du milieu de culture a 37 degres (Pa.s)

export class FlowField {
  constructor(F, params) {
    Object.assign(this, F);
    this.params = params;
    this.box = specimenBox(params.shape);
    this.fn = makeFieldFn(params);
    let s = 0;
    for (let i = 0; i < this.uz.length; i++) s += this.uz[i];
    this.meanLat = s / this.uz.length;
    this.setInlet(params.flow.inlet);
    let m = 0;
    for (let i = 0; i < this.uz.length; i++) {
      const v = Math.hypot(this.ux[i], this.uy[i], this.uz[i]);
      if (v > m) m = v;
    }
    this.maxLat = m;
    // Tortuosite hydraulique (Koponen) : somme des normes / somme de la composante motrice.
    let sn = 0, sz = 0;
    for (let i = 0; i < this.uz.length; i++) { sn += Math.hypot(this.ux[i], this.uy[i], this.uz[i]); sz += this.uz[i]; }
    this.tortuosity = sz > 0 ? sn / sz : NaN;
  }
  setInlet(v) { this.scale = this.meanLat > 0 ? v / this.meanLat : 0; }
  get maxPhys() { return this.maxLat * this.scale; }
  // vitesse physique (mm/s) par interpolation trilineaire, periodique
  sample(x, y, z, out) {
    const { nx, ny, nz, size, ux, uy, uz } = this;
    const fx = (x / size[0]) * nx - 0.5, fy = (y / size[1]) * ny - 0.5, fz = (z / size[2]) * nz - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
    const tx = fx - i0, ty = fy - j0, tz = fz - k0;
    let ax = 0, ay = 0, az = 0;
    for (let c = 0; c < 8; c++) {
      const di = c & 1, dj = (c >> 1) & 1, dk = (c >> 2) & 1;
      const i = (((i0 + di) % nx) + nx) % nx, j = (((j0 + dj) % ny) + ny) % ny, k = (((k0 + dk) % nz) + nz) % nz;
      const w = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty) * (dk ? tz : 1 - tz);
      const p = i + j * nx + k * nx * ny;
      ax += w * ux[p]; ay += w * uy[p]; az += w * uz[p];
    }
    out[0] = ax * this.scale; out[1] = ay * this.scale; out[2] = az * this.scale;
    return out;
  }
  isFluid(x, y, z) {
    if (this.fn.sdf(x, y, z) > 0) return false;
    return this.fn.value(x, y, z) >= 0;
  }
  cellSize() { return this.size[0] / this.nx; }
}

// Particules tracantes, dessinees comme de courtes trainees colorees par la vitesse.
export class Particles {
  constructor(count) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    this.verts = new Float32Array(count * 6);
    this.cols = new Float32Array(count * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.verts, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.cols, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.object = new THREE.LineSegments(geo, this.mat);
    this.object.frustumCulled = false;
    this.field = null;
    this.tmp = new Float32Array(3);
  }
  setField(field) {
    const first = !this.field;
    this.field = field;
    if (first) for (let i = 0; i < this.count; i++) this.spawn(i, false);
  }
  spawn(i, atInlet) {
    const f = this.field, [X, Y, Z] = f.box;
    for (let tries = 0; tries < 40; tries++) {
      const x = Math.random() * X, y = Math.random() * Y, z = atInlet ? Math.random() * Z * 0.08 : Math.random() * Z;
      if (!f.isFluid(x, y, z)) continue;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.life[i] = 4 + Math.random() * 10;
      return;
    }
    this.life[i] = 0.1;
  }
  update(dt, speedFactor, trail) {
    const f = this.field;
    if (!f) return;
    const [X, Y, Z] = f.box;
    const vmax = Math.max(f.maxPhys * 0.85, 1e-9);
    const v = this.tmp;
    const h = dt * speedFactor;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      let x = this.pos[o], y = this.pos[o + 1], z = this.pos[o + 2];
      // Runge-Kutta 2
      f.sample(x, y, z, v);
      const mx = x + v[0] * h * 0.5, my = y + v[1] * h * 0.5, mz = z + v[2] * h * 0.5;
      f.sample(mx, my, mz, v);
      x += v[0] * h; y += v[1] * h; z += v[2] * h;
      this.life[i] -= dt;
      let sp = Math.hypot(v[0], v[1], v[2]);
      const out = z > Z || z < 0 || x < 0 || x > X || y < 0 || y > Y || f.fn.sdf(x, y, z) > 0;
      if (out || this.life[i] <= 0 || (sp < vmax * 0.01 && Math.random() < 0.02)) {
        this.spawn(i, z > Z);
        x = this.pos[o]; y = this.pos[o + 1]; z = this.pos[o + 2];
        f.sample(x, y, z, v);
        // vitesse du nouveau point : sinon une trainee demesuree apparait a la reapparition
        sp = Math.hypot(v[0], v[1], v[2]);
      }
      this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
      const t = Math.min(1, sp / vmax);
      const len = trail * (0.3 + t) / Math.max(sp, 1e-9);
      const b = i * 6;
      this.verts[b] = x; this.verts[b + 1] = y; this.verts[b + 2] = z;
      this.verts[b + 3] = x - v[0] * len; this.verts[b + 4] = y - v[1] * len; this.verts[b + 5] = z - v[2] * len;
      const c = particleColor(t);
      this.cols[b] = c[0]; this.cols[b + 1] = c[1]; this.cols[b + 2] = c[2];
      this.cols[b + 3] = c[0] * 0.05; this.cols[b + 4] = c[1] * 0.05; this.cols[b + 5] = c[2] * 0.05;
    }
    this.object.geometry.attributes.position.needsUpdate = true;
    this.object.geometry.attributes.color.needsUpdate = true;
  }
  dispose() { this.object.geometry.dispose(); this.mat.dispose(); }
}

function particleColor(t) {
  // bleu profond -> cyan -> blanc chaud selon la vitesse
  const a = [0.1, 0.25, 1.0], b = [0.2, 0.9, 1.0], c = [1.0, 0.92, 0.8];
  t = Math.pow(t, 0.8);
  if (t < 0.6) { const s = t / 0.6; return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]; }
  const s = (t - 0.6) / 0.4;
  return [b[0] + (c[0] - b[0]) * s, b[1] + (c[1] - b[1]) * s, b[2] + (c[2] - b[2]) * s];
}

// Cisaillement parietal estime : tau = mu * |u(paroi + d n)| / d.
export const WSS_RANGE = [-3.5, -1.5]; // log10 du cisaillement en Pa : 0,3 mPa a 30 mPa
export function wallShear(positions, normals, field, low, high) {
  const n = positions.length / 3;
  const d = field.cellSize();
  const colors = new Float32Array(n * 3);
  const v = new Float32Array(3);
  const vals = new Float32Array(n);
  let inWin = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    field.sample(positions[o] + normals[o] * d, positions[o + 1] + normals[o + 1] * d, positions[o + 2] + normals[o + 2] * d, v);
    const tau = MU * Math.hypot(v[0], v[1], v[2]) / d; // Pa ((mm/s)/mm)
    vals[i] = tau;
    const t = (Math.log10(Math.max(tau, 1e-6)) - WSS_RANGE[0]) / (WSS_RANGE[1] - WSS_RANGE[0]);
    const interior = field.fn.sdf(positions[o], positions[o + 1], positions[o + 2]) < -d;
    const c = interior ? turbo(t) : [0.32, 0.34, 0.38];
    colors[o] = c[0]; colors[o + 1] = c[1]; colors[o + 2] = c[2];
    if (interior) {
      count++;
      const mpa = tau * 1000;
      if (mpa >= low && mpa <= high) inWin++;
    }
  }
  const sorted = Float32Array.from(vals).sort();
  return { colors, tau: vals, median: sorted[Math.floor(n / 2)] || 0, p90: sorted[Math.floor(n * 0.9)] || 0, inWindow: count ? inWin / count : 0 };
}

// Trajectoire de vol : ligne de courant la plus longue parmi plusieurs departs.
export function flyPath(field, tries = 24) {
  const [X, Y, Z] = field.box;
  const v = new Float32Array(3);
  const ds = Math.min(X, Y, Z) / 300;
  let best = null;
  for (let t = 0; t < tries; t++) {
    let x, y, z = Z * 0.02, ok = false;
    for (let a = 0; a < 60 && !ok; a++) {
      x = X * (0.25 + Math.random() * 0.5); y = Y * (0.25 + Math.random() * 0.5);
      ok = field.isFluid(x, y, z);
    }
    if (!ok) continue;
    const pts = [new THREE.Vector3(x, y, z)];
    let length = 0;
    for (let s = 0; s < 6000; s++) {
      field.sample(x, y, z, v);
      const sp = Math.hypot(v[0], v[1], v[2]);
      if (sp < 1e-9) break;
      x += (v[0] / sp) * ds; y += (v[1] / sp) * ds; z += (v[2] / sp) * ds;
      length += ds;
      if (z > Z * 1.02 || x < 0 || x > X || y < 0 || y > Y || field.fn.sdf(x, y, z) > 0.05) break;
      if (s % 14 === 0) pts.push(new THREE.Vector3(x, y, z));
    }
    const score = (z - pts[0].z) + length * 0.1;
    if (pts.length > 10 && (!best || score > best.score)) best = { pts, score, length };
  }
  if (!best) return null;
  // entree et sortie hors de l'eprouvette pour un plan d'ouverture et de fin
  const first = best.pts[0].clone(), last = best.pts[best.pts.length - 1].clone();
  best.pts.unshift(new THREE.Vector3(first.x, first.y, -Z * 0.6));
  best.pts.push(new THREE.Vector3(last.x, last.y, Z * 1.6));
  const curve = new THREE.CatmullRomCurve3(best.pts, false, 'centripetal');
  curve.arcLengthDivisions = 2000;
  return { curve, length: curve.getLength() };
}

// Lignes de courant depuis la face d'entree (point 64) : integration de Runge-Kutta 2 a pas
// constant en longueur, arret a la sortie, dans le solide ou en zone morte.
export function streamlines(field, { count = 160, maxPoints = 900, seed = 3 } = {}) {
  const [X, Y, Z] = field.box;
  const ds = Math.min(X, Y, Z) / 220;
  const v = new Float32Array(3);
  let a = seed;
  const rand = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const vmax = Math.max(field.maxPhys, 1e-12);
  const lines = [];
  for (let n = 0, tries = 0; n < count && tries < count * 40; tries++) {
    let x = X * rand(), y = Y * rand(), z = Z * 0.01;
    if (!field.isFluid(x, y, z)) continue;
    const pts = [x, y, z], spd = [];
    field.sample(x, y, z, v);
    spd.push(Math.hypot(v[0], v[1], v[2]) / vmax);
    for (let i = 0; i < maxPoints; i++) {
      field.sample(x, y, z, v);
      let s = Math.hypot(v[0], v[1], v[2]);
      if (s < vmax * 2e-3) break;
      const mx = x + (v[0] / s) * ds * 0.5, my = y + (v[1] / s) * ds * 0.5, mz = z + (v[2] / s) * ds * 0.5;
      field.sample(mx, my, mz, v);
      s = Math.hypot(v[0], v[1], v[2]);
      if (s < vmax * 2e-3) break;
      x += (v[0] / s) * ds; y += (v[1] / s) * ds; z += (v[2] / s) * ds;
      if (x < 0 || y < 0 || z < 0 || x > X || y > Y || z > Z || !field.isFluid(x, y, z)) break;
      pts.push(x, y, z); spd.push(s / vmax);
    }
    if (pts.length < 30) continue;
    lines.push({ pts: Float32Array.from(pts), speed: Float32Array.from(spd) });
    n++;
  }
  return lines;
}

// Tubes colores par la vitesse, regroupes en une seule geometrie.
export function streamlineMesh(lines, radius) {
  const radial = 5;
  const geos = [];
  for (const l of lines) {
    const n = l.pts.length / 3;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(l.pts[i * 3], l.pts[i * 3 + 1], l.pts[i * 3 + 2]));
    const curve = new THREE.CatmullRomCurve3(pts);
    const seg = Math.min(n, 240);
    const g = new THREE.TubeGeometry(curve, seg, radius, radial, false);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i <= seg; i++) {
      const sp = l.speed[Math.min(n - 1, Math.round((i / seg) * (n - 1)))];
      const c = particleColor(Math.min(1, sp));
      for (let r = 0; r <= radial; r++) { const k = (i * (radial + 1) + r) * 3; col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2]; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  return mergeAll(geos);
}

function mergeAll(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3); col.set(g.attributes.color.array, ov * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[oi + i] = gi[i] + ov;
    ov += g.attributes.position.count; oi += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
