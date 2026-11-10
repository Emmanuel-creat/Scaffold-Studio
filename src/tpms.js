// Surfaces minimales triplement periodiques (TPMS), formes d'eprouvettes et champ implicite.
// Convention : une valeur de champ negative signifie "solide".

const TAU = Math.PI * 2;
const { sin, cos, sqrt, max, min, abs, floor } = Math;

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
};

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
};

// Table de quantiles : pour une porosite donnee, seuil t tel que la fraction solide
// d'une cellule unite vaille exactement 1 - porosite.
const quantileCache = new Map();
export function quantileTable(type, mode, n = 40) {
  const key = `${type}|${mode}|${n}`;
  if (quantileCache.has(key)) return quantileCache.get(key);
  const f = SURFACES[type].f;
  const vals = new Float32Array(n * n * n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * TAU;
    for (let j = 0; j < n; j++) {
      const y = ((j + 0.5) / n) * TAU;
      for (let l = 0; l < n; l++) {
        const z = ((l + 0.5) / n) * TAU;
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
    default: return 0;
  }
}

export function porosityAt(params, x, y, z, sdf) {
  const g = params.gradient || { kind: 'none' };
  if (g.kind === 'none') return params.porosity;
  return params.porosity + (g.p1 - params.porosity) * gradientT(params, x, y, z, sdf);
}

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
  const sheet = params.mode === 'sheet';
  const table = quantileTable(params.type, params.mode);
  const k = TAU / params.cell;
  const sdf = shapeSdf(params.shape);
  const skin = skinSdf(params.shape, params.skin);
  const g = params.gradient || { kind: 'none' };
  const graded = g.kind !== 'none';
  const cellGraded = graded && g.c1 > 0 && abs(g.c1 - params.cell) > 1e-6;
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
      let kk = k, t = t0;
      if (graded) {
        const gt = gradientT(params, x, y, z, sdf);
        t = thresholdFor(table, params.porosity + (g.p1 - params.porosity) * gt);
        if (cellGraded) kk = TAU / (params.cell + (g.c1 - params.cell) * gt);
      }
      const gv = f((u + cx) * kk / ax, (v + cy) * kk / ay, (w + cz) * kk / az);
      return (sheet ? abs(gv) : gv) - t;
    },
    sdf,
    skin,
    k,
    value(x, y, z) {
      const d = sdf(x, y, z);
      let s = this.tpms(x, y, z);
      if (skin) s = min(s, skin(x, y, z) * k);
      return max(s, d * k);
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
        let s = fn.tpms(x, y, z);
        if (fn.skin) s = min(s, fn.skin(x, y, z) * fn.k);
        data[idx] = max(s, d * fn.k);
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
