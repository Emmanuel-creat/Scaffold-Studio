// Calculs biologiques hors du fil principal : oxygene, ensemencement, croissance tissulaire.
import { specimenBox } from './tpms.js';
import { surfaceNets, taubin } from './mesher.js';
import { oxygenGrid, solveOxygen, oxygenAtVertices, seedCells, growTissue } from './bio.js';

self.onmessage = (e) => {
  const { id, cmd, params } = e.data;
  try {
    const box = specimenBox(params.shape);
    if (cmd === 'oxygen') {
      const b = params.bio;
      const grid = oxygenGrid(e.data.flow, box[2]);
      const opts = { c0: b.c0, vmax: b.vmax * 1e-17, density: b.density, km: b.km, hypoxia: b.hypoxia, iterations: 4000 };
      self.postMessage({ id, stage: 'Oxygène en perfusion' });
      const perf = solveOxygen(grid, opts);
      self.postMessage({ id, stage: 'Oxygène en culture statique' });
      const still = { ...grid, u: new Float32Array(grid.u.length), v: new Float32Array(grid.v.length), w: new Float32Array(grid.w.length) };
      const stat = solveOxygen(still, { ...opts, statique: true, iterations: 10000 });
      const map = e.data.positions ? oxygenAtVertices(e.data.positions, grid, perf.c, perf.profile) : null;
      self.postMessage({
        id, ok: true, cmd,
        perfusion: { profile: perf.profile, cmin: perf.cmin, hypoxicWall: perf.hypoxicWall, iterations: perf.iterations },
        statique: { profile: stat.profile, cmin: stat.cmin, hypoxicWall: stat.hypoxicWall, iterations: stat.iterations },
        map, length: grid.length,
      });
      return;
    }
    if (cmd === 'seed') {
      const b = params.bio;
      const r = seedCells(e.data.flow, box, { cells: b.cells, attach: b.attach });
      self.postMessage({ id, ok: true, cmd, ...r }, [r.track.buffer, r.attached.buffer]);
      return;
    }
    if (cmd === 'tissue') {
      self.postMessage({ id, stage: 'Croissance du tissu' });
      const r = growTissue(params, { lambda: params.bio.lambda * 1e-3, days: 56, snapshots: [7, 14, 28, 42, 56] });
      const meshes = r.shots.map((s) => {
        const m = surfaceNets(s.field);
        taubin(m, 4);
        return { day: s.day, positions: m.positions, normals: m.normals, indices: m.indices };
      });
      self.postMessage({ id, ok: true, cmd, curve: r.curve, halfDay: r.halfDay, meshes },
        meshes.flatMap((m) => [m.positions.buffer, m.normals.buffer, m.indices.buffer]));
    }
  } catch (err) {
    self.postMessage({ id, ok: false, cmd, error: String(err && err.message || err) });
  }
};
