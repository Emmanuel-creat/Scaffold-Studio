import { buildField } from './tpms.js';
import { surfaceNets } from './mesher.js';
import { computeMetrics } from './metrics.js';

self.onmessage = (e) => {
  const { id, params } = e.data;
  try {
    const t0 = performance.now();
    const field = buildField(params);
    const mesh = surfaceNets(field);
    const metrics = computeMetrics(params, field, mesh);
    metrics.timeMs = performance.now() - t0;
    self.postMessage({ id, ok: true, mesh, metrics }, [mesh.positions.buffer, mesh.indices.buffer, mesh.normals.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
