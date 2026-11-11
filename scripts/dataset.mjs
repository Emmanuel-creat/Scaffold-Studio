// Jeu de donnees ouvert (point 97) : un plan d'experiences numerique sur les surfaces, modes et porosites.
// Pour chaque design : morphologie, rigidite (Gibson-Ashby et elements finis), permeabilite.
// Usage : node scripts/dataset.mjs [dossier] ; ecrit designs.csv et un STL par design dans dataset/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildField, makeFieldFn, SURFACES } from '../src/tpms.js';
import { surfaceNets, taubin } from '../src/mesher.js';
import { computeMetrics } from '../src/metrics.js';
import { LBM } from '../src/lbm.js';
import { cellVoxels, homogenize, engineering } from '../src/fem.js';
import { applyPreset } from '../src/presets.js';

const dir = process.argv[2] || 'dataset';
mkdirSync(`${dir}/stl`, { recursive: true });
const types = ['gyroid', 'diamond', 'primitive', 'iwp', 'neovius', 'bcc', 'octet', 'voronoi'];
const porosities = [0.6, 0.7, 0.8];
const rows = [['id', 'surface', 'mode', 'cellule_mm', 'porosite_visee', 'porosite_mesuree', 'pore_moyen_um', 'strut_moyen_um', 'surface_specifique_mm-1', 'E_relatif_EF', 'anisotropie_Zener', 'permeabilite_m2']];

function stl(mesh, name) {
  const { positions: p, indices: ix } = mesh;
  const n = ix.length / 3, buf = Buffer.alloc(84 + n * 50);
  buf.write(name.slice(0, 79), 0);
  buf.writeUInt32LE(n, 80);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [nx / l, ny / l, nz / l]) { buf.writeFloatLE(v, o); o += 4; }
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) { buf.writeFloatLE(p[i + k], o); o += 4; }
    o += 2;
  }
  return buf;
}

for (const type of types) {
  const modes = SURFACES[type].strut ? ['network'] : ['network', 'sheet'];
  for (const mode of modes) for (const porosity of porosities) {
    const id = `${type}_${mode}_${Math.round(porosity * 100)}`;
    const base = applyPreset('default');
    const p = { ...base, type, mode, porosity, cell: 1.5, res: 80, shape: { ...base.shape, kind: 'cube', x: 4.5, y: 4.5, z: 4.5 } };
    const field = buildField(p);
    const mesh = surfaceNets(field);
    taubin(mesh, 2);
    const m = computeMetrics(p, field, mesh);
    const fem = homogenize(cellVoxels(p, 20), { tol: 1e-5 });
    const eng = engineering(fem.C);
    const C = fem.C, zener = (2 * C[21]) / (C[0] - C[1]);
    const n = 24, fn = makeFieldFn(p), solid = new Uint8Array(n ** 3);
    let q = 0;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) solid[q++] = fn.tpms(((i + 0.5) * p.cell) / n, ((j + 0.5) * p.cell) / n, ((k + 0.5) * p.cell) / n) < 0 ? 1 : 0;
    const l = new LBM(solid, n, n, n, { tau: 1, force: 1e-5 });
    l.run({ maxSteps: 8000, chunk: 200, tol: 1e-6 });
    const k = l.permeability() * ((p.cell / n) * 1e-3) ** 2;
    writeFileSync(`${dir}/stl/${id}.stl`, stl(mesh, id));
    rows.push([id, type, mode, p.cell, porosity, m.porosity.toFixed(4), (m.pore.mean * 1000).toFixed(0), (m.strut.mean * 1000).toFixed(0), m.specificSurface.toFixed(3), eng.Ez.toFixed(5), zener.toFixed(3), k.toExponential(4)]);
    console.log(rows[rows.length - 1].join(' '));
  }
}
writeFileSync(`${dir}/designs.csv`, rows.map((r) => r.join(',')).join('\n') + '\n');
writeFileSync(`${dir}/LISEZMOI.md`, `# Jeu de données Scaffold Studio

${rows.length - 1} designs générés par \`node scripts/dataset.mjs\` (Scaffold Studio ${process.env.npm_package_version || ''}), auteur BAILLY emmanuel, licence CC BY 4.0.

- \`designs.csv\` : une ligne par design. Porosité et diamètres mesurés sur un cube de 4,5 mm, soit trois cellules (grille 80³), E relatif = Ez / Es par éléments finis périodiques (20³), perméabilité par Boltzmann sur réseau sur la cellule périodique (24³), cellule de 1,5 mm.
- \`stl/\` : maillage de chaque éprouvette, en millimètres (environ 500 Mo, non versionné : relancer le script pour le produire).

Méthodes : https://github.com/Emmanuel-creat/Scaffold-Studio/blob/main/docs/METHODES.md
`);
