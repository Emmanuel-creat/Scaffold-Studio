// Confort d'utilisation : palette de commandes (point 75), visite guidee (point 76),
// historique en vignettes (point 77) et onglets sur telephone (point 74).
import { t } from './i18n.js';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Recherche floue simple : tous les mots de la requete doivent apparaitre.
export function matchCommands(commands, query, limit = 12) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const scored = [];
  for (const c of commands) {
    const hay = norm(`${c.label} ${c.group || ''} ${c.keywords || ''}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const label = norm(c.label);
    const score = words.reduce((s, w) => s + (label.startsWith(w) ? 3 : label.includes(w) ? 2 : 1), 0);
    scored.push([score, c]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map((x) => x[1]);
}

// Commandes generees a partir du panneau : chaque reglage devient atteignable au clavier.
export function controlCommands(root) {
  const out = [];
  for (const sec of root.querySelectorAll('details.sec')) {
    const title = sec.querySelector('summary').textContent.trim();
    out.push({ label: title, group: t('Section'), run: () => { sec.open = true; sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); sec.querySelector('summary').focus(); } });
    for (const lab of sec.querySelectorAll('label[for], .lab label')) {
      const id = lab.getAttribute('for');
      const target = id && document.getElementById(id);
      if (!target) continue;
      const text = lab.childNodes[0] && lab.childNodes[0].nodeType === 3 ? lab.childNodes[0].textContent.trim() : lab.textContent.trim();
      if (!text) continue;
      out.push({ label: text, group: title, run: () => { sec.open = true; target.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => target.focus(), 150); } });
    }
    for (const b of sec.querySelectorAll('button.btn[id]')) out.push({ label: b.textContent.trim(), group: title, run: () => { sec.open = true; b.click(); } });
  }
  return out;
}

export function createPalette(getCommands) {
  const dlg = document.createElement('dialog');
  dlg.className = 'palette';
  dlg.setAttribute('aria-label', t('Palette de commandes'));
  dlg.innerHTML = `<input type="search" class="palette-input" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" placeholder="${t('Chercher une commande ou un réglage')}">
    <ul class="palette-list" id="palette-list" role="listbox"></ul><p class="palette-foot">${t('Entrée pour exécuter, flèches pour choisir, Échap pour fermer')}</p>`;
  document.body.append(dlg);
  const input = dlg.querySelector('input'), list = dlg.querySelector('ul');
  let items = [], sel = 0;
  const draw = () => {
    items = matchCommands(getCommands(), input.value);
    sel = Math.min(sel, Math.max(items.length - 1, 0));
    list.innerHTML = items.map((c, i) => `<li role="option" id="pal-${i}" aria-selected="${i === sel}"><span>${c.label}</span><small>${c.group || ''}${c.key ? ` · <kbd>${c.key}</kbd>` : ''}</small></li>`).join('')
      || `<li class="empty">${t('Aucun résultat')}</li>`;
    input.setAttribute('aria-activedescendant', items.length ? `pal-${sel}` : '');
    const cur = list.children[sel]; if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  };
  const run = (i) => { const c = items[i]; if (!c) return; dlg.close(); setTimeout(() => c.run(), 0); };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('li[role=option]'); if (li) run(Number(li.id.slice(4))); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  return { open() { input.value = ''; sel = 0; draw(); dlg.showModal(); input.focus(); }, el: dlg };
}

// Visite guidee : un cadre entoure l'element, une carte explique, au premier lancement.
export function createTour(steps, { onEnd } = {}) {
  const ov = document.createElement('div');
  ov.className = 'tour'; ov.hidden = true;
  ov.innerHTML = '<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-modal="true" aria-live="polite"><div class="tour-step"></div><h3></h3><p></p><div class="tour-nav"><button type="button" data-a="skip" class="btn">' + t('Passer') + '</button><span></span><button type="button" data-a="prev" class="btn">' + t('Précédent') + '</button><button type="button" data-a="next" class="btn primary">' + t('Suivant') + '</button></div></div>';
  document.body.append(ov);
  const hole = ov.querySelector('.tour-hole'), card = ov.querySelector('.tour-card');
  let i = 0;
  const place = () => {
    const s = steps[i];
    const el = s.sel ? document.querySelector(s.sel) : null;
    if (el && s.open) { const d = el.closest('details'); if (d) d.open = true; }
    if (el) el.scrollIntoView({ block: 'nearest' });
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const pad = 6;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    card.querySelector('.tour-step').textContent = `${i + 1} / ${steps.length}`;
    card.querySelector('h3').textContent = s.title;
    card.querySelector('p').textContent = s.text;
    card.querySelector('[data-a=prev]').disabled = i === 0;
    card.querySelector('[data-a=next]').textContent = i === steps.length - 1 ? t('Terminer') : t('Suivant');
    // carte a droite de l'element, sinon dessous, gardee dans l'ecran
    const cw = 320, ch = card.offsetHeight || 180;
    let x = r.left + r.width + 16, y = r.top;
    if (x + cw > innerWidth - 12) { x = Math.max(12, Math.min(r.left, innerWidth - cw - 12)); y = r.top + r.height + 16; }
    if (y + ch > innerHeight - 12) y = Math.max(12, r.top - ch - 16);
    Object.assign(card.style, { left: `${x}px`, top: `${y}px` });
    card.querySelector('[data-a=next]').focus();
  };
  const end = () => { ov.hidden = true; window.removeEventListener('resize', place); onEnd && onEnd(); };
  ov.addEventListener('click', (e) => {
    const a = e.target.dataset && e.target.dataset.a;
    if (a === 'skip') end();
    else if (a === 'prev') { i = Math.max(0, i - 1); place(); }
    else if (a === 'next') { if (i === steps.length - 1) end(); else { i++; place(); } }
  });
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight') { if (i < steps.length - 1) { i++; place(); } }
    else if (e.key === 'ArrowLeft') { if (i > 0) { i--; place(); } }
  });
  return { start() { i = 0; ov.hidden = false; window.addEventListener('resize', place); requestAnimationFrame(place); }, el: ov };
}

// Resume court d'un etat, pour la liste de l'historique.
export function describeState(s, labelOf) {
  const parts = [labelOf(s.type), `${Math.round(s.porosity * 100)} %`, `${s.cell} mm`];
  if (s.gradient && s.gradient.kind !== 'none') parts.push(t('gradient'));
  return parts.join(' · ');
}
