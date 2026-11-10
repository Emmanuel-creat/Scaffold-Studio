// Construction du panneau de parametres a partir d'une description declarative.
import { SURFACES, MODES, SHAPES, GRADIENTS } from './tpms.js';
import { MATERIALS, PROCESSES } from './metrics.js';
import { FLUIDS } from './bio.js';
import { FORMATS, PATHS } from './studio.js';
import { t } from './i18n.js';

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
}

export function buildControls(root, state, cb) {
  const { onGeometry, onFlow, onView, onRunFlow, onAction, beforeChange, onSolver, onBio, onStudio } = cb;
  const refreshers = [];
  const refresh = () => refreshers.forEach((f) => f());
  // Chaque commande enregistre l'etat dans l'historique avant de le modifier.
  const geo = onGeometry;

  const section = (id, title, open, ...body) => el('details', { class: 'sec', id: `sec-${id}`, open },
    el('summary', {}, title), el('div', { class: 'sec-body' }, ...body));

  const seg = (id, path, options, onchange, label) => {
    const wrap = el('div', { class: 'seg', role: 'group', id, 'aria-label': label || id });
    const btns = Object.entries(options).map(([v, lab]) => {
      const b = el('button', { type: 'button', 'data-v': v, onclick: () => { beforeChange && beforeChange(); set(state, path, v); refresh(); onchange(); } }, lab);
      wrap.append(b);
      return b;
    });
    refreshers.push(() => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(get(state, path))))));
    return wrap;
  };

  const select = (id, path, options, onchange) => {
    const s = el('select', { id, onchange: (e) => { beforeChange && beforeChange(); set(state, path, e.target.value); refresh(); onchange(); } },
      ...Object.entries(options).map(([v, o]) => el('option', { value: v }, t(typeof o === 'string' ? o : o.label))));
    refreshers.push(() => { s.value = get(state, path); });
    return s;
  };

  const field = (labelFor, label, control, tip) => el('div', { class: 'field' },
    el('div', { class: 'lab' }, el('label', { for: labelFor, title: tip }, label)), control);

  // Curseur + saisie numerique directe (point 78).
  const slider = (id, label, path, { min, max, step, scale = 1, unit = '', digits = 1, tip }, onchange, live) => {
    const num = el('input', { type: 'number', class: 'num', id: `${id}-n`, min, max, step, 'aria-label': `${label} (${unit})` });
    const input = el('input', { type: 'range', id, min, max, step });
    const showNum = () => { num.value = (+(get(state, path) * scale).toFixed(digits)); };
    input.addEventListener('pointerdown', () => beforeChange && beforeChange());
    input.addEventListener('keydown', () => beforeChange && beforeChange());
    input.addEventListener('input', () => { set(state, path, Number(input.value) / scale); showNum(); if (live) live(); });
    input.addEventListener('change', () => onchange());
    num.addEventListener('change', () => {
      beforeChange && beforeChange();
      const v = Math.min(max, Math.max(min, Number(String(num.value).replace(',', '.')) || min));
      set(state, path, v / scale); input.value = v; showNum(); if (live) live(); onchange();
    });
    refreshers.push(() => { input.value = get(state, path) * scale; showNum(); });
    return el('div', { class: 'field' },
      el('div', { class: 'lab' }, el('label', { for: id, title: tip }, label), el('span', { class: 'numwrap' }, num, el('small', {}, unit))), input);
  };

  const num = (id, label, path, onchange, { min = 0.2, max = 60, step = 0.1 } = {}) => {
    const input = el('input', { type: 'number', id, min, max, step });
    input.addEventListener('change', () => {
      beforeChange && beforeChange();
      const v = Math.min(max, Math.max(min, Number(String(input.value).replace(',', '.')) || min));
      set(state, path, v); input.value = v; onchange();
    });
    refreshers.push(() => { input.value = get(state, path); });
    return el('label', { for: id }, label, input);
  };

  const check = (id, label, path, onchange) => {
    const input = el('input', { type: 'checkbox', id, onchange: (e) => { beforeChange && beforeChange(); set(state, path, e.target.checked); refresh(); onchange(); } });
    refreshers.push(() => { input.checked = !!get(state, path); });
    return el('label', { class: 'check', for: id }, input, label);
  };

  const text = (id, label, path, onchange, placeholder = '') => {
    const input = el('input', { type: 'text', id, class: 'text', placeholder, maxlength: 90 });
    input.addEventListener('focus', () => beforeChange && beforeChange());
    input.addEventListener('input', () => { set(state, path, input.value); onchange(); });
    refreshers.push(() => { if (document.activeElement !== input) input.value = get(state, path) || ''; });
    return el('label', { for: id, class: 'textfield' }, label, input);
  };

  const showIf = (node, pred) => { refreshers.push(() => { node.hidden = !pred(); }); return node; };
  const button = (id, label, action, cls = 'btn wide') => el('button', { type: 'button', class: cls, id, onclick: () => onAction(action) }, label);

  const surfaces = Object.fromEntries(Object.entries(SURFACES).map(([k, v]) => [k, t(v.label)]));
  const kind = () => state.shape.kind;

  const dims = el('div', { class: 'dims' },
    showIf(el('div', { class: 'row3' }, num('dim-x', 'X (mm)', 'shape.x', geo), num('dim-y', 'Y (mm)', 'shape.y', geo), num('dim-z', 'Z (mm)', 'shape.z', geo)), () => kind() === 'cube' || kind() === 'cage'),
    showIf(el('div', { class: 'row2' }, num('dim-d', t('Diamètre (mm)'), 'shape.diameter', geo), num('dim-h', t('Hauteur (mm)'), 'shape.height', geo)), () => kind() === 'cylinder'),
    showIf(el('div', { class: 'row2' }, num('dim-cd', t('Diamètre (mm)'), 'shape.diameter', geo), num('dim-ct', t('Épaisseur (mm)'), 'shape.thickness', geo)), () => kind() === 'cup'),
    showIf(el('div', { class: 'row2' },
      showIf(num('dim-r', t('Rayon d\'angle (mm)'), 'shape.radius', geo, { min: 0, max: 20 }), () => kind() === 'cage'),
      num('dim-hole', t('Trou central (mm)'), 'shape.hole', geo, { min: 0, max: 40 })), () => kind() !== 'cup' && kind() !== 'stl'),
    showIf(el('p', { class: 'hint', id: 'stl-info' }), () => kind() === 'stl'),
  );

  const gradHint = el('p', { class: 'hint' });
  refreshers.push(() => {
    gradHint.textContent = {
      none: t('Porosité et cellule uniformes.'),
      axial: t('De la base (valeurs du haut) vers le sommet.'),
      radial: t('Du coeur vers la périphérie, comme l\'os spongieux vers l\'os cortical.'),
      spherical: t('Du centre de la pièce vers l\'extérieur.'),
      surface: t('Du coeur vers la surface, quelle que soit la forme : une coque dense autour d\'un coeur poreux.'),
    }[state.gradient.kind];
  });

  const flowBtn = el('button', { type: 'button', class: 'btn wide primary', id: 'btn-flow', onclick: onRunFlow });
  const progress = el('div', { class: 'progress', role: 'progressbar', 'aria-label': t('Progression de la perfusion') }, el('i', { id: 'flow-progress' }));
  const custom = showIf(el('div', { class: 'row3' },
    num('mat-e', 'E (GPa)', 'customMaterial.E', geo, { min: 0.001, max: 500, step: 0.1 }),
    num('mat-sy', 'σy (MPa)', 'customMaterial.sy', geo, { min: 0.1, max: 3000, step: 1 }),
    num('mat-rho', 'ρ (g/cm³)', 'customMaterial.rho', geo, { min: 0.1, max: 25, step: 0.01 })), () => state.material === 'custom');

  root.append(
    section('archi', t('Architecture'), true,
      field('type', t('Surface'), select('type', 'type', surfaces, geo)),
      seg('mode', 'mode', Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, t(v)])), geo, t('Mode')),
      slider('cell', t('Taille de cellule'), 'cell', { min: 0.4, max: 6, step: 0.05, unit: 'mm', digits: 2, tip: t('Période de la surface, une cellule unité par période') }, geo),
      slider('porosity', t('Porosité visée'), 'porosity', { min: 30, max: 95, step: 0.5, scale: 100, unit: '%', digits: 1, tip: t('Fraction de vide visée. Le seuil de la surface est calculé pour l\'atteindre exactement') }, geo),
      el('div', { class: 'inverse' },
        el('div', { class: 'row2' },
          num('target-strut', t('Strut visé (µm)'), 'target.strut', () => {}, { min: 50, max: 3000, step: 10 }),
          num('target-e', t('Rigidité visée (GPa)'), 'target.E', () => {}, { min: 0.01, max: 200, step: 0.1 })),
        el('div', { class: 'row2' },
          button('btn-inv-strut', t('Viser ce strut'), 'inverseStrut', 'btn'),
          button('btn-inv-e', t('Viser cette rigidité'), 'inverseE', 'btn'))),
      button('btn-fit', t('Ajuster aux cellules entières'), 'fit'),
    ),
    section('orient', t('Orientation et anisotropie'), false,
      el('p', { class: 'hint' }, t('Étirer la cellule selon un axe imite l\'orientation des travées osseuses sous charge. La rotation oriente le réseau par rapport à l\'axe d\'impression.')),
      slider('an-x', t('Étirement X'), 'aniso.x', { min: 0.5, max: 2.5, step: 0.05, unit: '×', digits: 2 }, geo),
      slider('an-y', t('Étirement Y'), 'aniso.y', { min: 0.5, max: 2.5, step: 0.05, unit: '×', digits: 2 }, geo),
      slider('an-z', t('Étirement Z'), 'aniso.z', { min: 0.5, max: 2.5, step: 0.05, unit: '×', digits: 2 }, geo),
      slider('rot-x', t('Rotation X'), 'rotation.x', { min: -90, max: 90, step: 1, unit: '°', digits: 0 }, geo),
      slider('rot-y', t('Rotation Y'), 'rotation.y', { min: -90, max: 90, step: 1, unit: '°', digits: 0 }, geo),
      slider('rot-z', t('Rotation Z'), 'rotation.z', { min: -90, max: 90, step: 1, unit: '°', digits: 0 }, geo),
    ),
    section('shape', t('Forme de la pièce'), true,
      seg('shape', 'shape.kind', { ...Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, t(v)])), ...(state.shape.kind === 'stl' ? { stl: 'STL' } : {}) }, geo, t('Forme')),
      dims,
      button('btn-stl-import', t('Importer une forme STL'), 'importStl'),
      showIf(el('div', { class: 'skin' },
        slider('skin', t('Peau pleine'), 'skin.t', { min: 0, max: 2, step: 0.05, unit: 'mm', digits: 2, tip: t('Coque pleine autour du réseau, 0 pour aucune') }, geo),
        seg('skin-faces', 'skin.faces', { lateral: t('Côtés'), all: t('Toutes les faces') }, geo, t('Faces de la peau'))), () => kind() !== 'cup'),
    ),
    section('grad', t('Gradients'), false,
      field('gradient', t('Type de gradient'), select('gradient', 'gradient.kind', Object.fromEntries(Object.entries(GRADIENTS).map(([k, v]) => [k, t(v)])), geo)),
      gradHint,
      showIf(slider('grad-p1', t('Porosité finale'), 'gradient.p1', { min: 30, max: 95, step: 0.5, scale: 100, unit: '%', digits: 1 }, geo), () => state.gradient.kind !== 'none'),
      showIf(slider('grad-c1', t('Cellule finale'), 'gradient.c1', { min: 0.4, max: 6, step: 0.05, unit: 'mm', digits: 2 }, geo), () => state.gradient.kind !== 'none'),
      showIf(slider('grad-depth', t('Profondeur de transition'), 'gradient.depth', { min: 0.2, max: 15, step: 0.1, unit: 'mm', digits: 1 }, geo), () => state.gradient.kind === 'surface'),
    ),
    section('mat', t('Matériau et fabrication'), true,
      field('material', t('Matériau'), select('material', 'material', MATERIALS, geo)),
      custom,
      field('process', t('Procédé de fabrication'), select('process', 'process', PROCESSES, geo)),
      field('res', t('Résolution du maillage'), seg('res', 'resKey', { low: t('Aperçu'), mid: t('Standard'), high: t('Fine') }, geo, t('Résolution'))),
      slider('smooth', t('Lissage du maillage'), 'smooth', { min: 0, max: 10, step: 1, unit: t('passes'), digits: 0, tip: t('Lissage de Taubin, sans perte de volume') }, geo),
    ),
    section('flow', t('Perfusion'), true,
      slider('inlet', t('Vitesse d\'entrée'), 'flow.inlet', { min: 0.05, max: 2, step: 0.05, unit: 'mm/s', digits: 2, tip: t('Vitesse de Darcy du milieu de culture') }, onFlow, onFlow),
      flowBtn, progress,
      button('btn-tensor', t('Perméabilité selon X, Y et Z'), 'tensor'),
      slider('pspeed', t('Accélération de l\'animation'), 'flow.speed', { min: 0.5, max: 20, step: 0.5, unit: '×', digits: 1 }, onView, onView),
      slider('pcount', t('Particules'), 'flow.particles', { min: 500, max: 20000, step: 500, digits: 0 }, onFlow),
      check('wss', t('Carte de cisaillement pariétal'), 'flow.wss', onFlow),
      check('streamlines', t('Lignes de courant'), 'flow.streamlines', onFlow),
      el('div', { class: 'row2' },
        num('wss-lo', t('Cible min (mPa)'), 'flow.wssLow', onFlow, { min: 0.001, max: 10000, step: 0.1 }),
        num('wss-hi', t('Cible max (mPa)'), 'flow.wssHigh', onFlow, { min: 0.001, max: 10000, step: 0.1 })),
      el('p', { class: 'hint' }, t('Fenêtre de cisaillement visée pour stimuler les ostéoblastes, modifiable selon ta référence.')),
      el('details', { class: 'sub' }, el('summary', {}, t('Solveur et fluide')),
        field('fluid', t('Fluide'), select('fluid', 'flow.fluid', FLUIDS, onFlow)),
        field('bc', t('Condition motrice'), select('bc', 'flow.bc', { force: t('Force volumique (cellule périodique)'), pressure: t('Pression imposée (éprouvette entière)') }, onSolver)),
        check('gpu', t('Calcul sur carte graphique (WebGPU)'), 'flow.gpu', onSolver)),
    ),
    section('bio', t('Biologie'), false,
      el('p', { class: 'hint' }, t('Oxygène, ensemencement et croissance du tissu, calculés sur l\'écoulement établi.')),
      slider('bio-vmax', t('Consommation d\'O₂ par cellule'), 'bio.vmax', { min: 0.2, max: 10, step: 0.1, unit: '×10⁻¹⁷ mol/s', digits: 1, tip: t('Vitesse maximale de Michaelis-Menten, environ 2 pour des ostéoblastes') }, onBio),
      slider('bio-density', t('Densité cellulaire sur les parois'), 'bio.density', { min: 100, max: 5000, step: 50, unit: t('cellules/mm²'), digits: 0 }, onBio),
      button('btn-oxygen', t('Calculer l\'oxygène'), 'oxygen'),
      slider('bio-cells', t('Cellules injectées'), 'bio.cells', { min: 200, max: 8000, step: 100, digits: 0 }, onBio),
      slider('bio-attach', t('Probabilité d\'adhésion au contact'), 'bio.attach', { min: 5, max: 100, step: 1, scale: 100, unit: '%', digits: 0 }, onBio),
      el('div', { class: 'row2' }, button('btn-seed', t('Ensemencer'), 'seed', 'btn'), button('btn-replay', t('Rejouer'), 'replaySeed', 'btn')),
      slider('bio-lambda', t('Vitesse de dépôt du tissu'), 'bio.lambda', { min: 0.5, max: 10, step: 0.1, unit: '×10⁻³ mm²/j', digits: 1, tip: t('Coefficient de croissance pilotée par la courbure (Rumpler 2008, Bidan 2012)') }, onBio),
      button('btn-tissue', t('Simuler la croissance du tissu'), 'tissue'),
      check('show-tissue', t('Afficher le tissu formé'), 'bio.showTissue', onBio),
      field('bio-day', t('Jour de culture'), seg('bio-day', 'bio.day', { 7: 'J7', 14: 'J14', 28: 'J28', 42: 'J42', 56: 'J56' }, onBio, t('Jour de culture'))),
    ),
    section('view', t('Affichage'), true,
      field('surface-map', t('Carte sur la surface'), select('surface-map', 'view.map', {
        none: t('Matériau'), thickness: t('Épaisseur locale'), pore: t('Taille de pore locale'), curvature: t('Courbure moyenne'), overhang: t('Surplombs à l\'impression'), oxygen: t('Oxygène dissous'),
      }, onView)),
      seg('cut-axis', 'view.cutAxis', { x: t('Coupe X'), y: t('Coupe Y'), z: t('Coupe Z') }, onView, t('Axe de coupe')),
      slider('cut', t('Position de coupe'), 'view.cut', { min: 0, max: 100, step: 1, unit: '%', digits: 0 }, onView, onView),
      slider('opacity', t('Opacité du scaffold'), 'view.opacity', { min: 10, max: 100, step: 1, unit: '%', digits: 0 }, onView, onView),
      check('autorot', t('Rotation automatique'), 'view.autoRotate', onView),
      check('showp', t('Afficher les particules'), 'view.particles', onView),
      check('layers', t('Aperçu des couches d\'impression'), 'view.layers', onView),
      check('plate', t('Plateau de fabrication'), 'view.plate', onView),
      check('theme', t('Thème clair'), 'view.light', onView),
    ),
    section('studio', t('Studio image et vidéo'), false,
      field('format', t('Format'), select('format', 'studio.format', FORMATS, onStudio)),
      check('realism', t('Rendu réaliste (halo, vignettage)'), 'studio.realism', onStudio),
      showIf(slider('bloom', t('Intensité du halo'), 'studio.bloom', { min: 0, max: 1.5, step: 0.05, digits: 2 }, onStudio, onStudio), () => state.studio.realism),
      check('dof', t('Profondeur de champ'), 'studio.dof', onStudio),
      showIf(slider('focus', t('Mise au point'), 'studio.focus', { min: 0, max: 100, step: 1, unit: '%', digits: 0, tip: t('0 % au premier plan, 100 % au fond') }, onStudio, onStudio), () => state.studio.dof),
      check('title-on', t('Titre incrusté'), 'studio.titleOn', onStudio),
      showIf(el('div', { class: 'stack' },
        text('title', t('Titre'), 'studio.title', onStudio, t('Scaffold gyroïde titane')),
        text('subtitle', t('Sous-titre'), 'studio.subtitle', onStudio, t('Porosité 70 %, perfusion 0,5 mm/s'))), () => state.studio.titleOn),
      check('scalebar', t('Barre d\'échelle'), 'studio.scaleBarOn', onStudio),
      button('btn-hires', t('Rendu 4K (PNG)'), 'hires'),
      field('path', t('Mouvement de caméra'), select('path', 'studio.path', PATHS, onStudio)),
      slider('duration', t('Durée'), 'studio.duration', { min: 4, max: 30, step: 1, unit: 's', digits: 0 }, onStudio),
      check('shot-rec', t('Enregistrer la séquence en vidéo'), 'studio.record', onStudio),
      showIf(el('div', { class: 'row2' }, button('btn-addkey', t('Ajouter la vue'), 'addKey', 'btn'), button('btn-clearkeys', t('Effacer les vues'), 'clearKeys', 'btn')), () => state.studio.path === 'keys'),
      button('btn-shot', t('Tourner la séquence'), 'shot', 'btn wide primary'),
    ),
  );

  refresh();
  return { refresh, flowBtn };
}
