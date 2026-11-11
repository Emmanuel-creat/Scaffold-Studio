// Comparaison avec Castro et al. 2019 (Materials 12:1313, doi:10.3390/ma12081313) :
// gyroide, Schwarz D et Schwarz P a 70 % de porosite, cellule de 3,25 mm.
// Usage : node scripts/validation.mjs
import { makeFieldFn } from '../src/tpms.js';
import { LBM } from '../src/lbm.js';
import { cellVoxels, homogenize, engineering } from '../src/fem.js';
import { applyPreset } from '../src/presets.js';

const n = Number(process.argv[2]) || 32;
const out = {};
for (const type of ['gyroid', 'diamond', 'primitive']) {
  for (const mode of ['network', 'sheet']) {
    const p = { ...applyPreset('default'), type, mode, porosity: 0.7, cell: 3.25 };
    const fn = makeFieldFn(p);
    const solid = new Uint8Array(n ** 3);
    let q = 0, s = 0;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = fn.tpms(((i + 0.5) * p.cell) / n, ((j + 0.5) * p.cell) / n, ((k + 0.5) * p.cell) / n) < 0 ? 1 : 0;
      solid[q++] = v; s += v;
    }
    const l = new LBM(solid, n, n, n, { tau: 1, force: 1e-5, dir: 'z' });
    l.run({ maxSteps: 20000, chunk: 200, tol: 1e-7 });
    const dx = (p.cell / n) * 1e-3;
    const k = l.permeability() * dx * dx;
    const r = homogenize(cellVoxels(p, 24), { cases: [0, 1, 2, 3, 4, 5], tol: 1e-6 });
    const Ez = engineering(r.C).Ez;
    out[`${type}/${mode}`] = { porosity: 1 - s / n ** 3, k, Ez };
    console.log(type, mode, 'phi', (1 - s / n ** 3).toFixed(3), 'k', k.toExponential(3), 'Ez/Es', Ez.toFixed(4));
  }
}
console.log(JSON.stringify(out));
