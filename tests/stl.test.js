import { describe, it, expect } from 'vitest';
import { parseSTL, normalize, stlToSdf } from '../src/stl.js';
import { buildField, specimenVolume } from '../src/tpms.js';
import { surfaceNets, meshVolumeArea } from '../src/mesher.js';

// Cube de 10 mm en STL ASCII
function cubeStl(L) {
  const v = [[0,0,0],[L,0,0],[L,L,0],[0,L,0],[0,0,L],[L,0,L],[L,L,L],[0,L,L]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  let s = 'solid c\n';
  for (const t of f) s += `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${v[i].join(' ')}`).join('\n')}\nendloop\nendfacet\n`;
  return new TextEncoder().encode(s + 'endsolid c\n').buffer;
}

describe('import STL', () => {
  it('voxelise un cube et remplit le reseau', () => {
    const tris = parseSTL(cubeStl(10));
    const box = normalize(tris);
    const { grid, volume } = stlToSdf(tris, box, 50);
    expect(Math.abs(volume / 1000 - 1)).toBeLessThan(0.08);
    const shape = { kind: 'stl', box, sdfGrid: grid, volume };
    const p = { type: 'gyroid', mode: 'network', cell: 2.5, porosity: 0.7, res: 50, shape, gradient: { kind: 'none' } };
    const m = surfaceNets(buildField(p));
    const frac = meshVolumeArea(m.positions, m.indices).volume / specimenVolume(shape);
    expect(Math.abs(frac - 0.3)).toBeLessThan(0.05);
  });
});
