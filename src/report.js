// Rapport de conception autonome (HTML imprimable en PDF), points 30 et 59.
import { SURFACES, MODES, SHAPES, GRADIENTS, specimenBox } from './tpms.js';
import { materialOf, PROCESSES } from './metrics.js';
import { compressionCurve, fatigue, buckling, degradation } from './mechanics.js';
import { buildEstimate } from './fabrication.js';
import { pressureDrop } from './panel.js';
import { lineChart, barChart } from './charts.js';
import { fmt, pct, sci } from './format.js';
import { t, getLang } from './i18n.js';

export const REFERENCES = [
  'Gibson L.J., Ashby M.F. Cellular Solids: Structure and Properties. Cambridge University Press, 1997.',
  'Felzenszwalb P.F., Huttenlocher D.P. Distance transforms of sampled functions. Theory of Computing 8, 2012.',
  'Ginzburg I., Verhaeghe F., d\'Humières D. Two-relaxation-time lattice Boltzmann scheme. Communications in Computational Physics 3, 2008.',
  'Sangani A.S., Acrivos A. Slow flow through a periodic array of spheres. International Journal of Multiphase Flow 8, 1982.',
  'ISO 13314:2011. Essais mécaniques des métaux, ductilité, essai de compression des métaux poreux et cellulaires.',
  'Koponen A., Kataja M., Timonen J. Tortuous flow in porous media. Physical Review E 54, 1996.',
  'Hildebrand T., Rüegsegger P. A new method for the model-independent assessment of thickness in three-dimensional images. Journal of Microscopy 185, 1997.',
  'Karageorgiou V., Kaplan D. Porosity of 3D biomaterial scaffolds and osteogenesis. Biomaterials 26, 2005.',
  'Rumpler M. et al. The effect of geometry on three-dimensional tissue growth. Journal of the Royal Society Interface 5, 2008.',
  'Zadpoor A.A. Mechanical performance of additively manufactured meta-biomaterials. Acta Biomaterialia 85, 2019.',
  'Hollister S.J. Porous scaffold design for tissue engineering. Nature Materials 4, 2005.',
];

const CSS = `
body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#1d232c;max-width:900px;margin:32px auto;padding:0 24px;background:#fff}
h1{font-size:24px;margin:0}h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:#4a5566;border-bottom:1px solid #d9dee5;padding-bottom:4px;margin-top:28px}
.sub{color:#5b6573;margin:4px 0 16px}img.view{width:100%;border-radius:8px;border:1px solid #d9dee5}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border-bottom:1px solid #eceff3;padding:5px 8px;text-align:left;vertical-align:top}
td.v{text-align:right;font-family:Consolas,monospace;white-space:nowrap}th{font-weight:600;color:#4a5566;font-size:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.note{color:#5b6573;font-size:12.5px}
.chart{width:100%;height:auto}.chart .grid{stroke:#e3e7ec}.chart .tick{fill:#6b7584;font:8.5px Consolas,monospace}.chart .tick.lab{fill:#1d232c}
.chart .axis{fill:#6b7584;font:9px sans-serif}.chart .line{fill:none;stroke-width:1.8}.chart .line.acc{stroke:#178f7d}.chart .line.ref{stroke:#9aa3ad;stroke-dasharray:3 3}
.chart .line.bone{stroke:#b39552}.chart .dot{fill:#178f7d}.chart .vline{stroke:#d08a1e;stroke-dasharray:2 3}.chart .bar.acc{fill:#178f7d}.chart .bar.bone{fill:#c9b07a}
ol{padding-left:20px;font-size:12.5px;color:#3b4552}footer{margin-top:32px;color:#8a93a0;font-size:12px}
@media print{body{margin:0}h2{break-after:avoid}table,svg,img{break-inside:avoid}.noprint{display:none}}`;

const rows = (list) => `<table>${list.filter(Boolean).map(([k, v, u = '']) => `<tr><td>${k}</td><td class="v">${v}${u ? ` ${u}` : ''}</td></tr>`).join('')}</table>`;

export function buildReport(state, app, image) {
  const m = app.metrics;
  const mat = materialOf(state);
  const proc = PROCESSES[state.process];
  const [X, Y, Z] = specimenBox(state.shape);
  const date = new Date().toLocaleDateString(getLang() === 'fr' ? 'fr-FR' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const cc = compressionCurve(state, m);
  const fa = fatigue(state, m);
  const bk = buckling(state, m);
  const fit = state.gaFits && state.gaFits[`${state.type}|${state.mode}`];
  const dg = degradation(state, m, fit);
  const fab = buildEstimate(state, m);
  const a = app.analysis;
  const fem = app.fem && app.fem.result;
  const k = app.flowStatus && app.flowStatus.permeability;
  const histo = (st, cls) => (st.hist ? barChart({ bins: st.hist.counts.map((c, i) => [(i + 0.5) * (st.hist.max / st.hist.counts.length) * 1000, c]), cls, xlabel: 'µm' }) : '');

  const params = rows([
    [t('Surface'), t(SURFACES[state.type].label)], [t('Mode'), t(MODES[state.mode])],
    [t('Taille de cellule'), fmt(state.cell, 2), 'mm'], [t('Porosité visée'), pct(state.porosity, 1), '%'],
    [t('Anisotropie'), `${state.aniso.x} × ${state.aniso.y} × ${state.aniso.z}`],
    [t('Rotation'), `${state.rotation.x}°, ${state.rotation.y}°, ${state.rotation.z}°`],
    [t('Forme'), state.shape.kind === 'stl' ? `STL ${state.shape.name || ''}` : t(SHAPES[state.shape.kind])],
    [t('Dimensions'), `${fmt(X, 1)} × ${fmt(Y, 1)} × ${fmt(Z, 1)}`, 'mm'],
    state.skin.t > 0 && [t('Peau pleine'), fmt(state.skin.t, 2), 'mm'],
    [t('Gradient'), t(GRADIENTS[state.gradient.kind])],
    state.gradient.kind !== 'none' && [t('Porosité finale'), pct(state.gradient.p1, 1), '%'],
    [t('Matériau'), t(mat.label)], [t('Procédé de fabrication'), t(proc.label)],
  ]);
  const morph = rows([
    [t('Porosité mesurée'), pct(m.porosity, 1), '%'], [t('Diamètre de pore moyen'), fmt(m.pore.mean * 1000, 0), 'µm'],
    [t('Épaisseur de strut'), `${fmt(m.strut.mean * 1000, 0)} (p10 ${fmt(m.strut.p10 * 1000, 0)})`, 'µm'],
    [t('Surface spécifique'), fmt(m.specificSurface, 2), 'mm⁻¹'], [t('Interconnectivité des pores'), pct(m.interconnectivity, 1), '%'],
    a && [t('Diamètre de passage'), fmt(a.percolation * 1000, 0), 'µm'],
    a && a.tortuosity && [t('Tortuosité géométrique'), fmt(a.tortuosity, 2)],
    a && [t('Surface concave'), pct(a.concaveFraction, 0), '%'],
    a && [t('Volumes de vide fermés'), a.closed.closedCount], a && [t('Îlots solides détachés'), a.closed.islands],
  ]);
  const meca = rows([
    [t('Module de Young estimé'), fmt(m.E, 3), 'GPa'], [t('Limite d\'élasticité estimée'), fmt(m.sy, 1), 'MPa'], [t('Masse'), fmt(m.mass, 3), 'g'],
    fem && ['Ex, Ey, Ez (FE)', `${fmt(fem.eng.Ex * mat.E, 2)}, ${fmt(fem.eng.Ey * mat.E, 2)}, ${fmt(fem.eng.Ez * mat.E, 2)}`, 'GPa'],
    fem && [t('Concentration de contrainte (p99)'), fmt(fem.kt99, 1)],
    fem && [t('Gibson-Ashby ajusté'), `C = ${fmt(fem.fit.C, 2)}, n = ${fmt(fem.fit.n, 2)}`],
    [t('Contrainte de plateau'), fmt(cc.plateau, 1), 'MPa'], [t('Densification'), pct(cc.eD, 0), '%'],
    [t('Énergie absorbée à 50 %'), fmt(cc.W50, 2), 'MJ/m³'], [t('Endurance à 10⁶ cycles'), fmt(fa.endurance, 1), 'MPa'],
    bk && [t('Élancement des struts'), fmt(bk.lambda, 1)],
  ]);
  const perf = k ? rows([
    [t('Perméabilité (Darcy)'), sci(k, 2), 'm²'], [t('Perte de charge'), fmt(pressureDrop(state, k), 3), 'Pa'],
    app.tensor && app.tensor.k.x && ['kx, ky, kz', `${sci(app.tensor.k.x, 2)}, ${sci(app.tensor.k.y, 2)}, ${sci(app.tensor.k.z, 2)}`, 'm²'],
    app.flow && [t('Vitesse maximale dans les pores'), fmt(app.flow.maxPhys, 2), 'mm/s'],
    app.flow && [t('Tortuosité hydraulique'), fmt(app.flow.tortuosity, 2)],
    app.wss && [t('Cisaillement pariétal médian'), fmt(app.wss.median * 1000, 2), 'mPa'],
  ]) : `<p class="note">${t('Perfusion non calculée.')}</p>`;
  const fabT = rows([
    [t('Couches'), `${fab.layers} × ${fmt(fab.layer * 1000, 0)} µm`], [t('Temps pour une pièce'), fmt(fab.hoursOne, 2), 'h'],
    [t('Pièces par plateau'), fab.perPlate], [t('Coût par pièce, plateau plein'), fmt(fab.costPlate, 1), '€'],
    a && [t('Surface en surplomb'), pct(a.overhangFraction, 1), '%'],
  ]);

  return `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><title>Scaffold Studio, ${t('rapport de conception')}</title><style>${CSS}</style></head><body>
<h1>${t('Rapport de conception de scaffold')}</h1>
<p class="sub">${t(SURFACES[state.type].label)}, ${t(mat.label)} · ${date} · Scaffold Studio</p>
${image ? `<img class="view" src="${image}" alt="${t('Vue 3D du scaffold')}">` : ''}
<h2>${t('Paramètres')}</h2>${params}
<div class="grid"><div><h2>${t('Morphologie')}</h2>${morph}</div><div><h2>${t('Mécanique')}</h2>${meca}</div></div>
<div class="grid"><div><h3>${t('Diamètre de pore')}</h3>${histo(m.pore, 'acc')}</div><div><h3>${t('Épaisseur de strut')}</h3>${histo(m.strut, 'bone')}</div></div>
<div class="grid"><div><h3>${t('Compression (ISO 13314)')}</h3>${lineChart({ series: [{ pts: cc.pts, cls: 'acc' }], xlabel: t('déformation'), ylabel: 'MPa', vlines: [{ x: cc.eD, label: 'εD' }] })}</div>
<div><h3>${t('Fatigue et flambement')}</h3>${lineChart({ series: [{ pts: fa.curve, cls: 'acc' }], xlabel: t('cycles'), ylabel: 'MPa', xlog: true, ymin: 0 })}</div></div>
${dg ? `<h2>${t('Résorption')}</h2>${lineChart({ series: [{ pts: dg.months.map((x, i) => [x, dg.mass[i]]), cls: 'bone' }, { pts: dg.months.map((x, i) => [x, dg.E[i] / (Math.max(...dg.E) || 1)]), cls: 'acc' }], xlabel: t('mois'), ylabel: t('fraction'), ymin: 0, ymax: 1.05, w: 520, h: 160 })}` : ''}
<h2>${t('Perfusion')}</h2>${perf}
<h2>${t('Fabrication')}</h2>${fabT}
<h2>${t('Méthodes')}</h2>
<p>${t('Surfaces minimales triplement périodiques seuillées pour atteindre la porosité visée, maillage par surface nets. Diamètres par sphères inscrites sur la transformée de distance exacte. Rigidité par Gibson-Ashby, ajustée par éléments finis voxel quand ils ont été calculés. Perfusion par Boltzmann sur réseau D3Q19 à collision TRT, validée sur l\'écoulement de Poiseuille et sur un réseau de sphères. Courbe de compression, fatigue, flambement et résorption issus de modèles de conception.')}</p>
<p class="note">${t('Ces valeurs sont des estimations de conception. Elles orientent un choix d\'architecture et doivent être confirmées par éléments finis détaillés et par essais.')}</p>
<h2>${t('Références')}</h2><ol>${REFERENCES.map((r) => `<li>${r}</li>`).join('')}</ol>
<footer>${t('Généré par Scaffold Studio')} · BAILLY emmanuel · <span class="noprint">${t('Imprimer en PDF : Ctrl+P')}</span></footer>
</body></html>`;
}
