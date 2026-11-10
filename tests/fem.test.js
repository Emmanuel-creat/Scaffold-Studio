import { describe, it, expect } from 'vitest';
import { homogenize, engineering, normalModuli, isoD, cellVoxels, fitGibsonAshby, vonMisesUniaxial } from '../src/fem.js';
import { applyPreset } from '../src/presets.js';

describe('elements finis voxel', () => {
  it('un bloc plein redonne le materiau isotrope', () => {
    const n = 6, solid = new Uint8Array(n ** 3).fill(1);
    const r = homogenize({ solid, nx: n, ny: n, nz: n });
    const D = isoD(1, 0.3);
    for (let i = 0; i < 36; i++) expect(r.C[i]).toBeCloseTo(D[i], 6);
    expect(engineering(r.C).Ez).toBeCloseTo(1, 6);
  });
  it('stratifie de plaques paralleles a la charge : E = fraction solide', () => {
    const n = 8, solid = new Uint8Array(n ** 3);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) solid[i + j * n + k * n * n] = i < 3 ? 1 : 0;
    const r = homogenize({ solid, nx: n, ny: n, nz: n }, { cases: [0, 1, 2, 3, 4, 5] });
    const e = engineering(r.C);
    expect(e.Ez).toBeCloseTo(3 / 8, 3);
    expect(e.Ey).toBeCloseTo(3 / 8, 3);
  });
  it('gyroide 70 % : module relatif plausible et contraintes concentrees', () => {
    const p = applyPreset('default');
    const vox = cellVoxels(p, 16);
    const r = homogenize(vox);
    const e = engineering(r.C);
    const nm = normalModuli(r.C);
    console.log('gyroide rho', vox.density.toFixed(3), 'Ez/Es', e.Ez.toFixed(4), 'normal', nm.Ez.toFixed(4), 'iter', r.iterations);
    expect(e.Ez).toBeGreaterThan(0.02);
    expect(e.Ez).toBeLessThan(0.2);
    expect(Math.abs(e.Ex - e.Ez) / e.Ez).toBeLessThan(0.05); // symetrie cubique
    const vm = vonMisesUniaxial(r);
    const mean = vm.reduce((a, b) => a + b, 0) / vm.length;
    expect(mean).toBeGreaterThan(1); // la contrainte locale depasse la contrainte appliquee
  });
  it('ajustement Gibson-Ashby exact sur une loi puissance', () => {
    const f = fitGibsonAshby([0.1, 0.2, 0.3, 0.4].map((rho) => ({ rho, E: 0.8 * rho ** 2.1 })));
    expect(f.C).toBeCloseTo(0.8, 6);
    expect(f.n).toBeCloseTo(2.1, 6);
  });
});

describe("surface d'anisotropie", () => {
  it('isotrope : rayon constant ; cubique : maximum selon la diagonale si A > 1', async () => {
    const { isoD, invert, directionalModulus, anisotropySurface } = await import('../src/fem.js');
    const S = invert(isoD(2, 0.3), 6);
    const s = anisotropySurface(S, 16);
    expect(s.ratio).toBeCloseTo(1, 6);
    expect(s.Emax).toBeCloseTo(2, 6);
    // cubique : C11 = 3, C12 = 1, C44 = 2 (Zener 2) : plus raide en [111]
    const C = new Float64Array(36);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 6 + j] = i === j ? 3 : 1;
    for (let i = 3; i < 6; i++) C[i * 6 + i] = 2;
    const Sc = invert(C, 6);
    const e100 = directionalModulus(Sc, [1, 0, 0]);
    const r = 1 / Math.sqrt(3);
    const e111 = directionalModulus(Sc, [r, r, r]);
    expect(e100).toBeCloseTo(1 / Sc[0], 9);
    expect(e111).toBeGreaterThan(e100);
  });
});
