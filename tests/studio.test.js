import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hiResSize, shotPose } from '../src/studio.js';
import { streamlines } from '../src/flow.js';

describe('studio', () => {
  it('rendu haute definition au grand cote de 3840 px', () => {
    expect(hiResSize(4 / 5, 1)).toEqual([3072, 3840]);
    expect(hiResSize(9 / 16, 1)).toEqual([2160, 3840]);
    expect(hiResSize(16 / 9, 1)).toEqual([3840, 2160]);
    expect(hiResSize(null, 2)).toEqual([3840, 1920]);
  });
  it('le tour complet revient au point de depart a distance constante', () => {
    const start = { center: new THREE.Vector3(4, 4, 4), pos: new THREE.Vector3(14, 2, 9) };
    const r0 = start.pos.distanceTo(start.center);
    for (const u of [0, 0.25, 0.5, 0.8]) expect(shotPose('orbit', u, start).pos.distanceTo(start.center)).toBeCloseTo(r0, 6);
    expect(shotPose('orbit', 1, start).pos.distanceTo(start.pos)).toBeLessThan(1e-6);
    expect(shotPose('dive', 1, start).pos.distanceTo(start.center)).toBeLessThan(r0 * 0.1);
  });
  it('les vues cles sont traversees dans l\'ordre', () => {
    const keys = [{ pos: [0, 0, 0], target: [0, 0, -1] }, { pos: [10, 0, 0], target: [10, 0, -1] }, { pos: [10, 10, 0], target: [10, 10, -1] }];
    const start = { center: new THREE.Vector3(), pos: new THREE.Vector3(1, 1, 1) };
    expect(shotPose('keys', 0, start, keys).pos.toArray()).toEqual([0, 0, 0]);
    const end = shotPose('keys', 1, start, keys).pos;
    expect(end.distanceTo(new THREE.Vector3(10, 10, 0))).toBeLessThan(1e-6);
  });
});

describe('lignes de courant', () => {
  it('un ecoulement uniforme donne des droites verticales qui traversent la piece', () => {
    const field = {
      box: [2, 2, 4], maxPhys: 1,
      sample: (x, y, z, out) => { out[0] = 0; out[1] = 0; out[2] = 1; return out; },
      isFluid: () => true,
    };
    const lines = streamlines(field, { count: 10 });
    expect(lines.length).toBe(10);
    for (const l of lines) {
      const n = l.pts.length / 3;
      expect(l.pts[n * 3 - 1]).toBeGreaterThan(3.9);
      expect(Math.abs(l.pts[n * 3 - 3] - l.pts[0])).toBeLessThan(1e-6);
    }
  });
});
