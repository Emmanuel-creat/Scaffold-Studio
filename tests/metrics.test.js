import { describe, it, expect } from 'vitest';
import { edt3d, computeMetrics } from '../src/metrics.js';
import { buildField } from '../src/tpms.js';
import { surfaceNets } from '../src/mesher.js';

describe('transformee de distance', () => {
  it('donne la distance exacte a un point', () => {
    const n = 11, f = new Uint8Array(n * n * n);
    f[5 + 5 * n + 5 * n * n] = 1;
    const d = edt3d(f, n, n, n);
    expect(d[0]).toBe(75);
    expect(d[8 + 5 * n + 5 * n * n]).toBe(9);
  });
});

describe('mesures', () => {
  it('retrouve porosite, interconnectivite et tailles plausibles', () => {
    const params = { type: 'gyroid', mode: 'network', cell: 2, porosity: 0.7, res: 70,
      shape: { kind: 'cube', x: 6, y: 6, z: 6 }, gradient: { kind: 'none' }, material: 'ti64', process: 'lpbf' };
    const f = buildField(params);
    const m = computeMetrics(params, f, surfaceNets(f));
    expect(Math.abs(m.porosity - 0.7)).toBeLessThan(0.03);
    expect(m.interconnectivity).toBeGreaterThan(0.99);
    // gyroide reseau a 70 % : pore de l'ordre de la moitie de la cellule
    expect(m.pore.mean).toBeGreaterThan(0.6);
    expect(m.pore.mean).toBeLessThan(1.4);
    expect(m.strut.mean).toBeGreaterThan(0.3);
    expect(m.strut.mean).toBeLessThan(m.pore.mean);
    expect(m.E).toBeGreaterThan(5);
    expect(m.E).toBeLessThan(15);
  });
});
