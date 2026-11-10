// Traduction de l'interface (francais par defaut, anglais en option).
import EN from './i18n.en.js';

let lang = 'fr';
try {
  const saved = localStorage.getItem('ss-lang');
  lang = saved || ((navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en');
} catch { /* stockage indisponible */ }

export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('ss-lang', l); } catch { /* ignore */ }
}
export function t(s) {
  if (lang === 'fr') return s;
  return EN[s] ?? s;
}
// Remplace les textes statiques de la page marques data-i18n.
export function translatePage(root = document) {
  root.documentElement && (root.documentElement.lang = lang);
  root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n || n.textContent.trim()); });
  root.querySelectorAll('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
}
