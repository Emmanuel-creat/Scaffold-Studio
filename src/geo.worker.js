import { buildField } from './tpms.js';
import { surfaceNets, taubin } from './mesher.js';
import { computeMetrics, porosityForStrut } from './metrics.js';

self.onmessage = (e) => {
  const { id, params, cmd } = e.data;
  try {
    if (cmd === 'inverseStrut') {
      self.postMessage({ id, ok: true, cmd, porosity: porosityForStrut(params, e.data.target) });
      return;
    }
    const t0 = performance.now();
    self.postMessage({ id, stage: 'Échantillonnage du champ' });
    const field = buildField(params);
    self.postMessage({ id, stage: 'Maillage de la surface' });
    const mesh = surfaceNets(field);
    if (params.smooth > 0) {
      self.postMessage({ id, stage: 'Lissage du maillage' });
      taubin(mesh, params.smooth);
    }
    self.postMessage({ id, stage: 'Mesures morphologiques' });
    const metrics = computeMetrics(params, field, mesh);
    metrics.timeMs = performance.now() - t0;
    metrics.res = field.res;
    metrics.capped = field.res !== params.res;
    self.postMessage({ id, ok: true, mesh, metrics, preview: !!e.data.preview },
      [mesh.positions.buffer, mesh.indices.buffer, mesh.normals.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
