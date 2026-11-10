// Parcours complet dans le navigateur, avec captures d'ecran conservees par la CI.
import { test, expect } from '@playwright/test';

const ready = (page) => page.waitForFunction(() => window.scaffoldStudio && window.scaffoldStudio.app.analysis, null, { timeout: 180000 });
const settle = async (page) => { await page.waitForTimeout(500); await ready(page); };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('e2e')) { localStorage.setItem('ss-lang', 'fr'); sessionStorage.clear(); sessionStorage.setItem('e2e', '1'); } localStorage.setItem('ss-tour', '1'); } catch { /* ignore */ } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.errors = errors;
  await page.goto('./');
  await page.evaluate(() => { document.querySelector('#res button[data-v=low]').click(); });
  await settle(page);
  await page.evaluate(() => { window.scaffoldStudio.state.view.autoRotate = false; });
});

test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('la piece par defaut est maillee et mesuree', async ({ page }, info) => {
  const m = await page.evaluate(() => window.scaffoldStudio.app.metrics);
  expect(m.porosity).toBeGreaterThan(0.6);
  expect(m.porosity).toBeLessThan(0.8);
  await expect(page.locator('#metrics')).toContainText('Porosité mesurée');
  await page.screenshot({ path: info.outputPath('01-defaut.png') });
});

test('changer de surface et de porosite recalcule la geometrie', async ({ page }) => {
  await page.selectOption('#type', 'octet');
  await settle(page);
  const a = await page.evaluate(() => window.scaffoldStudio.app.metrics.porosity);
  await page.locator('#porosity-n').fill('60');
  await page.locator('#porosity-n').press('Enter');
  await settle(page);
  const b = await page.evaluate(() => window.scaffoldStudio.app.metrics.porosity);
  expect(b).toBeLessThan(a);
});

test('annuler, retablir et historique en vignettes', async ({ page }) => {
  await page.selectOption('#type', 'diamond');
  await settle(page);
  await page.keyboard.press('Control+z');
  await settle(page);
  expect(await page.evaluate(() => window.scaffoldStudio.state.type)).toBe('gyroid');
  await page.keyboard.press('Control+y');
  await settle(page);
  expect(await page.evaluate(() => window.scaffoldStudio.state.type)).toBe('diamond');
  await page.click('#btn-history');
  await expect(page.locator('#history-pop button[data-i]').first()).toBeVisible();
});

test('la palette de commandes trouve et execute un reglage', async ({ page }) => {
  await page.click('canvas');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('treillis');
  await expect(page.locator('.palette-list li').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('porosité visée');
  await page.keyboard.press('Enter');
  await expect(page.locator('#porosity')).toBeFocused();
});

test('la perfusion donne une permeabilite', async ({ page }, info) => {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => { const a = window.scaffoldStudio.app; return a.flowStatus && ['converged', 'max'].includes(a.flowStatus.state); }, null, { timeout: 200000 });
  const k = await page.evaluate(() => window.scaffoldStudio.app.flowStatus.permeability);
  expect(k).toBeGreaterThan(1e-10);
  expect(k).toBeLessThan(1e-7);
  await page.screenshot({ path: info.outputPath('02-perfusion.png') });
});

test('exports STL et CSV', async ({ page }) => {
  const stl = page.waitForEvent('download');
  await page.click('#btn-export');
  await page.click('[data-export=stl]');
  expect((await stl).suggestedFilename()).toMatch(/\.stl$/);
  const csv = page.waitForEvent('download');
  await page.click('#btn-export');
  await page.click('[data-export=csv]');
  expect((await csv).suggestedFilename()).toMatch(/\.csv$/);
});

test('interface en anglais', async ({ page }) => {
  await page.click('#btn-lang');
  await expect(page.locator('#metrics')).toContainText('Measured porosity');
});

test('telephone : onglets Vue, Reglages, Mesures', async ({ page }, info) => {
  await page.setViewportSize({ width: 400, height: 820 });
  await page.click('nav.tabs [data-tab=controls]');
  await expect(page.locator('#type')).toBeVisible();
  await page.click('nav.tabs [data-tab=metrics]');
  await expect(page.locator('#metrics')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
  await page.screenshot({ path: info.outputPath('03-telephone.png') });
});
