import { describe, it, expect } from 'vitest';
import { History, serialize, deserialize, encodeHash, decodeHash } from '../src/project.js';
import { applyPreset } from '../src/presets.js';

describe('projet', () => {
  it('lien partageable aller-retour', () => {
    const s = applyPreset('lumbar');
    s.porosity = 0.62;
    const back = decodeHash('#' + encodeHash(s));
    expect(back.porosity).toBe(0.62);
    expect(back.shape.kind).toBe('cage');
    expect(back.shape.hole).toBe(5);
  });
  it('la grille STL ne part pas dans le fichier', () => {
    const s = applyPreset('default');
    s.shape = { ...s.shape, kind: 'stl', box: [5, 5, 5], sdfGrid: { data: new Float32Array(10) } };
    const out = serialize(s);
    expect(out.params.shape.sdfGrid).toBeUndefined();
    expect(deserialize(out).shape.kind).toBe('cube');
  });
  it('annuler et refaire', () => {
    const h = new History();
    const s = applyPreset('default');
    h.push(s); s.cell = 2;
    h.push(s); s.cell = 3;
    const u1 = h.undo(s);
    expect(u1.cell).toBe(2);
    const u2 = h.undo(u1);
    expect(u2.cell).toBe(1.5);
    const r = h.redo(u2);
    expect(r.cell).toBe(2);
  });
});
