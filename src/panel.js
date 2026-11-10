// Panneau des mesures, avec les plages de reference de l'os.
import { materialOf, PROCESSES, BONE } from './metrics.js';
import { specimenBox } from './tpms.js';
import { MU } from './flow.js';
import { t } from './i18n.js';
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

export function renderMetrics(root, state, m, flowStatus, flow, wss, tensor) {
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
    <div class="m-group"><h3>${t('Perfusion')}</h3>${perf}</div>
    <div class="m-group"><p class="hint">${t('Estimations de conception (Gibson-Ashby, Boltzmann sur réseau). À confirmer par éléments finis et par essais.')}</p></div>`;
}
