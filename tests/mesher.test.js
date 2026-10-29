import { describe, it, expect } from 'vitest';
import { buildField } from '../src/tpms.js';
import { surfaceNets, meshVolumeArea } from '../src/mesher.js';

const base = { type: 'gyroid', mode: 'network', cell: 2, porosity: 0.7, res: 60,
  shape: { kind: 'cube', x: 6, y: 6, z: 6 }, gradient: { kind: 'none' } };

describe('maillage surface nets', () => {
  it('donne un volume positif proche de la fraction solide visee', () => {
    const f = buildField(base);
    const m = surfaceNets(f);
    const { volume } = meshVolumeArea(m.positions, m.indices);
    const solidFrac = volume / 216;
    expect(volume).toBeGreaterThan(0);
    expect(Math.abs(solidFrac - 0.3)).toBeLessThan(0.03);
  });
  it('fonctionne pour toutes les surfaces et les deux modes', () => {
    for (const type of ['gyroid', 'diamond', 'primitive', 'iwp', 'neovius']) {
      for (const mode of ['network', 'sheet']) {
        const f = buildField({ ...base, type, mode, res: 40, porosity: 0.6 });
        const m = surfaceNets(f);
        const { volume } = meshVolumeArea(m.positions, m.indices);
        expect(Math.abs(volume / 216 - 0.4)).toBeLessThan(0.06);
      }
    }
  });
  it('gere un cylindre', () => {
    const f = buildField({ ...base, shape: { kind: 'cylinder', diameter: 6, height: 6 }, res: 50 });
    const m = surfaceNets(f);
    const { volume } = meshVolumeArea(m.positions, m.indices);
    const cyl = Math.PI * 9 * 6;
    expect(Math.abs(volume / cyl - 0.3)).toBeLessThan(0.04);
  });
});
