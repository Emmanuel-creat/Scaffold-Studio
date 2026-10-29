// Surfaces minimales triplement periodiques (TPMS) et construction du champ implicite.
// Convention : une valeur de champ negative signifie "solide".

const TAU = Math.PI * 2;
const { sin, cos, sqrt, max, abs, floor, min } = Math;

export const SURFACES = {
  gyroid: {
    label: 'Gyroïde',
    f: (x, y, z) => sin(x) * cos(y) + sin(y) * cos(z) + sin(z) * cos(x),
  },
  diamond: {
    label: 'Diamant (Schwarz D)',
    f: (x, y, z) => {
      const sx = sin(x), sy = sin(y), sz = sin(z), cx = cos(x), cy = cos(y), cz = cos(z);
      return sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz;
    },
  },
  primitive: {
    label: 'Schwarz P',
    f: (x, y, z) => cos(x) + cos(y) + cos(z),
  },
  iwp: {
    label: 'I-WP',
    f: (x, y, z) => {
      const cx = cos(x), cy = cos(y), cz = cos(z);
      return 2 * (cx * cy + cy * cz + cz * cx) - (cos(2 * x) + cos(2 * y) + cos(2 * z));
    },
  },
  neovius: {
    label: 'Neovius',
    f: (x, y, z) => {
      const cx = cos(x), cy = cos(y), cz = cos(z);
      return 3 * (cx + cy + cz) + 4 * cx * cy * cz;
    },
  },
};

export const MODES = {
  network: 'Réseau (struts)',
  sheet: 'Feuillet (paroi)',
};

// Table de quantiles : pour une porosite donnee, renvoie le seuil t tel que
// la fraction solide d'une cellule unite vaille exactement 1 - porosite.
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
  const solid = Math.min(0.999, Math.max(0.001, 1 - porosity));
  const pos = solid * (table.length - 1);
  const i = floor(pos);
  const fr = pos - i;
  const a = table[i], b = table[min(i + 1, table.length - 1)];
  return a + (b - a) * fr;
}

// Dimensions de l'eprouvette (mm) et fonction distance signee de la forme.
export function specimenBox(shape) {
  if (shape.kind === 'cylinder') return [shape.diameter, shape.diameter, shape.height];
  return [shape.x, shape.y, shape.z];
}

export function shapeSdf(shape) {
  if (shape.kind === 'cylinder') {
    const R = shape.diameter / 2, H = shape.height;
    return (x, y, z) => {
      const dx = x - R, dy = y - R;
      const r = sqrt(dx * dx + dy * dy);
      const a = r - R, b = abs(z - H / 2) - H / 2;
      return max(a, b);
    };
  }
  const { x: X, y: Y, z: Z } = shape;
  return (x, y, z) => max(abs(x - X / 2) - X / 2, abs(y - Y / 2) - Y / 2, abs(z - Z / 2) - Z / 2);
}

// Porosite locale selon le gradient choisi.
export function porosityAt(params, x, y, z) {
  const g = params.gradient || { kind: 'none' };
  const p0 = params.porosity;
  if (g.kind === 'axial') {
    const H = specimenBox(params.shape)[2];
    const t = Math.min(1, Math.max(0, z / H));
    return p0 + (g.p1 - p0) * t;
  }
  if (g.kind === 'radial') {
    const [X, Y] = specimenBox(params.shape);
    const dx = x - X / 2, dy = y - Y / 2;
    const R = Math.min(X, Y) / 2;
    const t = Math.min(1, sqrt(dx * dx + dy * dy) / R);
    return p0 + (g.p1 - p0) * t;
  }
  return p0;
}

// Fonction champ complete (mm -> valeur), solide si < 0.
export function makeFieldFn(params) {
  const f = SURFACES[params.type].f;
  const sheet = params.mode === 'sheet';
  const table = quantileTable(params.type, params.mode);
  const k = TAU / params.cell;
  const sdf = shapeSdf(params.shape);
  const graded = params.gradient && params.gradient.kind !== 'none';
  const t0 = thresholdFor(table, params.porosity);
  return {
    tpms(x, y, z) {
      const g = f(x * k, y * k, z * k);
      const t = graded ? thresholdFor(table, porosityAt(params, x, y, z)) : t0;
      return (sheet ? abs(g) : g) - t;
    },
    sdf,
    k,
    value(x, y, z) {
      return max(this.tpms(x, y, z), sdf(x, y, z) * k);
    },
  };
}

// Echantillonne le champ sur une grille reguliere avec une marge de vide.
export function buildField(params) {
  const [X, Y, Z] = specimenBox(params.shape);
  const h = max(X, Y, Z) / params.res;
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
        const t = fn.tpms(x, y, z);
        sdfv[idx] = d;
        inside[idx] = d <= 0 ? 1 : 0;
        data[idx] = max(t, d * fn.k);
        idx++;
      }
    }
  }
  return { data, inside, sdf: sdfv, nx, ny, nz, hx, hy, hz, origin: [-pad * hx, -pad * hy, -pad * hz], pad };
}
