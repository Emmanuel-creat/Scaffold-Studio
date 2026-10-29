const nf = (d) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = (v, d = 1) => (Number.isFinite(v) ? nf(d).format(v) : '·');
export const pct = (v, d = 1) => fmt(v * 100, d);
export function sci(v, d = 1) {
  if (!Number.isFinite(v) || v <= 0) return '·';
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  const sup = String(e).replace(/-/g, '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
  return `${nf(d).format(m)}×10${sup}`;
}
// position relative (0..1) sur une echelle lineaire ou logarithmique
export function scalePos(v, lo, hi, log = false) {
  if (log) { v = Math.log10(Math.max(v, 1e-30)); lo = Math.log10(lo); hi = Math.log10(hi); }
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}
// palette "turbo" approchee pour les cartes de chaleur
export function turbo(t) {
  t = Math.min(1, Math.max(0, t));
  const r = 0.1357 + t * (4.5974 - t * (42.3277 - t * (130.5887 - t * (150.5666 - t * 58.1375))));
  const g = 0.0914 + t * (2.1856 + t * (4.8052 - t * (14.0195 - t * (4.2109 + t * 2.7747))));
  const b = 0.1067 + t * (12.5925 - t * (60.1097 - t * (109.0745 - t * (88.5066 - t * 26.8183))));
  return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];
}
