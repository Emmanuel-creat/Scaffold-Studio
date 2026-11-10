import { describe, it, expect } from 'vitest';
import { solveOxygen, growTissue, nonNewtonian } from '../src/bio.js';

function channelGrid(nx, nz, w = 0.5) {
  const ny = 4, N = nx * ny * nz;
  const solid = new Uint8Array(N), u = new Float32Array(N), v = new Float32Array(N), ww = new Float32Array(N);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = i + j * nx + k * nx * ny;
    if (i === 0 || i === nx - 1) solid[p] = 1; else ww[p] = w;
  }
  return { nx, ny, nz, h: 0.05, solid, u, v, w: ww, periodicXY: true, length: nz * 0.05 };
}

describe('oxygene', () => {
  it('sans consommation la concentration reste a c0', () => {
    const r = solveOxygen(channelGrid(8, 40), { vmax: 0 });
    expect(Math.abs(r.cmin - 0.2)).toBeLessThan(1e-4);
  });
  it('la perfusion oxygene mieux le coeur que la culture statique', () => {
    const g = channelGrid(8, 160);
    const perf = solveOxygen(g, { vmax: 4e-17, density: 2000 });
    const stat = solveOxygen({ ...g, w: new Float32Array(g.w.length) }, { vmax: 4e-17, density: 2000, statique: true });
    const mid = (r) => r.profile[Math.floor(r.profile.length / 2)][1];
    console.log('milieu perfusion', mid(perf).toFixed(4), 'statique', mid(stat).toFixed(4));
    expect(mid(perf)).toBeGreaterThan(mid(stat));
    // la concentration decroit le long de l'ecoulement
    expect(perf.profile[5][1]).toBeGreaterThan(perf.profile[perf.profile.length - 5][1]);
  });
  it('bilan de masse : flux entrant moins sortant egal a la consommation', () => {
    const g = channelGrid(8, 80);
    const r = solveOxygen(g, { vmax: 2e-17, density: 1000, km: 1e-6 });
    // a km tres petit la consommation est d'ordre zero : qmax par face de paroi
    const area = 2 * 4 * 80 * 0.05 * 0.05; // mm2 de paroi
    const cons = 2e-17 * 1000 * area; // mol/s
    const flowArea = 6 * 4 * 0.05 * 0.05 * 1e-6; // m2
    const drop = 0.2 - r.profile[r.profile.length - 1][1];
    const transported = drop * 0.5e-3 * flowArea; // mol/s (convection seule, approchee)
    console.log('consommation', cons.toExponential(2), 'transport', transported.toExponential(2));
    expect(Math.abs(transported - cons) / cons).toBeLessThan(0.25);
  });
});

describe('croissance tissulaire', () => {
  it('un canal cylindrique se comble en r0^2 / (2 lambda)', () => {
    const n = 40, h = 0.05, R = 0.5, N = n * n * 12;
    const data = new Float32Array(N), inside = new Uint8Array(N).fill(1);
    for (let k = 0; k < 12; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i - n / 2 + 0.5) * h, y = (j - n / 2 + 0.5) * h;
      data[i + j * n + k * n * n] = R - Math.hypot(x, y);
    }
    // canal periodique selon z : on recopie les tranches extremes a chaque pas via un domaine assez long
    const field = { data, inside, nx: n, ny: n, nz: 12, hx: h, hy: h, hz: h, origin: [0, 0, 0] };
    const lambda = 0.01; // mm2/jour
    const tFill = (R * R) / (2 * lambda);
    const r = growTissue(null, { field, lambda, days: tFill * 1.2, step: 0.25, snapshots: [] });
    const at = (d) => r.curve.reduce((best, p) => (Math.abs(p[0] - d) < Math.abs(best[0] - d) ? p : best))[1];
    console.log('rempli a t/2', at(tFill / 2).toFixed(2), 'a t', at(tFill).toFixed(2));
    // a t/2 : r^2 = R^2 / 2, la moitie de la section est comblee
    expect(Math.abs(at(tFill / 2) - 0.5)).toBeLessThan(0.1);
    expect(at(tFill * 1.15)).toBeGreaterThan(0.95);
  });
});

describe('fluide', () => {
  it('le sang est plus visqueux que le milieu', () => {
    const b = nonNewtonian('blood', { inlet: 0.5, porosity: 0.7, pore: 0.8 });
    const m = nonNewtonian('medium', { inlet: 0.5, porosity: 0.7, pore: 0.8 });
    expect(m.ratio).toBeCloseTo(1, 6);
    expect(b.ratio).toBeGreaterThan(4);
  });
});

describe('ensemencement', () => {
  it('sans ecoulement les cellules sedimentent et adherent toutes au fond', async () => {
    const { seedCells } = await import('../src/bio.js');
    const nx = 10, nz = 20, N = nx * nx * nz;
    const solid = new Uint8Array(N);
    for (let p = 0; p < nx * nx; p++) solid[p] = 1; // plancher plein en k = 0
    const flow = { nx, ny: nx, nz, size: [1, 1, 2], solid, ux: new Float32Array(N), uy: new Float32Array(N), uz: new Float32Array(N), scale: 1 };
    const r = seedCells(flow, [1, 1, 2], { cells: 200, attach: 1, duration: 30 });
    expect(r.efficiency + r.fellBack).toBeCloseTo(1, 5);
  });
  it('un ecoulement rapide emporte les cellules qui ne touchent pas de paroi', async () => {
    const { seedCells } = await import('../src/bio.js');
    const nx = 10, nz = 20, N = nx * nx * nz;
    const solid = new Uint8Array(N), uz = new Float32Array(N).fill(1);
    const flow = { nx, ny: nx, nz, size: [1, 1, 2], solid, ux: new Float32Array(N), uy: new Float32Array(N), uz, scale: 1 };
    const r = seedCells(flow, [1, 1, 2], { cells: 200, attach: 1 });
    expect(r.exited).toBeGreaterThan(0.99);
  });
});
