import { makeFieldFn, specimenBox } from './tpms.js';
import { LBM } from './lbm.js';

let currentId = null;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.cmd === 'stop') { currentId = null; return; }
  if (msg.cmd !== 'start') return;
  const { params, id } = msg;
  currentId = id;
  const fn = makeFieldFn(params);
  const graded = params.gradient && params.gradient.kind !== 'none';
  const periodicCell = !graded && params.shape.kind === 'cube';
  let nx, ny, nz, dx, origin, period = null;
  const solid = (() => {
    if (periodicCell) {
      const n = msg.cellRes || 32;
      nx = ny = nz = n; dx = params.cell / n; origin = [0, 0, 0]; period = params.cell;
      const s = new Uint8Array(n * n * n);
      let q = 0;
      for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
        s[q++] = fn.tpms((i + 0.5) * dx, (j + 0.5) * dx, (k + 0.5) * dx) < 0 ? 1 : 0;
      return s;
    }
    const [X, Y, Z] = specimenBox(params.shape);
    const nmax = msg.domainRes || 48;
    dx = Math.max(X, Y, Z) / nmax;
    nx = Math.max(4, Math.round(X / dx)); ny = Math.max(4, Math.round(Y / dx)); nz = Math.max(4, Math.round(Z / dx));
    origin = [0, 0, 0];
    const s = new Uint8Array(nx * ny * nz);
    let q = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * X / nx, y = (j + 0.5) * Y / ny, z = (k + 0.5) * Z / nz;
      const out = params.shape.kind === 'cylinder' && fn.sdf(x, y, Z / 2) > 0;
      s[q++] = out || fn.tpms(x, y, z) < 0 ? 1 : 0;
    }
    return s;
  })();

  const lbm = new LBM(solid, nx, ny, nz, { tau: 1, force: 1e-5 });
  const dxm = dx * 1e-3;
  let lastPost = 0;
  const post = (done) => {
    const kLat = lbm.permeability();
    self.postMessage({
      id, type: done ? 'done' : 'progress', steps: lbm.steps,
      permeability: kLat * dxm * dxm,
      meanUz: lbm.meanUz,
      field: {
        nx, ny, nz, dx, origin, period, size: period ? [period, period, period] : specimenBox(params.shape),
        ux: lbm.ux.slice(), uy: lbm.uy.slice(), uz: lbm.uz.slice(), solid: solid.slice(),
      },
    });
  };
  const maxSteps = msg.maxSteps || 3000;
  let prev = 0, converged = false;
  while (lbm.steps < maxSteps && currentId === id) {
    const u = lbm.step(25);
    const rel = Math.abs(u - prev) / Math.max(Math.abs(u), 1e-30);
    prev = u;
    const now = performance.now();
    if (now - lastPost > 350) { lastPost = now; post(false); }
    if (lbm.steps > 100 && rel < 2e-4) { converged = true; break; }
    await new Promise((r) => setTimeout(r, 0));
  }
  const stopped = currentId !== id;
  post(true);
  self.postMessage({ id, type: 'end', converged, stopped });
};
