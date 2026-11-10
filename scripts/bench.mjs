// Banc de performance (point 87) : temps des calculs principaux, compares a une reference.
// Usage : npm run bench. Ecrit bench.json et, dans GitHub Actions, un tableau dans le resume du job.
import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { buildField, makeFieldFn } from '../src/tpms.js';
import { surfaceNets, taubin } from '../src/mesher.js';
import { computeMetrics } from '../src/metrics.js';
import { LBM } from '../src/lbm.js';
import { cellVoxels, homogenize } from '../src/fem.js';
import { applyPreset } from '../src/presets.js';

const time = (fn, reps = 3) => {
  let best = Infinity, out;
  for (let r = 0; r < reps; r++) { const t0 = performance.now(); out = fn(); best = Math.min(best, performance.now() - t0); }
  return [best, out];
};

const p = { ...applyPreset('default'), res: 96 };
const rows = [];
const [tField, field] = time(() => buildField(p));
rows.push(['Champ implicite 96³', tField]);
const [tMesh, mesh] = time(() => surfaceNets(field));
rows.push(['Maillage surface nets', tMesh]);
const [tSmooth] = time(() => { const m = surfaceNets(field); taubin(m, 2); return m; }, 1);
rows.push(['Maillage et lissage de Taubin', tSmooth]);
const [tMetrics] = time(() => computeMetrics(p, field, mesh), 1);
rows.push(['Mesures (transformée de distance)', tMetrics]);
const n = 32, fn = makeFieldFn(p), solid = new Uint8Array(n * n * n);
let q = 0;
for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) solid[q++] = fn.tpms(((i + 0.5) * p.cell) / n, ((j + 0.5) * p.cell) / n, ((k + 0.5) * p.cell) / n) < 0 ? 1 : 0;
const [tLbm] = time(() => { const l = new LBM(solid, n, n, n, { tau: 1, force: 1e-5 }); l.step(200); return l; }, 1);
rows.push(['Perfusion 32³, 200 pas', tLbm]);
const [tFem] = time(() => homogenize(cellVoxels(p, 16), { cases: [2], tol: 1e-5 }), 1);
rows.push(['Éléments finis 16³, un cas', tFem]);

const result = Object.fromEntries(rows.map(([k, v]) => [k, Math.round(v)]));
const base = existsSync('bench.baseline.json') ? JSON.parse(readFileSync('bench.baseline.json', 'utf8')) : null;
writeFileSync('bench.json', JSON.stringify(result, null, 2));
const lines = ['| Calcul | Temps (ms) | Référence (ms) | Écart |', '| --- | ---: | ---: | ---: |'];
let slower = 0;
for (const [k, v] of Object.entries(result)) {
  const b = base && base[k];
  const d = b ? (v / b - 1) * 100 : null;
  if (d != null && d > 50) slower++;
  lines.push(`| ${k} | ${v} | ${b ?? ''} | ${d == null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(0)} %`} |`);
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Performances\n\n${lines.join('\n')}\n`);
// Les machines de CI varient : un ralentissement de plus de 50 % est signale, sans bloquer.
if (slower) console.log(`::warning::${slower} calcul(s) plus lent(s) de 50 % que la référence`);
