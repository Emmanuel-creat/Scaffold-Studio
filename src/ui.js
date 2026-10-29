// Construction du panneau de parametres a partir d'une description declarative.
import { SURFACES, MODES } from './tpms.js';
import { MATERIALS, PROCESSES } from './metrics.js';

const get = (o, path) => path.split('.').reduce((a, k) => a[k], o);
const set = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}

export function buildControls(root, state, { onGeometry, onFlow, onView, onRunFlow }) {
  const refreshers = [];
  const refresh = () => refreshers.forEach((f) => f());

  const section = (title, open, ...body) => el('details', { class: 'sec', ...(open ? { open: '' } : {}) },
    el('summary', {}, title), el('div', { class: 'sec-body' }, ...body));

  const seg = (id, path, options, cb) => {
    const wrap = el('div', { class: 'seg', role: 'group', id });
    const btns = Object.entries(options).map(([v, label]) => {
      const b = el('button', { type: 'button', 'data-v': v, onclick: () => { set(state, path, v); refresh(); cb(); } }, label);
      wrap.append(b);
      return b;
    });
    refreshers.push(() => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === get(state, path)))));
    return wrap;
  };

  const select = (id, path, options, cb) => {
    const s = el('select', { id, onchange: (e) => { set(state, path, e.target.value); cb(); } },
      ...Object.entries(options).map(([v, o]) => el('option', { value: v }, typeof o === 'string' ? o : o.label)));
    refreshers.push(() => { s.value = get(state, path); });
    return s;
  };

  const slider = (id, label, path, { min, max, step, scale = 1, unit = '', digits = 1 }, cb, live) => {
    const out = el('output', { for: id });
    const input = el('input', { type: 'range', id, min, max, step });
    const show = () => { out.textContent = `${(get(state, path) * scale).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`.trim(); };
    input.addEventListener('input', () => { set(state, path, Number(input.value) / scale); show(); if (live) live(); });
    input.addEventListener('change', () => cb());
    refreshers.push(() => { input.value = get(state, path) * scale; show(); });
    return el('div', { class: 'field' }, el('div', { class: 'lab' }, el('label', { for: id }, label), out), input);
  };

  const num = (id, label, path, cb) => {
    const input = el('input', { type: 'number', id, min: 1, max: 40, step: 0.5 });
    input.addEventListener('change', () => {
      const v = Math.min(40, Math.max(1, Number(input.value) || 1));
      set(state, path, v); input.value = v; cb();
    });
    refreshers.push(() => { input.value = get(state, path); });
    return el('label', {}, label, input);
  };

  const check = (id, label, path, cb) => {
    const input = el('input', { type: 'checkbox', id, onchange: (e) => { set(state, path, e.target.checked); cb(); } });
    refreshers.push(() => { input.checked = !!get(state, path); });
    return el('label', { class: 'check', for: id }, input, label);
  };

  const surfaces = Object.fromEntries(Object.entries(SURFACES).map(([k, v]) => [k, v.label]));
  const cubeDims = el('div', { class: 'row3' }, num('dim-x', 'X (mm)', 'shape.x', onGeometry), num('dim-y', 'Y (mm)', 'shape.y', onGeometry), num('dim-z', 'Z (mm)', 'shape.z', onGeometry));
  const cylDims = el('div', { class: 'row2' }, num('dim-d', 'Diamètre (mm)', 'shape.diameter', onGeometry), num('dim-h', 'Hauteur (mm)', 'shape.height', onGeometry));
  refreshers.push(() => { cubeDims.hidden = state.shape.kind !== 'cube'; cylDims.hidden = state.shape.kind !== 'cylinder'; });
  const gradP1 = slider('grad-p1', 'Porosité finale', 'gradient.p1', { min: 30, max: 92, step: 1, scale: 100, unit: '%', digits: 0 }, onGeometry);
  const gradHint = el('p', { class: 'hint' });
  refreshers.push(() => {
    gradP1.hidden = state.gradient.kind === 'none';
    gradHint.textContent = state.gradient.kind === 'axial' ? 'Porosité de la base (curseur du haut) vers le sommet.'
      : state.gradient.kind === 'radial' ? 'Porosité du coeur (curseur du haut) vers la périphérie, comme le passage de l\'os spongieux à l\'os cortical.'
      : 'Porosité uniforme dans tout le volume.';
  });

  const flowBtn = el('button', { type: 'button', class: 'btn wide primary', id: 'btn-flow', onclick: onRunFlow });
  const progress = el('div', { class: 'progress' }, el('i', { id: 'flow-progress' }));

  root.append(
    section('Architecture', true,
      el('div', { class: 'field' }, el('div', { class: 'lab' }, el('label', { for: 'type' }, 'Surface')), select('type', 'type', surfaces, onGeometry)),
      seg('mode', 'mode', MODES, onGeometry),
      slider('cell', 'Taille de cellule', 'cell', { min: 0.6, max: 5, step: 0.1, unit: 'mm', digits: 1 }, onGeometry),
      slider('porosity', 'Porosité visée', 'porosity', { min: 30, max: 92, step: 1, scale: 100, unit: '%', digits: 0 }, onGeometry),
    ),
    section('Forme de l\'éprouvette', true,
      seg('shape', 'shape.kind', { cube: 'Pavé', cylinder: 'Cylindre' }, onGeometry),
      cubeDims, cylDims,
    ),
    section('Gradient de porosité', false,
      seg('gradient', 'gradient.kind', { none: 'Aucun', axial: 'Axial', radial: 'Radial' }, onGeometry),
      gradHint, gradP1,
    ),
    section('Matériau et procédé', true,
      el('div', { class: 'field' }, el('div', { class: 'lab' }, el('label', { for: 'material' }, 'Matériau')), select('material', 'material', MATERIALS, onGeometry)),
      el('div', { class: 'field' }, el('div', { class: 'lab' }, el('label', { for: 'process' }, 'Procédé de fabrication')), select('process', 'process', PROCESSES, onGeometry)),
      el('div', { class: 'field' }, el('div', { class: 'lab' }, el('span', {}, 'Résolution du maillage')),
        seg('res', 'resKey', { low: 'Aperçu', mid: 'Standard', high: 'Fine' }, onGeometry)),
    ),
    section('Perfusion', true,
      slider('inlet', 'Vitesse d\'entrée', 'flow.inlet', { min: 0.05, max: 2, step: 0.05, unit: 'mm/s', digits: 2 }, onFlow, onFlow),
      flowBtn, progress,
      slider('pspeed', 'Accélération de l\'animation', 'flow.speed', { min: 0.5, max: 20, step: 0.5, unit: '×', digits: 1 }, onView, onView),
      slider('pcount', 'Particules', 'flow.particles', { min: 500, max: 20000, step: 500, digits: 0 }, onFlow),
      check('wss', 'Carte de cisaillement pariétal', 'flow.wss', onFlow),
      el('div', { class: 'row2' },
        el('label', {}, 'Cible min (mPa)', numRaw('wss-lo', 'flow.wssLow')),
        el('label', {}, 'Cible max (mPa)', numRaw('wss-hi', 'flow.wssHigh'))),
      el('p', { class: 'hint' }, 'Fenêtre de cisaillement visée pour stimuler les ostéoblastes, modifiable selon ta référence.'),
    ),
    section('Affichage', true,
      slider('cut', 'Coupe', 'view.cut', { min: 0, max: 100, step: 1, unit: '%', digits: 0 }, onView, onView),
      slider('opacity', 'Opacité du scaffold', 'view.opacity', { min: 10, max: 100, step: 1, unit: '%', digits: 0 }, onView, onView),
      check('autorot', 'Rotation automatique', 'view.autoRotate', onView),
      check('showp', 'Afficher les particules', 'view.particles', onView),
    ),
  );

  function numRaw(id, path) {
    const input = el('input', { type: 'number', id, min: 0.001, max: 10000, step: 0.1 });
    input.addEventListener('change', () => { const v = Math.max(0.001, Number(input.value) || 0.1); set(state, path, v); onFlow(); });
    refreshers.push(() => { input.value = get(state, path); });
    return input;
  }

  refresh();
  return { refresh, flowBtn };
}
