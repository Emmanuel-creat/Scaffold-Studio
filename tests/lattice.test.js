import { describe, it, expect } from 'vitest';
import { buildField, specimenVolume, SURFACES, makeFieldFn, parseProfile, porosityAt } from '../src/tpms.js';
import { surfaceNets, meshVolumeArea } from '../src/mesher.js';

const base = { type: 'bcc', mode: 'network', cell: 2, porosity: 0.8, res: 60,
  shape: { kind: 'cube', x: 6, y: 6, z: 6 }, gradient: { kind: 'none' } };
const solidFrac = (p) => {
  const m = surfaceNets(buildField(p));
  return meshVolumeArea(m.positions, m.indices).volume / specimenVolume(p.shape);
};
// Fraction solide d'une tranche de hauteur [z0, z1] par echantillonnage du champ.
const sliceSolid = (p, z0, z1) => {
  const fn = makeFieldFn(p);
  let s = 0, n = 0;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) for (let k = 0; k < 6; k++) {
    const v = fn.value(((i + 0.5) / 24) * 6, ((j + 0.5) / 24) * 6, z0 + ((k + 0.5) / 6) * (z1 - z0));
    s += v < 0 ? 1 : 0; n++;
  }
  return s / n;
};

describe('treillis de poutres et Voronoi', () => {
  it('chaque treillis atteint la porosite visee', () => {
    for (const type of ['cubicLattice', 'bcc', 'fcc', 'octet', 'voronoi']) {
      const f = solidFrac({ ...base, type });
      expect(Math.abs(f - 0.2), type).toBeLessThan(0.04);
    }
  });
  it('le BCC passe par le centre de la cellule et le coin', () => {
    const f = SURFACES.bcc.f;
    expect(f(0, 0, 0)).toBeCloseTo(0, 6);
    expect(f(Math.PI, Math.PI, Math.PI)).toBeCloseTo(0, 6);
    expect(f(Math.PI, 0, 0)).toBeGreaterThan(0.5);
  });
  it('le mode feuillet est ignore pour les treillis', () => {
    expect(Math.abs(solidFrac({ ...base, mode: 'sheet' }) - solidFrac(base))).toBeLessThan(1e-9);
  });
});

describe('gradients etendus et booleens', () => {
  it('profil multipoint lu et interpole', () => {
    expect(parseProfile('0:80, 0.5:55; 1:80')).toEqual([[0, 0.8], [0.5, 0.55], [1, 0.8]]);
    const p = { ...base, type: 'gyroid', gradient: { kind: 'profile', profile: '0:80, 0.5:50, 1:80' } };
    expect(porosityAt({ ...p, gradient: { ...p.gradient, pts: parseProfile(p.gradient.profile) } }, 3, 3, 1.5)).toBeCloseTo(0.65, 6);
    // la tranche du milieu est plus dense que les extremites
    expect(sliceSolid(p, 2.5, 3.5)).toBeGreaterThan(sliceSolid(p, 0, 1) + 0.15);
  });
  it('carte de densite : la moitie blanche est plus poreuse', () => {
    const data = [];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) data.push(i < 4 ? 0 : 255);
    const p = { ...base, type: 'gyroid', porosity: 0.5, gradient: { kind: 'image', p1: 0.85, map: { w: 8, h: 8, data } } };
    const fn = makeFieldFn(p);
    let left = 0, right = 0;
    for (let k = 0; k < 4000; k++) {
      const x = Math.random() * 6, y = Math.random() * 6, z = Math.random() * 6;
      if (fn.value(x, y, z) < 0) { if (x < 2) left++; else if (x > 4) right++; }
    }
    expect(left).toBeGreaterThan(right * 1.8);
  });
  it('melange gyroide vers BCC le long de la hauteur', () => {
    const p = { ...base, type: 'gyroid', porosity: 0.7, gradient: { kind: 'axial', p1: 0.7 }, blend: { type: 'bcc' } };
    const fn = makeFieldFn(p);
    const g = makeFieldFn({ ...p, blend: { type: 'none' } }), b = makeFieldFn({ ...p, type: 'bcc', blend: { type: 'none' } });
    // en bas : gyroide pur, en haut : BCC pur (memes signes)
    let agreeBottom = 0, agreeTop = 0;
    for (let k = 0; k < 2000; k++) {
      const x = Math.random() * 6, y = Math.random() * 6;
      if ((fn.tpms(x, y, 0) < 0) === (g.tpms(x, y, 0) < 0)) agreeBottom++;
      if ((fn.tpms(x, y, 6) < 0) === (b.tpms(x, y, 6) < 0)) agreeTop++;
    }
    expect(agreeBottom).toBe(2000);
    expect(agreeTop).toBe(2000);
  });
  it('forme ajoutee pleine et forme retiree', () => {
    const plate = { op: 'add', kind: 'box', c: [3, 3, 0.5], s: [6, 6, 1] };
    const hole = { op: 'sub', kind: 'cylinder', c: [3, 3, 3], s: [2, 2, 6] };
    const p0 = { ...base, type: 'gyroid', porosity: 0.7 };
    const fa = makeFieldFn({ ...p0, booleans: [plate] });
    const fs = makeFieldFn({ ...p0, booleans: [hole] });
    expect(fa.value(1, 1, 0.5)).toBeLessThan(0);
    expect(fs.value(3, 3, 3)).toBeGreaterThan(0);
    expect(solidFrac({ ...p0, booleans: [plate] })).toBeGreaterThan(solidFrac(p0) + 0.1);
  });
});
