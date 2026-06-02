// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = process.env.TEST_URL || 'http://localhost:8765';

/** Click the Edit tab then Load Example. Used by most tests. */
async function loadExample(page) {
  await page.click('.console-tab[data-tab="edit"]');
  await page.click('#loadExample');
  await expect(page.locator('#lvglDisplay .placeholder')).toHaveCount(0, { timeout: 10000 });
}

test.describe('LVGL Simulator smoke tests', () => {

  test('page loads with no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Filter out known benign errors (e.g. favicon 404 on local server)
    const real = errors.filter(e => !e.includes('favicon'));
    expect(real, `Console errors: ${real.join('\n')}`).toHaveLength(0);
  });

  test('loads example config and renders at least one page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    // Display element should have children (rendered widgets)
    const childCount = await page.locator('#lvglDisplay').evaluate(el => el.children.length);
    expect(childCount, 'Expected rendered widgets in #lvglDisplay').toBeGreaterThan(0);

    // No JS errors during render
    const real = errors.filter(e => !e.includes('favicon'));
    expect(real, `Render errors: ${real.join('\n')}`).toHaveLength(0);
  });

  test('left rail page list populates after load', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    const rowCount = await page.locator('#page-list .page-list-row').count();
    expect(rowCount, 'Left rail should list pages').toBeGreaterThan(0);

    const badge = await page.locator('#page-count-badge').textContent();
    expect(parseInt(badge || '0')).toBeGreaterThan(0);
  });

  test('page selector pill shows real page info after load', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    const index = await page.locator('#page-selector-index').textContent();
    expect(index).not.toBe('--');
    expect(index).toMatch(/\d+\/\d+/);
  });

  test('swipe right arrow navigates to next page', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    const before = await page.locator('#page-selector-index').textContent();
    await page.click('#swipe-right');
    await page.waitForTimeout(400); // allow animation

    const after = await page.locator('#page-selector-index').textContent();
    // If there are multiple pages, the index should change
    const pageCount = parseInt((before || '1/1').split('/')[1]);
    if (pageCount > 1) {
      expect(after).not.toBe(before);
    }
  });

  test('clicking page in left rail navigates to that page', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    const rows = page.locator('#page-list .page-list-row');
    const count = await rows.count();
    if (count > 1) {
      await rows.nth(1).click();
      await page.waitForTimeout(200);
      const index = await page.locator('#page-selector-index').textContent();
      expect(index).toMatch(/^2\//);
    }
  });

  test('top bar caption shows display dimensions after load', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    const caption = await page.locator('#top-bar-caption').textContent();
    expect(caption).toMatch(/\d+×\d+/);
  });

});
