// Non-regression (point 86) : quelques grandeurs de reference figees.
// Une modification qui les deplace au-dela de la tolerance doit etre voulue, et les valeurs mises a jour ici.
import { describe, it, expect } from 'vitest';
import { buildField, makeFieldFn } from '../src/tpms.js';
import { surfaceNets, taubin } from '../src/mesher.js';
import { computeMetrics } from '../src/metrics.js';
import { LBM } from '../src/lbm.js';
import { applyPreset } from '../src/presets.js';

const REF = {
  gyroid: { porosity: 0.7303, pore: 0.9354, strut: 0.4330, area: 7.284, k: 1.416e-8 },
  octet: { porosity: 0.7755, pore: 0.6338, strut: 0.3608, area: 18.87 },
};
const near = (v, ref, tol) => expect(Math.abs(v / ref - 1), `${v} contre ${ref}`).toBeLessThan(tol);

function measure(type) {
  const p = { ...applyPreset('default'), type, res: 64 };
  const field = buildField(p);
  const mesh = surfaceNets(field);
  taubin(mesh, p.smooth || 0);
  const m = computeMetrics(p, field, mesh);
  return { p, m: { porosity: m.porosity, pore: m.pore.mean, strut: m.strut.mean, area: m.specificSurface } };
}

function permeability(p, n = 24) {
  const fn = makeFieldFn(p);
  const solid = new Uint8Array(n * n * n);
  let q = 0;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    solid[q++] = fn.tpms(((i + 0.5) * p.cell) / n, ((j + 0.5) * p.cell) / n, ((k + 0.5) * p.cell) / n) < 0 ? 1 : 0;
  const l = new LBM(solid, n, n, n, { tau: 1, force: 1e-5, dir: 'z' });
  l.run({ maxSteps: 6000, chunk: 200, tol: 1e-6 });
  const dx = (p.cell / n) * 1e-3;
  return l.permeability() * dx * dx;
}

describe('non-regression', () => {
  it('gyroide par defaut : morphologie et permeabilite', () => {
    const { p, m } = measure('gyroid');
    const k = permeability(p);
    {
      near(m.porosity, REF.gyroid.porosity, 0.01);
      near(m.pore, REF.gyroid.pore, 0.03);
      near(m.strut, REF.gyroid.strut, 0.03);
      near(m.area, REF.gyroid.area, 0.02);
      near(k, REF.gyroid.k, 0.02);
    }
  });
  it('treillis octet : morphologie', () => {
    const { m } = measure('octet');
    {
      near(m.porosity, REF.octet.porosity, 0.01);
      near(m.pore, REF.octet.pore, 0.03);
      near(m.strut, REF.octet.strut, 0.03);
      near(m.area, REF.octet.area, 0.02);
    }
  });
});
