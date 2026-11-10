import { describe, it, expect } from 'vitest';
import { LBM } from '../src/lbm.js';

function channel(H) {
  const nx = H + 1, ny = 2, nz = 2;
  const solid = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) solid[j * nx + k * nx * ny] = 1;
  return { solid, nx, ny, nz, expected: (H * H / 12) * (H / nx) };
}

describe('Boltzmann sur reseau (TRT)', () => {
  it('retrouve la permeabilite de Poiseuille entre deux plaques', () => {
    const c = channel(16);
    const lbm = new LBM(c.solid, c.nx, c.ny, c.nz, { tau: 1 });
    lbm.run({ maxSteps: 20000, chunk: 200, tol: 1e-8 });
    expect(Math.abs(lbm.permeability() / c.expected - 1)).toBeLessThan(0.01);
  });
  it('donne une permeabilite independante de la viscosite', () => {
    const c = channel(10);
    const ks = [0.8, 1, 1.5].map((tau) => {
      const l = new LBM(c.solid, c.nx, c.ny, c.nz, { tau });
      l.run({ maxSteps: 40000, chunk: 200, tol: 1e-9 });
      return l.permeability();
    });
    expect(Math.abs(ks[0] / ks[2] - 1)).toBeLessThan(0.01);
  });
  it('pousse le fluide dans la direction demandee', () => {
    const n = 4, solid = new Uint8Array(n * n * n);
    const l = new LBM(solid, n, n, n, { dir: 'x' });
    l.step(10);
    expect(l.ux[0]).toBeGreaterThan(0);
    expect(Math.abs(l.uz[0])).toBeLessThan(1e-12);
  });
});
