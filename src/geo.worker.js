import { buildField, specimenBox, specimenVolume } from './tpms.js';
import { toAbaqus } from './exporters.js';
import { materialOf } from './metrics.js';
import { surfaceNets, taubin } from './mesher.js';
import { computeMetrics, porosityForStrut, PROCESSES } from './metrics.js';
import { zProfile, closedRegions, removeIslands, geometricTortuosity, percolationDiameter, intrusionCurve, vertexMaps } from './analysis.js';

let current = null;

self.onmessage = (e) => {
  const { id, params, cmd } = e.data;
  current = id;
  try {
    if (cmd === 'abaqus') {
      // Resolution choisie pour rester sous environ 250 000 elements.
      const V = specimenVolume(params.shape) * (1 - params.porosity);
      const h = Math.cbrt(V / 250000);
      const res = Math.max(30, Math.min(160, Math.round(Math.max(...specimenBox(params.shape)) / h)));
      const field = buildField({ ...params, res });
      const solid = new Uint8Array(field.data.length);
      for (let p = 0; p < solid.length; p++) solid[p] = field.data[p] < 0 ? 1 : 0;
      const out = toAbaqus({ solid, nx: field.nx, ny: field.ny, nz: field.nz, h: field.hx, origin: field.origin.map((o) => o - field.hx / 2) },
        { E: materialOf(params).E * 1000, name: e.data.name });
      self.postMessage({ id, ok: true, cmd, ...out });
      return;
    }
    if (cmd === 'inverseStrut') {
      self.postMessage({ id, ok: true, cmd, porosity: porosityForStrut(params, e.data.target) });
      return;
    }
    const t0 = performance.now();
    self.postMessage({ id, stage: 'Échantillonnage du champ' });
    const field = buildField(params);
    const removed = params.clean === false ? 0 : removeIslands(field);
    self.postMessage({ id, stage: 'Maillage de la surface' });
    const mesh = surfaceNets(field);
    if (params.smooth > 0) {
      self.postMessage({ id, stage: 'Lissage du maillage' });
      taubin(mesh, params.smooth);
    }
    self.postMessage({ id, stage: 'Mesures morphologiques' });
    const metrics = computeMetrics(params, field, mesh);
    const dt = metrics._dt;
    delete metrics._dt;
    metrics.timeMs = performance.now() - t0;
    metrics.res = field.res;
    metrics.removedIslands = removed;
    metrics.capped = field.res !== params.res;
    const preview = !!e.data.preview;
    const keep = preview ? null : { positions: mesh.positions.slice(), normals: mesh.normals.slice(), indices: mesh.indices.slice() };
    self.postMessage({ id, ok: true, mesh, metrics, preview },
      [mesh.positions.buffer, mesh.indices.buffer, mesh.normals.buffer]);
    if (preview) return;
    // Analyses avancees, envoyees apres le maillage pour ne pas retarder l'affichage.
    const ta = performance.now();
    const maps = vertexMaps(params, field, keep, dt, { overhangDeg: PROCESSES[params.process].overhang });
    const analysis = {
      profile: zProfile(field),
      closed: closedRegions(field),
      tortuosity: geometricTortuosity(field),
      percolation: percolationDiameter(field, dt.dtVoid),
      overhangFraction: maps.overhangFraction, concaveFraction: maps.concaveFraction,
      meanCurvature: maps.meanCurvature, curvatureScale: maps.curvatureScale,
      saddleFraction: maps.saddleFraction, accessibleFraction: maps.accessibleFraction, gaussScale: maps.gaussScale,
    };
    const ds = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5].filter((d) => d / field.hx > 0.7);
    analysis.intrusion = intrusionCurve(field, dt.dtVoid, ds);
    analysis.timeMs = performance.now() - ta;
    const m = { thickness: maps.thickness, pore: maps.pore, curvature: maps.curvature, overhang: maps.overhang, gauss: maps.gauss };
    self.postMessage({ id, analysis, maps: m }, Object.values(m).map((a) => a.buffer));
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
