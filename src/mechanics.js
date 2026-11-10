// Modeles mecaniques de conception : courbe de compression (ISO 13314), fatigue, flambement, degradation.
import { materialOf, gaCoeffs } from './metrics.js';
import { porosityAt, specimenBox, shapeSdf } from './tpms.js';

// Familles de materiaux : comportement en compression et resorption.
export const FAMILY = {
  ti64: 'metal', tantale: 'metal', cocr: 'metal', mg: 'metal', zn: 'metal',
  peek: 'polymer', pcl: 'polymer', pla: 'polymer',
  ha: 'ceramic', tcp: 'ceramic', custom: 'metal',
};

// Vitesse de resorption : erosion de surface (mm/an) ou hydrolyse en masse (demi-vie en mois).
// Ordres de grandeur de la litterature, a ajuster selon le milieu.
export const RESORPTION = {
  mg: { kind: 'surface', rate: 0.4, ref: 'WE43 in vivo, 0,2 à 1 mm/an' },
  zn: { kind: 'surface', rate: 0.03, ref: 'zinc pur in vivo, 0,01 à 0,05 mm/an' },
  tcp: { kind: 'surface', rate: 0.15, ref: 'β-TCP, résorption cellulaire de 6 à 24 mois' },
  pcl: { kind: 'bulk', halfLife: 20, lag: 12, ref: 'PCL, perte de masse après 1 à 2 ans' },
  pla: { kind: 'bulk', halfLife: 8, lag: 6, ref: 'PLA, dégradation de 1 à 2 ans' },
};

// Courbe de compression modele (elastique, plateau, densification) et grandeurs ISO 13314.
export function compressionCurve(params, m) {
  const mat = materialOf(params);
  const fam = FAMILY[params.material] || 'metal';
  const rho = Math.max(0.01, 1 - m.porosity);
  const E = m.E * 1000; // MPa
  const spl = m.sy; // MPa
  const eD = Math.max(0.3, 1 - 1.4 * rho); // deformation de densification (Gibson-Ashby)
  const ey = spl / E;
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const e = (i / 120) * 0.7;
    let s;
    if (e <= ey) s = E * e;
    else if (e <= eD) {
      // Metal : plateau legerement durcissant. Ceramique : effondrement fragile en dents de scie.
      const x = (e - ey) / (eD - ey);
      s = fam === 'ceramic' ? spl * (0.75 + 0.25 * Math.abs(Math.cos(x * Math.PI * 5))) : spl * (1 + 0.15 * x) * (fam === 'polymer' ? 0.95 : 1);
    } else {
      const x = (e - eD) / (1 - eD);
      s = spl * 1.15 * Math.exp(4 * x) / (fam === 'ceramic' ? 1.2 : 1);
    }
    pts.push([e, s]);
  }
  const at = (e) => { const i = Math.min(119, Math.floor((e / 0.7) * 120)); return pts[i][1]; };
  let plateau = 0, c = 0;
  for (const [e, s] of pts) if (e >= 0.2 && e <= 0.3) { plateau += s; c++; }
  plateau /= c || 1;
  let W50 = 0;
  for (let i = 1; i < pts.length && pts[i][0] <= 0.5; i++) W50 += 0.5 * (pts[i][1] + pts[i - 1][1]) * (pts[i][0] - pts[i - 1][0]);
  return {
    pts, E, plateau, plateauEnd: 1.3 * plateau, eD, firstMax: fam === 'ceramic' ? spl : spl * 1.02,
    W50, // MJ/m3 (MPa x deformation)
    efficiency: W50 / (at(0.5) * 0.5 || 1),
    family: fam, matE: mat.E,
  };
}

// Fatigue : loi de Basquin normalisee sur la limite d'elasticite du scaffold.
// Ratios a 10^6 cycles issus des revues sur les reseaux metalliques (environ 0,2 a 0,35).
export function fatigue(params, m) {
  const fam = FAMILY[params.material] || 'metal';
  const ratio = fam === 'ceramic' ? 0.5 : params.mode === 'sheet' ? 0.35 : 0.25;
  const se = ratio * m.sy; // MPa a 10^6 cycles
  const b = -0.1;
  const sf = se / Math.pow(2e6, b);
  const curve = [];
  for (let i = 0; i <= 40; i++) { const N = 10 ** (3 + (i / 40) * 4); curve.push([N, sf * Math.pow(2 * N, b)]); }
  return { ratio, endurance: se, curve, b };
}

// Flambement d'Euler d'un strut : elancement et contrainte critique.
export function buckling(params, m) {
  const mat = materialOf(params);
  const d = m.strut.mean; // mm
  if (!(d > 0) || params.mode === 'sheet') return null;
  const L = params.cell * 0.5; // longueur libre entre noeuds, ordre de grandeur pour les TPMS
  const rg = d / 4;
  const lambda = L / rg;
  const scr = (Math.PI ** 2 * mat.E * 1000) / (lambda * lambda) * 4; // MPa, extremites encastrees (K = 0,5)
  return { L, lambda, scr, safe: scr > mat.sy, ratio: scr / mat.sy };
}

// Degradation : module et masse au cours du temps (mois).
export function degradation(params, m, fit) {
  const r = RESORPTION[params.material];
  if (!r) return null;
  const mat = materialOf(params);
  const { C, n } = fit || gaCoeffs(params);
  const rho0 = Math.max(1e-3, 1 - m.porosity);
  const months = [], E = [], mass = [];
  const er = m.erosion;
  for (let t = 0; t <= 36; t += 1) {
    let frac;
    if (r.kind === 'surface') {
      const d = (r.rate * t) / 12;
      let i = 0;
      while (i < er.depth.length - 1 && er.depth[i + 1] < d) i++;
      if (d >= er.depth[er.depth.length - 1]) frac = 0;
      else {
        const a = er.depth[i], z = er.depth[i + 1], w = (d - a) / Math.max(z - a, 1e-9);
        frac = er.remaining[i] + (er.remaining[i + 1] - er.remaining[i]) * Math.min(1, Math.max(0, w));
      }
      E.push(C * mat.E * Math.pow(rho0 * frac, n));
    } else {
      // Hydrolyse : la rigidite chute avec la masse molaire, la masse apres un delai.
      const k = Math.LN2 / r.halfLife;
      const stiff = Math.exp(-k * t);
      frac = t < r.lag ? 1 : Math.exp(-k * (t - r.lag));
      E.push(C * mat.E * Math.pow(rho0, n) * stiff);
    }
    months.push(t);
    mass.push(frac);
  }
  const half = months.find((t, i) => mass[i] <= 0.5);
  return { months, E, mass, half: half ?? null, kind: r.kind, ref: r.ref };
}

// Module de l'eprouvette avec gradient : moyenne de Voigt par tranche, puis de Reuss selon z.
export function gradedModulus(params, fit, N = 20) {
  const mat = materialOf(params);
  const { C, n } = fit || gaCoeffs(params);
  const [X, Y, Z] = specimenBox(params.shape);
  const sdf = shapeSdf(params.shape);
  let inv = 0, slices = 0;
  for (let k = 0; k < N; k++) {
    const z = ((k + 0.5) * Z) / N;
    let sum = 0, cnt = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) * X) / N, y = ((j + 0.5) * Y) / N;
      if (sdf(x, y, z) > 0) continue;
      const rho = 1 - porosityAt(params, x, y, z, sdf);
      sum += C * mat.E * Math.pow(Math.max(rho, 0), n);
      cnt++;
    }
    if (!cnt) continue;
    inv += 1 / Math.max(sum / cnt, 1e-9);
    slices++;
  }
  return slices ? slices / inv : NaN;
}
