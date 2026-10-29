// Ecoulement de Stokes dans le reseau poreux par methode de Boltzmann sur reseau
// (D3Q19, collision BGK, rebond a mi-chemin sur les parois, conditions periodiques).
// L'ecoulement est pousse par une force volumique selon z, equivalente a un gradient
// de pression. La permeabilite suit la loi de Darcy : k = nu * <u_z> / g.

const C = [
  [0, 0, 0],
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0],
  [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1],
  [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1],
];
const W = [1 / 3, ...Array(6).fill(1 / 18), ...Array(12).fill(1 / 36)];
const OPP = C.map(([x, y, z]) => C.findIndex(([a, b, c]) => a === -x && b === -y && c === -z));
const Q = 19;

export class LBM {
  constructor(solid, nx, ny, nz, { tau = 1, force = 1e-5 } = {}) {
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.N = nx * ny * nz;
    this.solid = solid;
    this.tau = tau;
    this.nu = (tau - 0.5) / 3;
    this.g = force;
    this.f = new Float32Array(this.N * Q);
    this.f2 = new Float32Array(this.N * Q);
    this.ux = new Float32Array(this.N);
    this.uy = new Float32Array(this.N);
    this.uz = new Float32Array(this.N);
    for (let p = 0; p < this.N; p++) for (let i = 0; i < Q; i++) this.f[p * Q + i] = W[i];
    // voisins amont pre-calcules (indice du noeud source pour chaque direction)
    this.src = new Int32Array(this.N * Q);
    let p = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, p++) {
      for (let q = 0; q < Q; q++) {
        const si = (i - C[q][0] + nx) % nx, sj = (j - C[q][1] + ny) % ny, sk = (k - C[q][2] + nz) % nz;
        const s = si + sj * nx + sk * nx * ny;
        this.src[p * Q + q] = solid[s] ? -1 : s;
      }
    }
    this.steps = 0;
    this.meanUz = 0;
  }

  step(n = 1) {
    const { N, solid, src, tau, g } = this;
    const omega = 1 / tau;
    const fin = new Float64Array(Q);
    for (let s = 0; s < n; s++) {
      const f = this.f, f2 = this.f2;
      let sumUz = 0;
      for (let p = 0; p < N; p++) {
        if (solid[p]) continue;
        let rho = 0, mx = 0, my = 0, mz = 0;
        const b = p * Q;
        for (let q = 0; q < Q; q++) {
          const sp = src[b + q];
          const v = sp < 0 ? f[b + OPP[q]] : f[sp * Q + q];
          fin[q] = v;
          rho += v; mx += v * C[q][0]; my += v * C[q][1]; mz += v * C[q][2];
        }
        const ux = mx / rho, uy = my / rho;
        const uz = mz / rho + tau * g; // decalage de vitesse (force de Shan-Chen)
        // vitesse physique = moyenne avant et apres la force
        this.ux[p] = ux; this.uy[p] = uy; this.uz[p] = mz / rho + 0.5 * g;
        sumUz += this.uz[p];
        const usq = 1.5 * (ux * ux + uy * uy + uz * uz);
        for (let q = 0; q < Q; q++) {
          const cu = 3 * (C[q][0] * ux + C[q][1] * uy + C[q][2] * uz);
          const feq = W[q] * rho * (1 + cu + 0.5 * cu * cu - usq);
          f2[b + q] = fin[q] + omega * (feq - fin[q]);
        }
      }
      this.f = f2; this.f2 = f;
      this.meanUz = sumUz / N; // vitesse de Darcy (moyenne sur tout le volume)
      this.steps++;
    }
    return this.meanUz;
  }

  // Permeabilite en unites de reseau (dx = 1).
  permeability() {
    return this.nu * this.meanUz / this.g;
  }

  // Ecoulement jusqu'a convergence (variation relative inferieure a tol).
  run({ maxSteps = 4000, chunk = 50, tol = 1e-4, onProgress } = {}) {
    let prev = 0;
    while (this.steps < maxSteps) {
      const u = this.step(chunk);
      const rel = Math.abs(u - prev) / Math.max(Math.abs(u), 1e-30);
      prev = u;
      if (onProgress && onProgress(this) === false) return false;
      if (this.steps > 2 * chunk && rel < tol) return true;
    }
    return false;
  }
}
