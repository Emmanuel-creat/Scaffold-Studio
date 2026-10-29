// Maillage de l'isosurface 0 par la methode "surface nets" (un sommet par cellule
// traversee, des quadrilateres par arete traversee). Maillage ferme et oriente
// vers l'exterieur du solide (valeurs positives).

const CUBE_EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function surfaceNets(field) {
  const { data, nx, ny, nz, hx, hy, hz, origin } = field;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  let pos = new Float32Array(1 << 16);
  let nv = 0;
  const corner = new Float32Array(8);
  const sx = 1, sy = nx, sz = nx * ny;

  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const base = i + j * sy + k * sz;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = data[base + (c & 1 ? sx : 0) + (c & 2 ? sy : 0) + (c & 4 ? sz : 0)];
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const [a, b] = CUBE_EDGES[e];
          const va = corner[a], vb = corner[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const pa = [(a & 1), (a >> 1) & 1, (a >> 2) & 1];
          const pb = [(b & 1), (b >> 1) & 1, (b >> 2) & 1];
          ax += pa[0] + (pb[0] - pa[0]) * t;
          ay += pa[1] + (pb[1] - pa[1]) * t;
          az += pa[2] + (pb[2] - pa[2]) * t;
          n++;
        }
        if (nv * 3 + 3 > pos.length) {
          const np = new Float32Array(pos.length * 2);
          np.set(pos);
          pos = np;
        }
        pos[nv * 3] = origin[0] + (i + ax / n) * hx;
        pos[nv * 3 + 1] = origin[1] + (j + ay / n) * hy;
        pos[nv * 3 + 2] = origin[2] + (k + az / n) * hz;
        cellVert[i + j * cx + k * cx * cy] = nv++;
      }
    }
  }

  let idx = new Uint32Array(1 << 16);
  let ni = 0;
  const cell = (i, j, k) => cellVert[i + j * cx + k * cx * cy];
  const push = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (ni + 6 > idx.length) {
      const n2 = new Uint32Array(idx.length * 2);
      n2.set(idx);
      idx = n2;
    }
    if (flip) { idx[ni++] = a; idx[ni++] = c; idx[ni++] = b; idx[ni++] = a; idx[ni++] = d; idx[ni++] = c; }
    else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
  };

  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const p = i + j * sy + k * sz;
        const s0 = data[p] < 0;
        if (i < nx - 1 && s0 !== (data[p + sx] < 0)) {
          push(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !s0);
        }
        if (j < ny - 1 && s0 !== (data[p + sy] < 0)) {
          push(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !s0);
        }
        if (k < nz - 1 && s0 !== (data[p + sz] < 0)) {
          push(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !s0);
        }
      }
    }
  }

  const positions = pos.slice(0, nv * 3);
  const indices = idx.slice(0, ni);
  return { positions, indices, normals: vertexNormals(positions, indices) };
}

export function vertexNormals(positions, indices) {
  const nrm = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { nrm[q] += nx; nrm[q + 1] += ny; nrm[q + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  return nrm;
}

// Volume signe (theoreme de divergence) et aire du maillage, en mm3 et mm2.
export function meshVolumeArea(positions, indices) {
  let vol = 0, area = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cxp = positions[c], cyp = positions[c + 1], czp = positions[c + 2];
    vol += (ax * (by * czp - bz * cyp) - ay * (bx * czp - bz * cxp) + az * (bx * cyp - by * cxp)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cxp - ax, vy = cyp - ay, vz = czp - az;
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return { volume: vol, area };
}
