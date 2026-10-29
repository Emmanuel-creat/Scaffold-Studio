import { describe, it, expect } from 'vitest';
import { LBM } from '../src/lbm.js';

describe('Boltzmann sur reseau', () => {
  it('retrouve la permeabilite de Poiseuille entre deux plaques', () => {
    // canal plan : parois en x = 0, fluide sur H noeuds
    const H = 16, nx = H + 1, ny = 2, nz = 2;
    const solid = new Uint8Array(nx * ny * nz);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) solid[0 + j * nx + k * nx * ny] = 1;
    const lbm = new LBM(solid, nx, ny, nz, { tau: 1 });
    lbm.run({ maxSteps: 20000, chunk: 200, tol: 1e-7 });
    // k superficiel = H^2/12 * (H / nx) avec rebond a mi-chemin : canal de largeur H
    const expected = (H * H / 12) * (H / nx);
    expect(Math.abs(lbm.permeability() / expected - 1)).toBeLessThan(0.03);
  });
});
