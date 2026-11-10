// Calcul elements finis hors du fil principal.
import { cellVoxels, homogenize, engineering, normalModuli, vonMisesUniaxial, fitGibsonAshby, percentile } from './fem.js';

self.onmessage = (e) => {
  const { id, params, n = 24 } = e.data;
  try {
    const t0 = performance.now();
    const post = (stage, detail = '') => self.postMessage({ id, stage, detail });
    post('Voxelisation de la cellule');
    const vox = cellVoxels(params, n);
    const res = homogenize(vox, {
      onProgress: (cs, it) => post('Homogénéisation', `${cs + 1} / 6 · ${it}`),
    });
    const eng = engineering(res.C);
    const vm = vonMisesUniaxial(res);
    const kt99 = percentile(vm, 0.99), ktMax = percentile(vm, 1);
    const vmGrid = new Float32Array(vox.nx * vox.ny * vox.nz);
    for (let q = 0; q < res.ne; q++) vmGrid[res.elems[q * 3] + res.elems[q * 3 + 1] * vox.nx + res.elems[q * 3 + 2] * vox.nx * vox.ny] = vm[q];
    // Points supplementaires pour ajuster Gibson-Ashby sur cette surface.
    const pts = [{ rho: vox.density, E: normalModuli(res.C).Ez }];
    const set = [0.5, 0.62, 0.74, 0.86].filter((p) => Math.abs(p - params.porosity) > 0.04);
    set.forEach((poro, i) => {
      post('Ajustement Gibson-Ashby', `${Math.round(poro * 100)} % · ${i + 1} / ${set.length}`);
      const v = cellVoxels({ ...params, porosity: poro }, 16);
      if (v.density <= 0.01) return;
      const r = homogenize(v, { cases: [0, 1, 2], tol: 1e-5 });
      pts.push({ rho: v.density, E: normalModuli(r.C).Ez });
    });
    const fit = fitGibsonAshby(pts);
    self.postMessage({
      id, ok: true,
      result: {
        C: Array.from(res.C), eng: { ...eng, S: undefined }, density: vox.density,
        kt99, ktMax, vmGrid, dims: [vox.nx, vox.ny, vox.nz], size: vox.size,
        fit, points: pts, iterations: res.iterations, timeMs: performance.now() - t0,
        zener: (2 * res.C[21]) / (res.C[0] - res.C[1]),
      },
    }, [vmGrid.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
