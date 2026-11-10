// Petits graphiques SVG en ligne pour le panneau des mesures.
const nf = (v) => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1000 || a < 0.01) return v.toExponential(0).replace('e+', 'e');
  return String(+v.toPrecision(2)).replace('.', ',');
};

// series : [{ pts: [[x, y], ...], cls }] ; bands : [{ y0, y1, cls }] ; vlines : [{ x, label }]
export function lineChart({ series, xlabel = '', ylabel = '', xlog = false, ylog = false, bands = [], vlines = [], hlines = [], w = 260, h = 140, xmin, xmax, ymin, ymax }) {
  const pad = { l: 42, r: 8, t: 8, b: 26 };
  const all = series.flatMap((s) => s.pts);
  const tx = (v) => (xlog ? Math.log10(Math.max(v, 1e-30)) : v);
  const ty = (v) => (ylog ? Math.log10(Math.max(v, 1e-30)) : v);
  const X0 = tx(xmin ?? Math.min(...all.map((p) => p[0]))), X1 = tx(xmax ?? Math.max(...all.map((p) => p[0])));
  const Y0 = ty(ymin ?? Math.min(0, ...all.map((p) => p[1]))), Y1 = ty(ymax ?? Math.max(...all.map((p) => p[1])) * 1.08);
  const px = (v) => pad.l + ((tx(v) - X0) / (X1 - X0 || 1)) * (w - pad.l - pad.r);
  const py = (v) => h - pad.b - ((ty(v) - Y0) / (Y1 - Y0 || 1)) * (h - pad.t - pad.b);
  const clampY = (v) => Math.min(h - pad.b, Math.max(pad.t, v));
  const ticks = (a, b, log) => {
    if (log) { const out = []; for (let e = Math.ceil(a); e <= Math.floor(b); e++) out.push(10 ** e); return out.length > 5 ? out.filter((_, i) => i % 2 === 0) : out; }
    const step = 10 ** Math.floor(Math.log10((b - a) / 3 || 1));
    const m = (b - a) / step > 8 ? step * 2 : step;
    const out = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toPrecision(6)); return out;
  };
  const xt = ticks(X0, X1, xlog), yt = ticks(Y0, Y1, ylog);
  let svg = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${ylabel} / ${xlabel}">`;
  for (const b of bands) svg += `<rect class="band ${b.cls}" x="${pad.l}" width="${w - pad.l - pad.r}" y="${clampY(py(b.y1))}" height="${Math.max(0, clampY(py(b.y0)) - clampY(py(b.y1)))}"/>`;
  for (const v of yt) svg += `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${py(v)}" y2="${py(v)}"/><text class="tick" x="${pad.l - 4}" y="${py(v) + 3}" text-anchor="end">${nf(v)}</text>`;
  for (const v of xt) svg += `<text class="tick" x="${px(v)}" y="${h - pad.b + 11}" text-anchor="middle">${nf(v)}</text>`;
  for (const l of vlines) svg += `<line class="vline" x1="${px(l.x)}" x2="${px(l.x)}" y1="${pad.t}" y2="${h - pad.b}"/><text class="tick lab" x="${px(l.x) + 3}" y="${pad.t + 8}">${l.label || ''}</text>`;
  for (const l of hlines) svg += `<line class="vline" x1="${pad.l}" x2="${w - pad.r}" y1="${py(l.y)}" y2="${py(l.y)}"/><text class="tick lab" x="${w - pad.r - 2}" y="${py(l.y) - 3}" text-anchor="end">${l.label || ''}</text>`;
  for (const s of series) {
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)},${clampY(py(p[1])).toFixed(1)}`).join('');
    svg += s.dots ? s.pts.map((p) => `<circle class="dot ${s.cls || ''}" cx="${px(p[0])}" cy="${py(p[1])}" r="2.6"/>`).join('') : `<path class="line ${s.cls || ''}" d="${d}"/>`;
  }
  svg += `<text class="axis" x="${(pad.l + w - pad.r) / 2}" y="${h - 3}" text-anchor="middle">${xlabel}</text>`;
  svg += `<text class="axis" x="8" y="${(pad.t + h - pad.b) / 2}" text-anchor="middle" transform="rotate(-90 8 ${(pad.t + h - pad.b) / 2})">${ylabel}</text>`;
  return `${svg}</svg>`;
}

// Histogramme : bins = [[centre, effectif], ...]
export function barChart({ bins, cls = 'acc', xlabel = '', w = 260, h = 90, labels, band }) {
  const pad = { l: 8, r: 8, t: 6, b: 22 };
  const max = Math.max(...bins.map((b) => b[1]), 1);
  const bw = (w - pad.l - pad.r) / bins.length;
  const xmax = bins[bins.length - 1][0] + (bins[1] ? (bins[1][0] - bins[0][0]) / 2 : 0);
  let svg = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${xlabel}">`;
  // Bande de reference, en fraction de la largeur utile.
  if (band) {
    const iw = w - pad.l - pad.r;
    svg += `<rect class="band-ref" x="${pad.l + band[0] * iw}" y="${pad.t}" width="${(band[1] - band[0]) * iw}" height="${h - pad.t - pad.b}"/>`;
  }
  bins.forEach(([, c], i) => {
    const bh = (c / max) * (h - pad.t - pad.b);
    svg += `<rect class="bar ${cls}" x="${pad.l + i * bw + 0.5}" y="${h - pad.b - bh}" width="${Math.max(bw - 1, 0.5)}" height="${bh}"/>`;
  });
  for (let i = 0; i <= 4; i++) {
    const v = labels ? labels[i] : Math.round((xmax * i) / 4);
    svg += `<text class="tick" x="${pad.l + ((w - pad.l - pad.r) * i) / 4}" y="${h - pad.b + 11}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${v}</text>`;
  }
  svg += `<text class="axis" x="${w / 2}" y="${h - 2}" text-anchor="middle">${xlabel}</text></svg>`;
  return svg;
}
