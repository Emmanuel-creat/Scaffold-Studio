// Sauvegarde de projet (fichier JSON, lien partageable) et historique annuler / refaire.
import { mergeParams, DEFAULT } from './presets.js';

export const PROJECT_VERSION = 2;

// Copie des parametres sans la grille de distance d'une forme STL (trop lourde pour un lien).
export function serialize(state) {
  const out = structuredClone({ ...state, shape: { ...state.shape, sdfGrid: undefined } });
  delete out.shape.sdfGrid;
  return { app: 'scaffold-studio', version: PROJECT_VERSION, params: out };
}

export function deserialize(obj) {
  const p = obj && obj.params ? obj.params : obj;
  if (!p || typeof p !== 'object') throw new Error('Projet illisible');
  const merged = mergeParams(structuredClone(DEFAULT), p);
  // Une forme STL ne peut pas etre restauree sans son fichier : on revient au cube.
  if (merged.shape.kind === 'stl' && !merged.shape.sdfGrid) merged.shape.kind = 'cube';
  return merged;
}

const toB64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function encodeHash(state) {
  return `p=${toB64(JSON.stringify(serialize(state)))}`;
}
export function decodeHash(hash) {
  const m = /(?:^#?|&)p=([A-Za-z0-9_-]+)/.exec(hash || '');
  if (!m) return null;
  return deserialize(JSON.parse(fromB64(m[1])));
}

// Historique borne : chaque entree est une copie des parametres (la grille STL est partagee).
export class History {
  constructor(limit = 60) { this.limit = limit; this.past = []; this.future = []; }
  static snap(state) {
    const grid = state.shape.sdfGrid;
    const s = structuredClone({ ...state, shape: { ...state.shape, sdfGrid: null } });
    s.shape.sdfGrid = grid;
    return s;
  }
  push(state) {
    const s = History.snap(state);
    const last = this.past[this.past.length - 1];
    if (last && JSON.stringify({ ...last, shape: { ...last.shape, sdfGrid: 0 } }) === JSON.stringify({ ...s, shape: { ...s.shape, sdfGrid: 0 } })) return;
    this.past.push(s);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(History.snap(current));
    return this.past.pop();
  }
  redo(current) {
    if (!this.future.length) return null;
    this.past.push(History.snap(current));
    return this.future.pop();
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
