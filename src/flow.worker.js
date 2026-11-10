import { makeFieldFn, specimenBox } from './tpms.js';
import { LBM } from './lbm.js';

let currentId = null;

// Domaine de calcul : cellule periodique quand c'est exact, sinon eprouvette entiere.
export function flowDomain(params, { cellRes = 32, domainRes = 48 } = {}) {
  const fn = makeFieldFn(params);
  const g = params.gradient || { kind: 'none' };
  const rot = params.rotation || {};
  const an = params.aniso || { x: 1, y: 1, z: 1 };
  const periodic = g.kind === 'none' && params.shape.kind === 'cube' && !(params.skin && params.skin.t > 0)
    && !(params.shape.hole > 0) && !rot.x && !rot.y && !rot.z;
  if (periodic) {
    const size = [params.cell * (an.x || 1), params.cell * (an.y || 1), params.cell * (an.z || 1)];
    const m = Math.max(...size);
    const dims = size.map((s) => Math.max(8, Math.round((cellRes * s) / m)));
    const [nx, ny, nz] = dims;
    const solid = new Uint8Array(nx * ny * nz);
    let q = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
      solid[q++] = fn.tpms(((i + 0.5) * size[0]) / nx, ((j + 0.5) * size[1]) / ny, ((k + 0.5) * size[2]) / nz) < 0 ? 1 : 0;
    return { solid, nx, ny, nz, size, period: size, dx: size[0] / nx };
  }
  const [X, Y, Z] = specimenBox(params.shape);
  const dx = Math.max(X, Y, Z) / domainRes;
  const nx = Math.max(4, Math.round(X / dx)), ny = Math.max(4, Math.round(Y / dx)), nz = Math.max(4, Math.round(Z / dx));
  const solid = new Uint8Array(nx * ny * nz);
  const prism = params.shape.kind !== 'cup' && params.shape.kind !== 'stl';
  let q = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = ((i + 0.5) * X) / nx, y = ((j + 0.5) * Y) / ny, z = ((k + 0.5) * Z) / nz;
    const out = fn.sdf(x, y, prism ? Z / 2 : z) > 0;
    solid[q++] = out || fn.value(x, y, prism ? Math.min(Math.max(z, 1e-6), Z - 1e-6) : z) < 0 ? 1 : 0;
  }
  return { solid, nx, ny, nz, size: [X, Y, Z], period: null, dx: X / nx };
}

async function runLbm(dom, id, dir, maxSteps, onPost) {
  const lbm = new LBM(dom.solid, dom.nx, dom.ny, dom.nz, { tau: 1, force: 1e-5, dir });
  let prev = 0, converged = false, last = 0;
  while (lbm.steps < maxSteps && currentId === id) {
    const u = lbm.step(25);
    const rel = Math.abs(u - prev) / Math.max(Math.abs(u), 1e-30);
    prev = u;
    const now = performance.now();
    if (onPost && now - last > 350) { last = now; onPost(lbm, false); }
    if (lbm.steps > 100 && rel < 2e-4) { converged = true; break; }
    await new Promise((r) => setTimeout(r, 0));
  }
  return { lbm, converged };
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.cmd === 'stop') { currentId = null; return; }
  const { params, id } = msg;
  currentId = id;
  const dom = flowDomain(params, msg);
  const dxm = dom.dx * 1e-3;
  if (msg.cmd === 'tensor') {
    const k = {};
    for (const dir of ['x', 'y', 'z']) {
      const { lbm } = await runLbm(dom, id, dir, msg.maxSteps || 3000);
      if (currentId !== id) return;
      k[dir] = lbm.permeability() * dxm * dxm;
      self.postMessage({ id, type: 'tensor-progress', dir, k: k[dir] });
    }
    self.postMessage({ id, type: 'tensor', k });
    return;
  }
  if (msg.cmd !== 'start') return;
  const post = (lbm, done) => {
    self.postMessage({
      id, type: done ? 'done' : 'progress', steps: lbm.steps,
      permeability: lbm.permeability() * dxm * dxm,
      field: {
        nx: dom.nx, ny: dom.ny, nz: dom.nz, dx: dom.dx, period: dom.period, size: dom.size,
        ux: lbm.ux.slice(), uy: lbm.uy.slice(), uz: lbm.uz.slice(), solid: dom.solid.slice(),
      },
    });
  };
  const { lbm, converged } = await runLbm(dom, id, 'z', msg.maxSteps || 3000, post);
  const stopped = currentId !== id;
  post(lbm, true);
  self.postMessage({ id, type: 'end', converged, stopped });
};
