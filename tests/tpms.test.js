import { describe, it, expect } from 'vitest';
import { buildField, specimenVolume, fitWholeCells, gridSize, SURFACES } from '../src/tpms.js';
import { surfaceNets, meshVolumeArea, taubin } from '../src/mesher.js';
import { porosityForStrut, unitStrut } from '../src/metrics.js';

const base = { type: 'gyroid', mode: 'network', cell: 2, porosity: 0.7, res: 50,
  shape: { kind: 'cube', x: 6, y: 6, z: 6 }, gradient: { kind: 'none' } };
const solidFrac = (p) => {
  const m = surfaceNets(buildField(p));
  return meshVolumeArea(m.positions, m.indices).volume / specimenVolume(p.shape);
};

describe('geometrie etendue', () => {
  it('les 9 surfaces atteignent la porosite visee', () => {
    for (const type of Object.keys(SURFACES)) {
      expect(Math.abs(solidFrac({ ...base, type, res: 40, porosity: 0.6 }) - 0.4)).toBeLessThan(0.07);
    }
  });
  it('anisotropie et rotation conservent la porosite', () => {
    expect(Math.abs(solidFrac({ ...base, aniso: { x: 1, y: 1, z: 1.6 } }) - 0.3)).toBeLessThan(0.04);
    expect(Math.abs(solidFrac({ ...base, rotation: { x: 30, y: 0, z: 45 } }) - 0.3)).toBeLessThan(0.04);
  });
  it('les nouvelles formes donnent un volume coherent', () => {
    const shapes = [
      { kind: 'cage', x: 10, y: 7, z: 5, radius: 2, hole: 3 },
      { kind: 'cup', diameter: 12, thickness: 3 },
      { kind: 'cylinder', diameter: 6, height: 5, hole: 2 },
    ];
    for (const shape of shapes) {
      const f = solidFrac({ ...base, shape, res: 60 });
      expect(Math.abs(f - 0.3)).toBeLessThan(0.06);
    }
  });
  it('la peau pleine augmente la fraction solide', () => {
    const shape = { kind: 'cylinder', diameter: 8, height: 6 };
    const without = solidFrac({ ...base, shape });
    const withSkin = solidFrac({ ...base, shape, skin: { t: 0.5, faces: 'lateral' } });
    expect(withSkin).toBeGreaterThan(without + 0.05);
  });
  it('le lissage garde le volume a 2 % pres', () => {
    const m = surfaceNets(buildField(base));
    const v0 = meshVolumeArea(m.positions, m.indices).volume;
    taubin(m, 5);
    const v1 = meshVolumeArea(m.positions, m.indices).volume;
    expect(Math.abs(v1 / v0 - 1)).toBeLessThan(0.02);
  });
  it('ajuste aux cellules entieres', () => {
    const p = fitWholeCells(structuredClone({ ...base, cell: 1.7, shape: { kind: 'cube', x: 8, y: 7, z: 9 } }));
    expect(8 / p.cell).toBeCloseTo(Math.round(8 / p.cell), 6);
    expect(p.shape.z / p.cell).toBeCloseTo(Math.round(p.shape.z / p.cell), 3);
  });
  it('limite la taille de grille', () => {
    const g = gridSize({ ...base, res: 1000, shape: { kind: 'cube', x: 30, y: 30, z: 30 } });
    expect(g.capped).toBe(true);
    expect(g.points).toBeLessThan(9.1e6);
  });
  it('trouve la porosite pour une epaisseur de strut visee', () => {
    const p = porosityForStrut(base, 0.5);
    expect(Math.abs(unitStrut(base, p) - 0.5)).toBeLessThan(0.05);
  });
});
