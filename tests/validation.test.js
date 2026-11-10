import { describe, it, expect } from 'vitest';
import { LBM } from '../src/lbm.js';

// Reseau cubique simple de spheres : force de trainee adimensionnee K(c) de
// Sangani et Acrivos (1982), qui prolonge Hasimoto (1959). Reference classique
// des solveurs d'ecoulement en milieu poreux. k = L^3 / (6 pi a K).
function sanganiAcrivosK(c) {
  const inv = 1 - 1.7601 * c ** (1 / 3) + c - 1.5593 * c ** 2 + 3.9799 * c ** (8 / 3) - 3.0734 * c ** (10 / 3);
  return 1 / inv;
}

describe('validation : reseau de spheres', () => {
  it('retrouve la permeabilite theorique a 3 % pres', () => {
    const n = 32, c = 0.125;
    const a = n * Math.cbrt((3 * c) / (4 * Math.PI));
    const solid = new Uint8Array(n * n * n);
    let q = 0;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const d = Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2, k + 0.5 - n / 2);
      solid[q++] = d < a ? 1 : 0;
    }
    const lbm = new LBM(solid, n, n, n, { tau: 1 });
    lbm.run({ maxSteps: 4000, chunk: 50, tol: 1e-5 });
    const kTheory = (n ** 3) / (6 * Math.PI * a * sanganiAcrivosK(c));
    const err = lbm.permeability() / kTheory - 1;
    console.log(`ecart reseau de spheres : ${(err * 100).toFixed(2)} %`);
    expect(Math.abs(err)).toBeLessThan(0.03);
  }, 60000);
});
