// Panneau des mesures, avec les plages de reference de l'os.
import { MATERIALS, PROCESSES, BONE } from './metrics.js';
import { fmt, pct, sci, scalePos } from './format.js';

function scale(value, lo, hi, log, bands, labels) {
  const b = bands.map(([a, z, cls]) => {
    const l = scalePos(a, lo, hi, log) * 100, r = scalePos(z, lo, hi, log) * 100;
    return `<span class="band ${cls}" style="left:${l}%;width:${Math.max(r - l, 0.8)}%"></span>`;
  }).join('');
  const mark = Number.isFinite(value) ? `<span class="mark" style="left:${scalePos(value, lo, hi, log) * 100}%"></span>` : '';
  return `<div class="scale"><span class="track"></span>${b}${mark}</div><div class="scale-legend">${labels.map((t) => `<span>${t}</span>`).join('')}</div>`;
}

const metric = (name, val, unit, extra = '') =>
  `<div class="metric"><div class="top"><span class="name">${name}</span><span class="val">${val}<small>${unit}</small></span></div>${extra}</div>`;

const KEY = `<div class="legend-key"><span><i style="background:var(--bone)"></i>os spongieux</span><span><i style="background:#b9a37a"></i>os cortical</span><span><i style="background:var(--good)"></i>cible</span></div>`;

export function renderMetrics(root, state, m, flowStatus, flow, wss) {
  if (!m) { root.innerHTML = '<div class="m-group"><h3>Mesures</h3><p class="hint">Calcul en cours…</p></div>'; return; }
  const mat = MATERIALS[state.material];
  const proc = PROCESSES[state.process];
  const morph = [
    metric('Porosité mesurée', pct(m.porosity, 1), ' %',
      scale(m.porosity, 0, 1, false, [[BONE.cortical.porosity[0], BONE.cortical.porosity[1], 'cort'], [BONE.trabecular.porosity[0], BONE.trabecular.porosity[1], 'bone']], ['0', '50 %', '100 %'])),
    metric('Diamètre de pore moyen', fmt(m.pore.mean * 1000, 0), ' µm',
      scale(m.pore.mean, 0, 2, false, [[BONE.poreTarget[0], BONE.poreTarget[1], 'target']], ['0', '1 mm', '2 mm'])),
    metric('Épaisseur de strut', fmt(m.strut.mean * 1000, 0), ' µm', `<span class="hint">10 % des struts sous ${fmt(m.strut.p10 * 1000, 0)} µm</span>`),
    metric('Surface spécifique', fmt(m.specificSurface, 2), ' mm⁻¹'),
    metric('Interconnectivité des pores', pct(m.interconnectivity, 1), ' %'),
  ].join('');
  const meca = [
    metric('Module de Young estimé', m.E < 1 ? fmt(m.E * 1000, 0) : fmt(m.E, 2), m.E < 1 ? ' MPa' : ' GPa',
      scale(m.E, 0.01, 300, true, [[BONE.trabecular.E[0], BONE.trabecular.E[1], 'bone'], [BONE.cortical.E[0], BONE.cortical.E[1], 'cort']], ['10 MPa', '1 GPa', '100 GPa'])),
    metric('Limite d\'élasticité estimée', fmt(m.sy, 1), ' MPa',
      scale(m.sy, 0.1, 1000, true, [[BONE.trabecular.sy[0], BONE.trabecular.sy[1], 'bone'], [BONE.cortical.sy[0], BONE.cortical.sy[1], 'cort']], ['0,1', '10', '1 000 MPa'])),
    metric('Masse', fmt(m.mass, 3), ' g'),
    `<span class="flag ${m.printable ? 'ok' : 'ko'}">${m.printable ? 'Imprimable' : 'Struts trop fins'} · ${proc.label.toLowerCase()}, détail minimal ${fmt(m.minFeature * 1000, 0)} µm</span>`,
  ].join('');

  let perf;
  const st = flowStatus.state;
  if (st === 'idle') {
    perf = '<p class="hint">Lance la perfusion pour calculer la perméabilité, voir le milieu de culture circuler et estimer le cisaillement sur les parois.</p>';
  } else {
    const label = { running: 'Calcul en cours', converged: 'Écoulement établi', stopped: 'Arrêté', max: 'Limite d\'itérations atteinte' }[st];
    perf = [
      metric('Perméabilité (Darcy)', sci(flowStatus.permeability, 2), ' m²',
        scale(flowStatus.permeability, 1e-12, 1e-6, true, [[BONE.trabecular.k[0], BONE.trabecular.k[1], 'bone']], ['10⁻¹²', '10⁻⁹', '10⁻⁶'])),
      flow ? metric('Vitesse maximale dans les pores', fmt(flow.maxPhys, 2), ' mm/s') : '',
      wss ? metric('Cisaillement pariétal médian', fmt(wss.median * 1000, 2), ' mPa') : '',
      wss ? metric(`Surface entre ${fmt(state.flow.wssLow, 1)} et ${fmt(state.flow.wssHigh, 1)} mPa`, pct(wss.inWindow, 0), ' %',
        scale(wss.inWindow, 0, 1, false, [], ['0', '50 %', '100 %'])) : '',
      `<span class="hint">${label} · ${(flowStatus.steps || 0).toLocaleString('fr-FR')} itérations</span>`,
    ].join('');
  }

  root.innerHTML = `
    <div class="m-group"><h3>Morphologie</h3>${morph}${KEY}</div>
    <div class="m-group"><h3>Mécanique · ${mat.label}</h3>${meca}</div>
    <div class="m-group"><h3>Perfusion</h3>${perf}</div>
    <div class="m-group"><p class="hint">Estimations de conception (Gibson-Ashby, Boltzmann sur réseau). À confirmer par éléments finis et par essais.</p></div>`;
}
