// Panneau des mesures, avec les plages de reference de l'os.
import { materialOf, PROCESSES, BONE } from './metrics.js';
import { specimenBox } from './tpms.js';
import { MU } from './flow.js';
import { t } from './i18n.js';
import { compressionCurve, fatigue, buckling, degradation, gradedModulus } from './mechanics.js';
import { lineChart } from './charts.js';
import { fmt, pct, sci, scalePos } from './format.js';

function scale(value, lo, hi, log, bands, labels) {
  const b = bands.map(([a, z, cls]) => {
    const l = scalePos(a, lo, hi, log) * 100, r = scalePos(z, lo, hi, log) * 100;
    return `<span class="band ${cls}" style="left:${l}%;width:${Math.max(r - l, 0.8)}%"></span>`;
  }).join('');
  const mark = Number.isFinite(value) ? `<span class="mark" style="left:${scalePos(value, lo, hi, log) * 100}%"></span>` : '';
  return `<div class="scale"><span class="track"></span>${b}${mark}</div><div class="scale-legend">${labels.map((t) => `<span>${t}</span>`).join('')}</div>`;
}

const metric = (name, val, unit, extra = '', tip = '') =>
  `<div class="metric"><div class="top"><span class="name"${tip ? ` title="${tip}"` : ''}>${name}</span><span class="val">${val}<small>${unit}</small></span></div>${extra}</div>`;

const KEY = `<div class="legend-key"><span><i style="background:var(--bone)"></i>${t('os spongieux')}</span><span><i style="background:#b9a37a"></i>${t('os cortical')}</span><span><i style="background:var(--good)"></i>${t('cible')}</span></div>`;

// Perte de charge a travers l'eprouvette (Pa), loi de Darcy : dp = mu v L / k.
export function pressureDrop(state, k) {
  if (!(k > 0)) return NaN;
  const [, , Z] = specimenBox(state.shape);
  return (MU * state.flow.inlet * 1e-3 * Z * 1e-3) / k;
}

const TIPS = {
  porosity: 'φ = 1 − V(solide) / V(éprouvette), volume du maillage fermé',
  pore: 'Diamètre de la plus grande sphère inscrite dans le vide, pris sur les crêtes de la transformée de distance exacte',
  strut: 'Diamètre de la plus grande sphère inscrite dans le solide, pris sur les crêtes de la transformée de distance',
  ss: 'S / V(solide)',
  inter: 'Fraction du vide atteinte depuis les faces de l\'éprouvette par remplissage 26-connexe',
  E: 'Gibson-Ashby : E* = C · Es · (1 − φ)ⁿ',
  sy: 'Gibson-Ashby : σ* = 0,3 · σs · (1 − φ)^1,5',
  mass: 'm = V(solide) · ρ',
  k: 'Darcy : k = μ · ⟨u⟩ / (ρ g), Boltzmann sur réseau D3Q19 à collision TRT',
  dp: 'Δp = μ · v · L / k, avec μ = 0,75 mPa·s (milieu de culture à 37 °C)',
  wss: 'τ = μ · |u(d)| / d, vitesse prise à une distance d de la paroi',
};

export function renderMetrics(root, state, m, flowStatus, flow, wss, tensor, fem) {
  if (!m) { root.innerHTML = `<div class="m-group"><h3>${t('Mesures')}</h3><p class="hint">${t('Calcul en cours…')}</p></div>`; return; }
  const mat = materialOf(state);
  const proc = PROCESSES[state.process];
  const morph = [
    metric(t('Porosité mesurée'), pct(m.porosity, 1), ' %',
      scale(m.porosity, 0, 1, false, [[BONE.cortical.porosity[0], BONE.cortical.porosity[1], 'cort'], [BONE.trabecular.porosity[0], BONE.trabecular.porosity[1], 'bone']], ['0', '50 %', '100 %']), TIPS.porosity),
    metric(t('Diamètre de pore moyen'), fmt(m.pore.mean * 1000, 0), ' µm',
      scale(m.pore.mean, 0, 2, false, [[BONE.poreTarget[0], BONE.poreTarget[1], 'target']], ['0', '1 mm', '2 mm']), TIPS.pore),
    metric(t('Épaisseur de strut'), fmt(m.strut.mean * 1000, 0), ' µm', `<span class="hint">${t('10 % des struts sous')} ${fmt(m.strut.p10 * 1000, 0)} µm</span>`, TIPS.strut),
    metric(t('Surface spécifique'), fmt(m.specificSurface, 2), ' mm⁻¹', '', TIPS.ss),
    metric(t('Interconnectivité des pores'), pct(m.interconnectivity, 1), ' %', '', TIPS.inter),
  ].join('');
  const meca = [
    metric(t('Module de Young estimé'), m.E < 1 ? fmt(m.E * 1000, 0) : fmt(m.E, 2), m.E < 1 ? ' MPa' : ' GPa',
      scale(m.E, 0.01, 300, true, [[BONE.trabecular.E[0], BONE.trabecular.E[1], 'bone'], [BONE.cortical.E[0], BONE.cortical.E[1], 'cort']], ['10 MPa', '1 GPa', '100 GPa']), TIPS.E),
    metric(t('Limite d\'élasticité estimée'), fmt(m.sy, 1), ' MPa',
      scale(m.sy, 0.1, 1000, true, [[BONE.trabecular.sy[0], BONE.trabecular.sy[1], 'bone'], [BONE.cortical.sy[0], BONE.cortical.sy[1], 'cort']], ['0,1', '10', '1 000 MPa']), TIPS.sy),
    metric(t('Masse'), fmt(m.mass, 3), ' g', '', TIPS.mass),
    `<span class="flag ${m.printable ? 'ok' : 'ko'}">${m.printable ? t('Imprimable') : t('Struts trop fins')} · ${t(proc.label).toLowerCase()}, ${t('détail minimal')} ${fmt(m.minFeature * 1000, 0)} µm</span>`,
  ].join('');

  let perf;
  const st = flowStatus.state;
  if (st === 'idle') {
    perf = `<p class="hint">${t('Lance la perfusion pour calculer la perméabilité, voir le milieu de culture circuler et estimer le cisaillement sur les parois.')}</p>`;
  } else {
    const label = { running: t('Calcul en cours'), converged: t('Écoulement établi'), stopped: t('Arrêté'), max: t('Limite d\'itérations atteinte') }[st];
    const dp = pressureDrop(state, flowStatus.permeability);
    perf = [
      metric(t('Perméabilité (Darcy)'), sci(flowStatus.permeability, 2), ' m²',
        scale(flowStatus.permeability, 1e-12, 1e-6, true, [[BONE.trabecular.k[0], BONE.trabecular.k[1], 'bone']], ['10⁻¹²', '10⁻⁹', '10⁻⁶']), TIPS.k),
      metric(t('Perte de charge'), dp < 1 ? fmt(dp * 1000, 1) : fmt(dp, 2), dp < 1 ? ' mPa' : ' Pa', '', TIPS.dp),
      flow ? metric(t('Vitesse maximale dans les pores'), fmt(flow.maxPhys, 2), ' mm/s') : '',
      wss ? metric(t('Cisaillement pariétal médian'), fmt(wss.median * 1000, 2), ' mPa', '', TIPS.wss) : '',
      wss ? metric(`${t('Surface entre')} ${fmt(state.flow.wssLow, 1)} ${t('et')} ${fmt(state.flow.wssHigh, 1)} mPa`, pct(wss.inWindow, 0), ' %',
        scale(wss.inWindow, 0, 1, false, [], ['0', '50 %', '100 %'])) : '',
      `<span class="hint">${label} · ${(flowStatus.steps || 0).toLocaleString('fr-FR')} ${t('itérations')}</span>`,
    ].join('');
  }
  if (tensor) {
    const k = tensor.k || {};
    const v = ['x', 'y', 'z'].map((a) => `<div><b>k${a}</b><span>${k[a] ? sci(k[a], 2) : (tensor.running ? '…' : '·')}</span></div>`).join('');
    const ks = ['x', 'y', 'z'].map((a) => k[a]).filter(Boolean);
    const ratio = ks.length === 3 ? Math.max(...ks) / Math.min(...ks) : NaN;
    perf += `<div class="tensor" title="${t('Perméabilité diagonale calculée avec la force motrice selon chaque axe')}">${v}</div>`
      + (Number.isFinite(ratio) ? `<span class="hint">${t('Anisotropie')} kmax / kmin = ${fmt(ratio, 2)}</span>` : '');
  }
  const capped = m.capped ? `<p class="flag ko">${t('Résolution réduite à')} ${m.res} ${t('pour tenir en mémoire')}</p>` : '';

  root.innerHTML = `
    <div class="m-group"><h3>${t('Morphologie')}</h3>${capped}${morph}${KEY}</div>
    <div class="m-group"><h3>${t('Mécanique')} · ${t(mat.label)}</h3>${meca}</div>
    ${advanced(state, m, fem)}
    ${resorption(state, m, fem)}
    <div class="m-group"><h3>${t('Perfusion')}</h3>${perf}</div>
    <div class="m-group"><p class="hint">${t('Estimations de conception (Gibson-Ashby, Boltzmann sur réseau). À confirmer par éléments finis et par essais.')}</p></div>`;
}

const fitKey = (s) => `${s.type}|${s.mode}`;
const gpa = (v) => (v < 1 ? `${fmt(v * 1000, 0)}<small> MPa</small>` : `${fmt(v, 2)}<small> GPa</small>`);

// Elements finis, compression, fatigue et flambement.
function advanced(state, m, fem) {
  const mat = materialOf(state);
  const fit = state.gaFits && state.gaFits[fitKey(state)];
  let femHtml;
  if (fem && fem.running) {
    femHtml = `<p class="hint"><span class="spinner inline"></span> ${t(fem.stage || 'Calcul en cours')}</p>`;
  } else if (fem && fem.result) {
    const r = fem.result, e = r.eng;
    const firstYield = mat.sy / r.kt99;
    const pts = r.points.map((p) => [p.rho, p.E]).sort((a, b) => a[0] - b[0]);
    const line = Array.from({ length: 30 }, (_, i) => { const rho = 0.05 + (i / 29) * 0.6; return [rho, r.fit.C * rho ** r.fit.n]; });
    const generic = state.mode === 'sheet' ? { C: 0.6, n: 1.5 } : { C: 1, n: 2 };
    const gen = line.map(([rho]) => [rho, generic.C * rho ** generic.n]);
    const graded = state.gradient.kind !== 'none' ? gradedModulus(state, r.fit) : NaN;
    femHtml = `
      <div class="fem-grid">
        <div><b>Ex</b><span>${gpa(e.Ex * mat.E)}</span></div><div><b>Ey</b><span>${gpa(e.Ey * mat.E)}</span></div><div><b>Ez</b><span>${gpa(e.Ez * mat.E)}</span></div>
        <div><b>Gyz</b><span>${gpa(e.Gyz * mat.E)}</span></div><div><b>νxy</b><span>${fmt(e.nuxy, 2)}</span></div><div><b>A</b><span title="${t('Anisotropie de Zener, 1 pour un matériau isotrope')}">${fmt(r.zener, 2)}</span></div>
      </div>
      ${metric(t('Concentration de contrainte (p99)'), fmt(r.kt99, 1), ' ×', '', t('Contrainte de von Mises locale au 99e centile, rapportée à la contrainte appliquée'))}
      ${metric(t('Première plastification'), fmt(firstYield, 1), ' MPa', '', t('Contrainte appliquée pour laquelle 1 % du solide atteint la limite d\'élasticité du matériau dense'))}
      ${Number.isFinite(graded) ? metric(t('Module de l\'éprouvette à gradient'), graded < 1 ? fmt(graded * 1000, 0) : fmt(graded, 2), graded < 1 ? ' MPa' : ' GPa', '', t('Moyenne de Voigt dans chaque tranche, puis de Reuss selon la hauteur')) : ''}
      <div class="chart-box"><div class="chart-title">${t('Gibson-Ashby ajusté')} : E*/Es = ${fmt(r.fit.C, 2)} · ρ<sup>${fmt(r.fit.n, 2)}</sup> <small>(R² ${fmt(r.fit.r2, 3)})</small></div>
      ${lineChart({ series: [{ pts: gen, cls: 'ref' }, { pts: line, cls: 'acc' }, { pts: pts, dots: true, cls: 'acc' }], xlabel: t('densité relative ρ'), ylabel: 'E*/Es', xlog: true, ylog: true, xmin: 0.05, xmax: 0.65, ymin: 1e-4, ymax: 0.5 })}
      <div class="legend-key"><span><i style="background:var(--accent)"></i>${t('éléments finis')}</span><span><i style="background:var(--muted)"></i>${t('loi générique')}</span></div></div>
      <div class="row2">
        <button class="btn" data-act="vm" aria-pressed="${fem.showVm ? 'true' : 'false'}">${fem.showVm ? t('Masquer la carte de contrainte') : t('Carte de contrainte')}</button>
        <button class="btn" data-act="fem">${t('Recalculer')}</button>
      </div>
      <p class="hint">${t('Cellule périodique')} ${r.dims.join(' × ')} voxels, ${r.iterations.toLocaleString('fr-FR')} ${t('itérations')}, ${fmt(r.timeMs / 1000, 1)} s.${fit ? ` ${t('L\'ajustement remplace la loi générique dans les mesures.')}` : ''}${state.rotation && (state.rotation.x || state.rotation.y || state.rotation.z) ? ` ${t('Modules donnés dans le repère de la cellule, avant rotation.')}` : ''}</p>`;
  } else {
    femHtml = `<p class="hint">${t('Homogénéisation par éléments finis voxel de la cellule : tenseur de rigidité, carte de von Mises et loi de Gibson-Ashby propre à cette surface.')}</p>
      <button class="btn wide" data-act="fem">${t('Calculer par éléments finis')}</button>${fem && fem.error ? `<p class="flag ko">${fem.error}</p>` : ''}`;
  }

  const cc = compressionCurve(state, m);
  const fa = fatigue(state, m);
  const bk = buckling(state, m);
  return `<div class="m-group" id="g-fem"><h3>${t('Éléments finis')}</h3>${femHtml}</div>
    <div class="m-group"><h3>${t('Compression (ISO 13314)')}</h3>
      <div class="chart-box">${lineChart({ series: [{ pts: cc.pts, cls: 'acc' }], xlabel: t('déformation'), ylabel: 'MPa', vlines: [{ x: cc.eD, label: 'εD' }], hlines: [{ y: cc.plateau, label: 'σpl' }] })}</div>
      <div class="kv">
        <span>${t('Contrainte de plateau')}</span><b>${fmt(cc.plateau, 1)} MPa</b>
        <span>${t('Fin de plateau')}</span><b>${fmt(cc.plateauEnd, 1)} MPa</b>
        <span>${t('Densification')}</span><b>${pct(cc.eD, 0)} %</b>
        <span>${t('Énergie absorbée à 50 %')}</span><b>${fmt(cc.W50, 2)} MJ/m³</b>
      </div>
      <p class="hint">${t('Courbe modèle (élastique, plateau, densification) pour préparer l\'essai, à remplacer par la courbe mesurée.')}</p>
    </div>
    <div class="m-group"><h3>${t('Fatigue et flambement')}</h3>
      ${metric(t('Endurance à 10⁶ cycles'), fmt(fa.endurance, 1), ' MPa', '', t('Loi de Basquin normalisée : σ(10⁶) ≈ ratio × limite d\'élasticité du scaffold'))}
      <div class="chart-box">${lineChart({ series: [{ pts: fa.curve, cls: 'acc' }], xlabel: t('cycles'), ylabel: 'MPa', xlog: true, ymin: 0 })}</div>
      ${bk ? metric(t('Élancement des struts'), fmt(bk.lambda, 1), '', '', t('λ = L / r, avec L ≈ cellule / 2 et r = d / 4')) + `<span class="flag ${bk.safe ? 'ok' : 'ko'}">${bk.safe ? t('Plastification avant flambement') : t('Risque de flambement des struts')} · σcr / σy ${bk.ratio > 10 ? '> 10' : fmt(bk.ratio, 1)}</span>` : ''}
    </div>`;
}

// Resorption des materiaux biodegradables.
function resorption(state, m, fem) {
  const fit = state.gaFits && state.gaFits[fitKey(state)];
  const d = degradation(state, m, fit);
  if (!d) return '';
  const Emax = Math.max(...d.E) || 1;
  const Esr = d.months.map((tm, i) => [tm, d.E[i] / Emax]);
  const Ms = d.months.map((tm, i) => [tm, d.mass[i]]);
  const e6 = d.E[6];
  const ok = e6 >= BONE.trabecular.E[0];
  return `<div class="m-group"><h3>${t('Résorption')}</h3>
    <div class="chart-box">${lineChart({ series: [{ pts: Ms, cls: 'bone' }, { pts: Esr, cls: 'acc' }], xlabel: t('mois'), ylabel: t('fraction'), ymin: 0, ymax: 1.05, vlines: [{ x: 6, label: t('6 mois') }] })}
    <div class="legend-key"><span><i style="background:var(--accent)"></i>${t('rigidité')}</span><span><i style="background:var(--bone)"></i>${t('masse')}</span></div></div>
    ${metric(t('Masse restante à 12 mois'), pct(d.mass[12], 0), ' %')}
    ${metric(t('Module à 6 mois'), e6 < 1 ? fmt(e6 * 1000, 0) : fmt(e6, 2), e6 < 1 ? ' MPa' : ' GPa')}
    <span class="flag ${ok ? 'ok' : 'ko'}">${ok ? t('Rigidité maintenue pendant la consolidation') : t('Rigidité sous l\'os spongieux avant 6 mois')}</span>
    <p class="hint">${d.kind === 'surface' ? t('Érosion de surface appliquée à la transformée de distance du solide') : t('Hydrolyse en masse')} · ${t(d.ref)}</p>
  </div>`;
}
