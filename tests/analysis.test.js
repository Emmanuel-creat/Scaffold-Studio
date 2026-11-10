import { describe, it, expect } from 'vitest';
import { buildField } from '../src/tpms.js';
import { surfaceNets } from '../src/mesher.js';
import { computeMetrics } from '../src/metrics.js';
import { zProfile, closedRegions, geometricTortuosity, percolationDiameter, intrusionCurve, vertexMaps } from '../src/analysis.js';
import { applyPreset } from '../src/presets.js';

describe('analyses avancees', () => {
  const p = { ...applyPreset('default'), res: 60 };
  const field = buildField(p);
  const mesh = surfaceNets(field);
  const m = computeMetrics(p, field, mesh);
  it('profil de porosite proche de la consigne', () => {
    const pr = zProfile(field);
    const mean = pr.porosity.reduce((a, b) => a + b, 0) / pr.porosity.length;
    expect(Math.abs(mean - 0.7)).toBeLessThan(0.05);
  });
  it('gyroide ouvert : pas de volume ferme', () => {
    const c = closedRegions(field);
    expect(c.closedCount).toBe(0);
  });
  it('tortuosite entre 1 et 1,6', () => {
    const t = geometricTortuosity(field);
    expect(t).toBeGreaterThan(1);
    expect(t).toBeLessThan(1.6);
  });
  it('passage plus petit que le pore moyen, intrusion croissante', () => {
    const d = percolationDiameter(field, m._dt.dtVoid);
    expect(d).toBeGreaterThan(0.2);
    expect(d).toBeLessThan(m.pore.mean * 1.2);
    const curve = intrusionCurve(field, m._dt.dtVoid, [0.2, 0.6, 1.2]);
    expect(curve[0].fraction).toBeGreaterThan(curve[2].fraction);
  });
  it('cartes de surface : epaisseur proche du strut, courbure moyenne faible', () => {
    const mp = vertexMaps(p, field, mesh, m._dt);
    const th = Array.from(mp.thickness).sort((a, b) => a - b);
    const med = th[Math.floor(th.length / 2)];
    expect(med).toBeGreaterThan(m.strut.mean * 0.6);
    expect(med).toBeLessThan(m.strut.mean * 1.5);
    expect(mp.overhangFraction).toBeGreaterThan(0.02);
    expect(mp.overhangFraction).toBeLessThan(0.4);
    console.log('epaisseur mediane', med.toFixed(3), 'strut', m.strut.mean.toFixed(3), 'H moyen', mp.meanCurvature.toFixed(3), 'concave', mp.concaveFraction.toFixed(2));
  });
});
