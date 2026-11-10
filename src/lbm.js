// Ecoulement de Stokes dans le reseau poreux par methode de Boltzmann sur reseau
// (D3Q19, collision TRT a deux temps de relaxation, rebond a mi-chemin sur les parois,
// conditions periodiques). Avec le parametre magique 3/16, la position des parois et donc
// la permeabilite ne dependent plus de la viscosite choisie.
// L'ecoulement est pousse par une force volumique, equivalente a un gradient de pression.
// Permeabilite (loi de Darcy) : k = nu * <u> / g.

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
const AXIS = { x: 0, y: 1, z: 2 };

export class LBM {
  constructor(solid, nx, ny, nz, { tau = 1, force = 1e-5, dir = 'z', magic = 3 / 16, collision = 'trt' } = {}) {
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.N = nx * ny * nz;
    this.solid = solid;
    this.tau = tau;
    this.tauMinus = collision === 'trt' ? 0.5 + magic / (tau - 0.5) : tau;
    this.nu = (tau - 0.5) / 3;
    this.g = force;
    this.axis = AXIS[dir] ?? 2;
    this.F = [0, 0, 0];
    this.F[this.axis] = force;
    this.f = new Float32Array(this.N * Q);
    this.f2 = new Float32Array(this.N * Q);
    this.ux = new Float32Array(this.N);
    this.uy = new Float32Array(this.N);
    this.uz = new Float32Array(this.N);
    for (let p = 0; p < this.N; p++) for (let i = 0; i < Q; i++) this.f[p * Q + i] = W[i];
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
    this.meanU = 0;
  }

  get meanUz() { return this.meanU; }

  step(n = 1) {
    const { N, solid, src, tau, tauMinus, F } = this;
    const wp = 1 / tau, wm = 1 / tauMinus;
    const fin = new Float64Array(Q), feq = new Float64Array(Q);
    const ax = this.axis;
    for (let s = 0; s < n; s++) {
      const f = this.f, f2 = this.f2;
      let sum = 0;
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
        // vitesse d'equilibre decalee par la force (relaxation des moments impairs)
        const ux = mx / rho + tauMinus * F[0], uy = my / rho + tauMinus * F[1], uz = mz / rho + tauMinus * F[2];
        const px = mx / rho + 0.5 * F[0], py = my / rho + 0.5 * F[1], pz = mz / rho + 0.5 * F[2];
        this.ux[p] = px; this.uy[p] = py; this.uz[p] = pz;
        sum += ax === 0 ? px : ax === 1 ? py : pz;
        const usq = 1.5 * (ux * ux + uy * uy + uz * uz);
        for (let q = 0; q < Q; q++) {
          const cu = 3 * (C[q][0] * ux + C[q][1] * uy + C[q][2] * uz);
          feq[q] = W[q] * rho * (1 + cu + 0.5 * cu * cu - usq);
        }
        for (let q = 0; q < Q; q++) {
          const o = OPP[q];
          const fp = 0.5 * (fin[q] + fin[o]), fm = 0.5 * (fin[q] - fin[o]);
          const ep = 0.5 * (feq[q] + feq[o]), em = 0.5 * (feq[q] - feq[o]);
          f2[b + q] = fin[q] - wp * (fp - ep) - wm * (fm - em);
        }
      }
      this.f = f2; this.f2 = f;
      this.meanU = sum / N;
      this.steps++;
    }
    return this.meanU;
  }

  permeability() { return this.nu * this.meanU / this.g; }

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
