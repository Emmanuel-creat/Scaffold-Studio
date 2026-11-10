// Surfaces minimales triplement periodiques (TPMS), formes d'eprouvettes et champ implicite.
// Convention : une valeur de champ negative signifie "solide".

const TAU = Math.PI * 2;
const { sin, cos, sqrt, max, min, abs, floor } = Math;

// Treillis de poutres (point 7) : distance au squelette, ramenee par symetrie dans le huitieme
// de cellule [0 ; 0,5]^3 (les reseaux cubiques sont symetriques par rapport aux plans x = 0 et x = 0,5).
// Les poutres sont donnees dans ce huitieme ; le seuil de porosite donne alors leur rayon.
function segDist(px, py, pz, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / (dx * dx + dy * dy + dz * dz)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy, pz - a[2] - t * dz);
}
const fold = (v) => { const p = v / TAU; return Math.abs(p - Math.round(p)); };
function latticeFn(segs) {
  return (x, y, z) => {
    const px = fold(x), py = fold(y), pz = fold(z);
    let d = Infinity;
    for (const [a, b] of segs) d = Math.min(d, segDist(px, py, pz, a, b));
    return d * TAU; // meme echelle que k * distance en mm
  };
}
const O = [0, 0, 0], H = 0.5;
export const LATTICES = {
  cubic: [[O, [H, 0, 0]], [O, [0, H, 0]], [O, [0, 0, H]]],
  bcc: [[O, [H, H, H]]],
  fcc: [[O, [H, H, 0]], [O, [H, 0, H]], [O, [0, H, H]]],
  octet: [[O, [H, H, 0]], [O, [H, 0, H]], [O, [0, H, H]], [[H, H, 0], [H, 0, H]], [[H, H, 0], [0, H, H]], [[H, 0, H], [0, H, H]]],
};

// Mousse de Voronoi periodique (point 8), proche de l'os trabeculaire : les poutres sont les aretes
// ou trois cellules se rencontrent, reperees par F3 - F1 (distances au 1er et au 3e germe).
const VORONOI_SEEDS = (() => {
  let a = 12345;
  const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const pts = [];
  // 8 germes sur une grille 2 x 2 x 2 perturbee : cellules de taille reguliere, aspect aleatoire.
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    pts.push([(i + 0.5 + (r() - 0.5) * 0.7) / 2, (j + 0.5 + (r() - 0.5) * 0.7) / 2, (k + 0.5 + (r() - 0.5) * 0.7) / 2]);
  }
  return pts;
})();
function voronoiFn(x, y, z) {
  const px = x / TAU, py = y / TAU, pz = z / TAU;
  let f1 = Infinity, f2 = Infinity, f3 = Infinity;
  for (const s of VORONOI_SEEDS) {
    // image periodique la plus proche du germe (huit germes par cellule : elle suffit)
    let dx = px - s[0], dy = py - s[1], dz = pz - s[2];
    dx -= Math.round(dx); dy -= Math.round(dy); dz -= Math.round(dz);
    const d = Math.hypot(dx, dy, dz);
    if (d < f1) { f3 = f2; f2 = f1; f1 = d; } else if (d < f2) { f3 = f2; f2 = d; } else if (d < f3) f3 = d;
  }
  return (f3 - f1) * TAU;
}

export const SURFACES = {
  gyroid: { label: 'Gyroïde', f: (x, y, z) => sin(x) * cos(y) + sin(y) * cos(z) + sin(z) * cos(x) },
  diamond: {
    label: 'Diamant (Schwarz D)',
    f: (x, y, z) => {
      const sx = sin(x), sy = sin(y), sz = sin(z), cx = cos(x), cy = cos(y), cz = cos(z);
      return sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz;
    },
  },
  primitive: { label: 'Schwarz P', f: (x, y, z) => cos(x) + cos(y) + cos(z) },
  iwp: {
    label: 'I-WP',
    f: (x, y, z) => {
      const cx = cos(x), cy = cos(y), cz = cos(z);
      return 2 * (cx * cy + cy * cz + cz * cx) - (cos(2 * x) + cos(2 * y) + cos(2 * z));
    },
  },
  neovius: {
    label: 'Neovius',
    f: (x, y, z) => { const cx = cos(x), cy = cos(y), cz = cos(z); return 3 * (cx + cy + cz) + 4 * cx * cy * cz; },
  },
  fischerKoch: {
    label: 'Fischer-Koch S',
    f: (x, y, z) => cos(2 * x) * sin(y) * cos(z) + cos(x) * cos(2 * y) * sin(z) + sin(x) * cos(y) * cos(2 * z),
  },
  frd: {
    label: 'F-RD',
    f: (x, y, z) => 4 * cos(x) * cos(y) * cos(z) - (cos(2 * x) * cos(2 * y) + cos(2 * y) * cos(2 * z) + cos(2 * z) * cos(2 * x)),
  },
  splitP: {
    label: 'Split P',
    f: (x, y, z) => 1.1 * (sin(2 * x) * sin(z) * cos(y) + sin(2 * y) * sin(x) * cos(z) + sin(2 * z) * sin(y) * cos(x))
      - 0.2 * (cos(2 * x) * cos(2 * y) + cos(2 * y) * cos(2 * z) + cos(2 * z) * cos(2 * x))
      - 0.4 * (cos(2 * x) + cos(2 * y) + cos(2 * z)),
  },
  lidinoid: {
    label: 'Lidinoïde',
    f: (x, y, z) => 0.5 * (sin(2 * x) * cos(y) * sin(z) + sin(2 * y) * cos(z) * sin(x) + sin(2 * z) * cos(x) * sin(y))
      - 0.5 * (cos(2 * x) * cos(2 * y) + cos(2 * y) * cos(2 * z) + cos(2 * z) * cos(2 * x)) + 0.15,
  },
  cubicLattice: { label: 'Treillis cubique', f: latticeFn(LATTICES.cubic), strut: true },
  bcc: { label: 'Treillis BCC', f: latticeFn(LATTICES.bcc), strut: true },
  fcc: { label: 'Treillis FCC', f: latticeFn(LATTICES.fcc), strut: true },
  octet: { label: 'Treillis octet', f: latticeFn(LATTICES.octet), strut: true },
  voronoi: { label: 'Voronoï (trabéculaire)', f: voronoiFn, strut: true },
};

// Les treillis de poutres n'ont pas de version feuillet : le mode est ignore.
export const effectiveMode = (type, mode) => (SURFACES[type] && SURFACES[type].strut ? 'network' : mode);

export const MODES = { network: 'Réseau (struts)', sheet: 'Feuillet (paroi)' };

export const SHAPES = {
  cube: 'Pavé',
  cylinder: 'Cylindre',
  cage: 'Cage',
  cup: 'Cupule',
};

export const GRADIENTS = {
  none: 'Aucun',
  axial: 'Axial',
  radial: 'Radial',
  spherical: 'Sphérique',
  surface: 'Depuis la surface',
  profile: 'Profil multipoint selon la hauteur',
  image: 'Carte de densité (image)',
};

// Profil multipoint : texte "0:80, 0.5:55, 1:80" (hauteur relative : porosite en %) (point 15).
export function parseProfile(text) {
  const pts = String(text || '').split(/[;,\n]+/).map((p) => p.split(':').map((v) => Number(v.trim().replace(/%$/, ''))))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([z, ph]) => [Math.min(1, Math.max(0, z)), Math.min(0.95, Math.max(0.2, ph > 1 ? ph / 100 : ph))])
    .sort((a, b) => a[0] - b[0]);
  return pts;
}
function profileAt(pts, u) {
  if (!pts.length) return null;
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) {
    const [z0, p0] = pts[i - 1], [z1, p1] = pts[i];
    return p0 + ((p1 - p0) * (u - z0)) / Math.max(z1 - z0, 1e-9);
  }
  return pts[pts.length - 1][1];
}
// Carte de densite : image en niveaux de gris projetee sur le plan XY, blanc = porosite finale (point 14).
function imageAt(map, u, v) {
  if (!map || !map.data) return 0;
  const { w, h, data } = map;
  const fx = Math.min(Math.max(u, 0), 1) * (w - 1), fy = Math.min(Math.max(1 - v, 0), 1) * (h - 1);
  const i = Math.min(floor(fx), w - 2), j = Math.min(floor(fy), h - 2), tx = fx - i, ty = fy - j;
  const a = data[i + j * w], b = data[i + 1 + j * w], c = data[i + (j + 1) * w], d = data[i + 1 + (j + 1) * w];
  return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) / 255;
}

// Formes ajoutees (pleines) ou retirees (vides) : operations booleennes (point 17).
export const BOOLEAN_KINDS = { box: 'Pavé', cylinder: 'Cylindre selon z', sphere: 'Sphère' };
export function primitiveSdf(b) {
  const [cx, cy, cz] = b.c, [a, bb, c] = b.s;
  if (b.kind === 'sphere') return (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - a / 2;
  if (b.kind === 'cylinder') return (x, y, z) => max(Math.hypot(x - cx, y - cy) - a / 2, abs(z - cz) - c / 2);
  return (x, y, z) => {
    const qx = abs(x - cx) - a / 2, qy = abs(y - cy) - bb / 2, qz = abs(z - cz) - c / 2;
    return Math.hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0);
  };
}

// Table de quantiles : pour une porosite donnee, seuil t tel que la fraction solide
// d'une cellule unite vaille exactement 1 - porosite.
const quantileCache = new Map();
export function quantileTable(type, mode, n = 40) {
  mode = effectiveMode(type, mode);
  const key = `${type}|${mode}|${n}`;
  if (quantileCache.has(key)) return quantileCache.get(key);
  const f = SURFACES[type].f;
  // Les poutres alignees sur les plans de la grille creent un repliement : on decale chaque
  // echantillon d'une quantite quasi aleatoire (suite R3) pour les treillis.
  const jit = !!SURFACES[type].strut;
  const fr = (v) => v - floor(v);
  const vals = new Float32Array(n * n * n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let l = 0; l < n; l++) {
        const q = k + 1;
        const x = ((i + (jit ? fr(q * 0.8191725134) : 0.5)) / n) * TAU;
        const y = ((j + (jit ? fr(q * 0.6710436067) : 0.5)) / n) * TAU;
        const z = ((l + (jit ? fr(q * 0.5497004779) : 0.5)) / n) * TAU;
        const g = f(x, y, z);
        vals[k++] = mode === 'sheet' ? abs(g) : g;
      }
    }
  }
  vals.sort();
  quantileCache.set(key, vals);
  return vals;
}

export function thresholdFor(table, porosity) {
  const solid = min(0.999, max(0.001, 1 - porosity));
  const pos = solid * (table.length - 1);
  const i = floor(pos);
  const fr = pos - i;
  const a = table[i], b = table[min(i + 1, table.length - 1)];
  return a + (b - a) * fr;
}

// Boite englobante de l'eprouvette (mm).
export function specimenBox(shape) {
  switch (shape.kind) {
    case 'cylinder': return [shape.diameter, shape.diameter, shape.height];
    case 'cup': return [shape.diameter, shape.diameter, shape.diameter / 2];
    case 'stl': return shape.box ? [...shape.box] : [10, 10, 10];
    default: return [shape.x, shape.y, shape.z];
  }
}

export function specimenVolume(shape) {
  const [X, Y, Z] = specimenBox(shape);
  const hole = shape.hole > 0 ? Math.PI * (shape.hole / 2) ** 2 * Z : 0;
  switch (shape.kind) {
    case 'cylinder': return Math.PI * (X / 2) ** 2 * Z - hole;
    case 'cage': {
      const r = min(shape.radius || 0, X / 2, Y / 2);
      return (X * Y - (4 - Math.PI) * r * r) * Z - hole;
    }
    case 'cup': {
      const R = X / 2, Ri = max(0, R - shape.thickness);
      return (2 / 3) * Math.PI * (R ** 3 - Ri ** 3);
    }
    case 'stl': return shape.volume || X * Y * Z;
    default: return X * Y * Z - hole;
  }
}

// Distance signee 2D d'un rectangle arrondi centre.
function roundedRect(px, py, hx, hy, r) {
  const qx = abs(px) - hx + r, qy = abs(py) - hy + r;
  return Math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r;
}

// Distance signee laterale (dans le plan xy), trou central compris.
function lateralSdf(shape) {
  const [X, Y] = specimenBox(shape);
  const cx = X / 2, cy = Y / 2;
  const hole = shape.hole > 0 ? shape.hole / 2 : 0;
  let outer;
  if (shape.kind === 'cylinder' || shape.kind === 'cup') outer = (x, y) => Math.hypot(x - cx, y - cy) - X / 2;
  else if (shape.kind === 'cage') {
    const r = min(shape.radius || 0, X / 2, Y / 2);
    outer = (x, y) => roundedRect(x - cx, y - cy, X / 2, Y / 2, r);
  } else outer = (x, y) => max(abs(x - cx) - X / 2, abs(y - cy) - Y / 2);
  if (!hole) return outer;
  return (x, y) => max(outer(x, y), hole - Math.hypot(x - cx, y - cy));
}

export function shapeSdf(shape) {
  const [X, Y, Z] = specimenBox(shape);
  if (shape.kind === 'stl' && shape.sdfGrid) return gridSdf(shape.sdfGrid);
  if (shape.kind === 'cup') {
    const R = X / 2, t = shape.thickness;
    return (x, y, z) => {
      const r = Math.hypot(x - R, y - R, z);
      return max(abs(r - (R - t / 2)) - t / 2, -z);
    };
  }
  const lat = lateralSdf(shape);
  return (x, y, z) => max(lat(x, y), abs(z - Z / 2) - Z / 2);
}

// Distance signee echantillonnee sur grille (forme importee), interpolation trilineaire.
function gridSdf(g) {
  const { nx, ny, nz, h, data, origin } = g;
  return (x, y, z) => {
    const fx = (x - origin[0]) / h, fy = (y - origin[1]) / h, fz = (z - origin[2]) / h;
    if (fx < 0 || fy < 0 || fz < 0 || fx > nx - 1 || fy > ny - 1 || fz > nz - 1) {
      const dx = max(-fx, fx - (nx - 1), 0), dy = max(-fy, fy - (ny - 1), 0), dz = max(-fz, fz - (nz - 1), 0);
      return Math.hypot(dx, dy, dz) * h + h;
    }
    const i = min(floor(fx), nx - 2), j = min(floor(fy), ny - 2), k = min(floor(fz), nz - 2);
    const tx = fx - i, ty = fy - j, tz = fz - k;
    let v = 0;
    for (let c = 0; c < 8; c++) {
      const di = c & 1, dj = (c >> 1) & 1, dk = (c >> 2) & 1;
      v += (di ? tx : 1 - tx) * (dj ? ty : 1 - ty) * (dk ? tz : 1 - tz) * data[(i + di) + (j + dj) * nx + (k + dk) * nx * ny];
    }
    return v;
  };
}

// Distance signee de la peau pleine (coque), solide si negative.
function skinSdf(shape, skin) {
  if (!skin || !(skin.t > 0) || shape.kind === 'cup') return null;
  const [, , Z] = specimenBox(shape);
  const t = skin.t;
  const lat = lateralSdf(shape);
  const full = shapeSdf(shape);
  if (skin.faces === 'all') return (x, y, z) => { const d = full(x, y, z); return max(d, -d - t); };
  return (x, y, z) => { const d = lat(x, y); return max(d, -d - t, abs(z - Z / 2) - Z / 2); };
}

// Parametre de gradient t entre 0 (coeur, base) et 1 (peripherie, sommet).
export function gradientT(params, x, y, z, sdf) {
  const g = params.gradient || { kind: 'none' };
  const [X, Y, Z] = specimenBox(params.shape);
  switch (g.kind) {
    case 'axial': return min(1, max(0, z / Z));
    case 'radial': return min(1, Math.hypot(x - X / 2, y - Y / 2) / (min(X, Y) / 2));
    case 'spherical': return min(1, Math.hypot(x - X / 2, y - Y / 2, z - Z / 2) / (min(X, Y, Z) / 2));
    case 'surface': {
      const D = g.depth > 0 ? g.depth : min(X, Y, Z) / 4;
      const d = sdf ? -sdf(x, y, z) : D;
      return 1 - min(1, max(0, d / D));
    }
    case 'profile': return min(1, max(0, z / Z));
    case 'image': return imageAt(g.map, x / X, y / Y);
    default: return 0;
  }
}

export function porosityAt(params, x, y, z, sdf) {
  const g = params.gradient || { kind: 'none' };
  if (g.kind === 'none') return params.porosity;
  if (g.kind === 'profile') {
    const p = profileAt(g.pts || parseProfile(g.profile), z / specimenBox(params.shape)[2]);
    return p == null ? params.porosity : p;
  }
  return params.porosity + (g.p1 - params.porosity) * gradientT(params, x, y, z, sdf);
}

// Ecart interquantile d'une table : normalise deux surfaces avant de les melanger.
function spread(table) { return table[floor(table.length * 0.9)] - table[floor(table.length * 0.1)] || 1; }

export function rotationMatrix(rot) {
  const rx = ((rot && rot.x) || 0) * Math.PI / 180, ry = ((rot && rot.y) || 0) * Math.PI / 180, rz = ((rot && rot.z) || 0) * Math.PI / 180;
  const cx = cos(rx), sx = sin(rx), cy = cos(ry), sy = sin(ry), cz = cos(rz), sz = sin(rz);
  // R = Rz * Ry * Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

// Fonction champ complete (mm -> valeur), solide si < 0.
export function makeFieldFn(params) {
  const f = SURFACES[params.type].f;
  const sheet = effectiveMode(params.type, params.mode) === 'sheet';
  const table = quantileTable(params.type, params.mode);
  const k = TAU / params.cell;
  const sdf = shapeSdf(params.shape);
  const skin = skinSdf(params.shape, params.skin);
  const g = params.gradient || { kind: 'none' };
  const graded = g.kind !== 'none';
  const cellGraded = graded && g.kind !== 'profile' && g.c1 > 0 && abs(g.c1 - params.cell) > 1e-6;
  const pts = g.kind === 'profile' ? parseProfile(g.profile) : null;
  const gp = pts ? { ...params, gradient: { ...g, pts } } : params;
  // Melange progressif vers une seconde surface selon le gradient (point 6).
  const bl = params.blend && params.blend.type && params.blend.type !== 'none' && params.blend.type !== params.type && SURFACES[params.blend.type] ? params.blend.type : null;
  const blended = graded && bl;
  const f2 = blended ? SURFACES[bl].f : null;
  const sheet2 = blended && effectiveMode(bl, params.mode) === 'sheet';
  const table2 = blended ? quantileTable(bl, params.mode) : null;
  const s1 = blended ? spread(table) : 1, s2 = blended ? spread(table2) : 1;
  const bools = (params.booleans || []).filter((b) => b && b.op !== 'none').map((b) => ({ op: b.op, d: primitiveSdf(b) }));
  const t0 = thresholdFor(table, params.porosity);
  const an = params.aniso || { x: 1, y: 1, z: 1 };
  const ax = an.x || 1, ay = an.y || 1, az = an.z || 1;
  const R = rotationMatrix(params.rotation);
  const rotated = R[0] !== 1 || R[4] !== 1 || R[8] !== 1;
  const [X, Y, Z] = specimenBox(params.shape);
  const cx = X / 2, cy = Y / 2, cz = Z / 2;
  return {
    tpms(x, y, z) {
      let u = x - cx, v = y - cy, w = z - cz;
      if (rotated) {
        const a = R[0] * u + R[3] * v + R[6] * w, b = R[1] * u + R[4] * v + R[7] * w, c = R[2] * u + R[5] * v + R[8] * w;
        u = a; v = b; w = c;
      }
      let kk = k, t = t0, gt = 0, ph = params.porosity;
      if (graded) {
        gt = gradientT(params, x, y, z, sdf);
        ph = porosityAt(gp, x, y, z, sdf);
        t = thresholdFor(table, ph);
        if (cellGraded) kk = TAU / (params.cell + (g.c1 - params.cell) * gt);
      }
      const X0 = (u + cx) * kk / ax, Y0 = (v + cy) * kk / ay, Z0 = (w + cz) * kk / az;
      const gv = f(X0, Y0, Z0);
      const a = (sheet ? abs(gv) : gv) - t;
      if (!blended || gt <= 0) return a;
      const gv2 = f2(X0, Y0, Z0);
      const b = (sheet2 ? abs(gv2) : gv2) - thresholdFor(table2, ph);
      if (gt >= 1) return b * (s1 / s2);
      return (1 - gt) * a + gt * b * (s1 / s2);
    },
    sdf,
    skin,
    k,
    // Combine le reseau, la peau, les formes booleennes et la piece (solide si negatif).
    combine(s, x, y, z, d) {
      if (skin) s = min(s, skin(x, y, z) * k);
      for (const b of bools) s = b.op === 'add' ? min(s, b.d(x, y, z) * k) : max(s, -b.d(x, y, z) * k);
      return max(s, d * k);
    },
    value(x, y, z) {
      return this.combine(this.tpms(x, y, z), x, y, z, sdf(x, y, z));
    },
  };
}

// Estimation de la memoire et resolution effective pour eviter de saturer la machine.
export const MAX_POINTS = 9e6;
export function gridSize(params) {
  const [X, Y, Z] = specimenBox(params.shape);
  let res = params.res;
  const dims = (r) => { const h = max(X, Y, Z) / r; return [X, Y, Z].map((L) => Math.round(L / h) + 5); };
  let d = dims(res);
  while (d[0] * d[1] * d[2] > MAX_POINTS && res > 30) { res = Math.floor(res * 0.9); d = dims(res); }
  return { res, points: d[0] * d[1] * d[2], capped: res !== params.res };
}

// Echantillonne le champ sur une grille reguliere avec une marge de vide.
export function buildField(params) {
  const [X, Y, Z] = specimenBox(params.shape);
  const { res } = gridSize(params);
  const h = max(X, Y, Z) / res;
  const pad = 2;
  const nx = Math.round(X / h) + 1 + 2 * pad;
  const ny = Math.round(Y / h) + 1 + 2 * pad;
  const nz = Math.round(Z / h) + 1 + 2 * pad;
  const hx = X / (nx - 1 - 2 * pad), hy = Y / (ny - 1 - 2 * pad), hz = Z / (nz - 1 - 2 * pad);
  const fn = makeFieldFn(params);
  const data = new Float32Array(nx * ny * nz);
  const inside = new Uint8Array(nx * ny * nz);
  const sdfv = new Float32Array(nx * ny * nz);
  let idx = 0;
  for (let k = 0; k < nz; k++) {
    const z = (k - pad) * hz;
    for (let j = 0; j < ny; j++) {
      const y = (j - pad) * hy;
      for (let i = 0; i < nx; i++) {
        const x = (i - pad) * hx;
        const d = fn.sdf(x, y, z);
        sdfv[idx] = d;
        inside[idx] = d <= 0 ? 1 : 0;
        data[idx] = fn.combine(fn.tpms(x, y, z), x, y, z, d);
        idx++;
      }
    }
  }
  return { data, inside, sdf: sdfv, nx, ny, nz, hx, hy, hz, origin: [-pad * hx, -pad * hy, -pad * hz], pad, res };
}

// Ajuste la taille de cellule et les dimensions pour finir sur des cellules entieres.
export function fitWholeCells(params) {
  const s = params.shape;
  const [X] = specimenBox(s);
  const n = Math.max(1, Math.round(X / params.cell));
  const cell = +(X / n).toFixed(4);
  const snap = (L) => Math.max(cell, Math.round(L / cell) * cell);
  if (s.kind === 'cube' || s.kind === 'cage') { s.y = +snap(s.y).toFixed(3); s.z = +snap(s.z).toFixed(3); }
  else if (s.kind === 'cylinder') s.height = +snap(s.height).toFixed(3);
  params.cell = cell;
  return params;
}
