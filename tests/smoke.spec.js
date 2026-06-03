// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = process.env.TEST_URL || 'http://localhost:8765';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Activate the Edit tab and load the built-in example config. */
async function loadExample(page) {
  await page.click('.console-tab[data-tab="edit"]');
  await page.click('#loadExample');
  await expect(page.locator('#lvglDisplay .placeholder')).toHaveCount(0, { timeout: 10000 });
}

/**
 * Paste a YAML string into the editor and click Render Preview.
 * Waits until the placeholder disappears.
 */
async function renderYAML(page, yaml) {
  await page.click('.console-tab[data-tab="edit"]');
  await page.fill('#yamlEditor', yaml);
  await page.click('#renderPreview');
  await expect(page.locator('#lvglDisplay .placeholder')).toHaveCount(0, { timeout: 10000 });
}

/** Minimal 2-page config for navigation tests.
 *  Explicit on_swipe handlers so navigation is driven by YAML, not hardcoded fallbacks.
 *  alpha_page swipe-left → beta_page; beta_page swipe-right → alpha_page.
 */
const TWO_PAGE_YAML = `
display:
  - platform: custom
    dimensions:
      width: 320
      height: 240
lvgl:
  color_depth: 16
  pages:
    - id: alpha_page
      on_swipe_left: !lambda "id(lvgl_comp)->show_page(id(beta_page)->index, LV_SCR_LOAD_ANIM_MOVE_LEFT, 200);"
      widgets:
        - label:
            id: lbl_alpha
            text: "Alpha"
            align: CENTER
    - id: beta_page
      on_swipe_right: !lambda "id(lvgl_comp)->show_page(id(alpha_page)->index, LV_SCR_LOAD_ANIM_MOVE_RIGHT, 200);"
      widgets:
        - label:
            id: lbl_beta
            text: "Beta"
            align: CENTER
`.trim();

/** Config with a single known widget tree for DOM verification. */
const SINGLE_PAGE_YAML = `
display:
  - platform: custom
    dimensions:
      width: 480
      height: 320
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      bg_color: 0x111111
      widgets:
        - obj:
            id: container_box
            width: 200
            height: 100
            align: CENTER
            widgets:
              - label:
                  id: hello_label
                  text: "Hello World"
                  text_color: 0xFFFFFF
                  align: CENTER
        - button:
            id: my_button
            width: 80
            height: 40
            align: BOTTOM_MID
        - bar:
            id: my_bar
            width: 160
            height: 20
            align: TOP_MID
            value: 60
            min_value: 0
            max_value: 100
`.trim();

// ─── test suites ─────────────────────────────────────────────────────────────

test.describe('Display setup', () => {

  test('example config: lvglDisplay dimensions match YAML (800×480)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    // setupDisplay() sets style.width/height from display.dimensions in YAML
    const { w, h } = await page.locator('#lvglDisplay').evaluate(el => ({
      w: el.style.width, h: el.style.height,
    }));
    expect(w, 'display width should be 800px').toBe('800px');
    expect(h, 'display height should be 480px').toBe('480px');
  });

  test('example config: top-bar caption shows correct dimensions', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    // setupDisplay() writes "{width}×{height} · {colorDepth}-bit" to #top-bar-caption
    const caption = await page.locator('#top-bar-caption').textContent();
    expect(caption).toMatch(/800\s*[×x]\s*480/);
    expect(caption).toMatch(/16-bit/);
  });

  test('custom YAML: lvglDisplay resizes to YAML dimensions', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    const { w, h } = await page.locator('#lvglDisplay').evaluate(el => ({
      w: el.style.width, h: el.style.height,
    }));
    expect(w, 'display width should be 480px').toBe('480px');
    expect(h, 'display height should be 320px').toBe('320px');
  });

});

test.describe('Widget rendering', () => {

  test('obj widget renders with .lvgl-obj class', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    const count = await page.locator('#lvglDisplay .lvgl-obj').count();
    expect(count, '.lvgl-obj should render').toBeGreaterThan(0);
  });

  test('label widget renders with .lvgl-label class', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    const count = await page.locator('#lvglDisplay .lvgl-label').count();
    expect(count, '.lvgl-label should render').toBeGreaterThan(0);
  });

  test('button widget renders with .lvgl-button class', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    const count = await page.locator('#lvglDisplay .lvgl-button').count();
    expect(count, '.lvgl-button should render').toBeGreaterThan(0);
  });

  test('bar widget renders with .lvgl-bar class', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    const count = await page.locator('#lvglDisplay .lvgl-bar').count();
    expect(count, '.lvgl-bar should render').toBeGreaterThan(0);
  });

  test('widgets with YAML ids get data-lvgl-id attribute', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    // Widgets with ids must carry data-lvgl-id so inspector and alignments work
    await expect(page.locator('[data-lvgl-id="container_box"]')).toHaveCount(1);
    await expect(page.locator('[data-lvgl-id="hello_label"]')).toHaveCount(1);
    await expect(page.locator('[data-lvgl-id="my_button"]')).toHaveCount(1);
    await expect(page.locator('[data-lvgl-id="my_bar"]')).toHaveCount(1);
  });

  test('label text content matches YAML text property', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    const label = page.locator('[data-lvgl-id="hello_label"]');
    const text = await label.textContent();
    expect(text).toContain('Hello World');
  });

  test('lvglDisplay has children after render', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    // renderCurrentPage('NONE') places widgets directly into #lvglDisplay.
    // The .lvgl-page-wrapper only exists during animated transitions.
    const childCount = await page.locator('#lvglDisplay').evaluate(el => el.children.length);
    expect(childCount, '#lvglDisplay should have rendered children').toBeGreaterThan(0);
  });

});

test.describe('Page selector pill', () => {

  test('pill shows correct index format after single-page load', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    // syncPageSelect() sets #page-selector-index to "{currentIndex+1}/{totalPages}"
    const index = await page.locator('#page-selector-index').textContent();
    expect(index).toBe('1/1');
  });

  test('pill title transforms page ID correctly (removes _page suffix)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    // pageDisplayTitle('main_page') → strips _page → "Main"
    const title = await page.locator('#page-selector-title').textContent();
    expect(title).toBe('Main');
  });

  test('pill index updates on navigation', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    const before = await page.locator('#page-selector-index').textContent();
    expect(before).toBe('1/2');

    // #swipe-left (←) calls _handleSwipe('left') which increments currentPageIndex
    await page.click('#swipe-left');
    await page.waitForTimeout(400);

    const after = await page.locator('#page-selector-index').textContent();
    expect(after).toBe('2/2');
  });

  test('pill title updates on navigation', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    // alpha_page → "Alpha" (strips _page)
    const before = await page.locator('#page-selector-title').textContent();
    expect(before).toBe('Alpha');

    // #swipe-left (←) → next page
    await page.click('#swipe-left');
    await page.waitForTimeout(400);

    // beta_page → "Beta"
    const after = await page.locator('#page-selector-title').textContent();
    expect(after).toBe('Beta');
  });

});

test.describe('Left-rail page list', () => {

  test('page list row count matches config page count', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    const count = await page.locator('#page-list .page-list-row').count();
    expect(count).toBe(2);
  });

  test('page count badge shows correct number', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    const badge = await page.locator('#page-count-badge').textContent();
    expect(badge?.trim()).toBe('2');
  });

  test('first page row is active after initial render', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    const firstRow = page.locator('#page-list .page-list-row').first();
    await expect(firstRow).toHaveClass(/active/);
  });

  test('clicking second row navigates to second page', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    await page.locator('#page-list .page-list-row').nth(1).click();
    await page.waitForTimeout(250);

    const index = await page.locator('#page-selector-index').textContent();
    expect(index).toBe('2/2');

    const secondRow = page.locator('#page-list .page-list-row').nth(1);
    await expect(secondRow).toHaveClass(/active/);
  });

  test('page list row titles match transformed page IDs', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    const rows = page.locator('#page-list .page-list-row__title');
    const titles = await rows.allTextContents();
    // alpha_page → "Alpha", beta_page → "Beta"
    expect(titles[0]).toBe('Alpha');
    expect(titles[1]).toBe('Beta');
  });

});

test.describe('Page navigation', () => {

  test('swipe-left triggers on_swipe_left lambda → navigates to beta_page', async ({ page }) => {
    // alpha_page has on_swipe_left: show_page(id(beta_page)->index, ...)
    // The simulator parses the lambda body and navigates to beta_page.
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    await page.click('#swipe-left');
    await page.waitForTimeout(400);

    expect(await page.locator('#page-selector-index').textContent()).toBe('2/2');
  });

  test('swipe-right triggers on_swipe_right lambda → navigates back to alpha_page', async ({ page }) => {
    // beta_page has on_swipe_right: show_page(id(alpha_page)->index, ...)
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    // Go to beta_page first
    await page.click('#swipe-left');
    await page.waitForTimeout(400);
    expect(await page.locator('#page-selector-index').textContent()).toBe('2/2');

    // Then swipe-right: should go back to alpha_page via YAML handler
    await page.click('#swipe-right');
    await page.waitForTimeout(400);
    expect(await page.locator('#page-selector-index').textContent()).toBe('1/2');
  });

  test('navigating pages re-renders widgets for correct page', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    // Page 1 has lbl_alpha, not lbl_beta
    await expect(page.locator('[data-lvgl-id="lbl_alpha"]')).toHaveCount(1);
    await expect(page.locator('[data-lvgl-id="lbl_beta"]')).toHaveCount(0);

    // Advance to page 2 (← = next)
    await page.click('#swipe-left');
    await page.waitForTimeout(400);

    // Page 2 has lbl_beta, not lbl_alpha
    await expect(page.locator('[data-lvgl-id="lbl_beta"]')).toHaveCount(1);
    await expect(page.locator('[data-lvgl-id="lbl_alpha"]')).toHaveCount(0);
  });

});

test.describe('YAML console tabs', () => {

  test('Page YAML tab populates after render', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    // Click the Page tab
    await page.click('.console-tab[data-tab="page"]');
    const pane = page.locator('#tab-page .yaml-pane');
    await expect(pane).toBeVisible();
    const text = await pane.textContent();
    // Should contain the page id
    expect(text).toContain('test_page');
  });

  test('Globals YAML tab shows globals section when present', async ({ page }) => {
    const yamlWithGlobals = SINGLE_PAGE_YAML + `
globals:
  - id: my_counter
    type: int
    initial_value: "0"`;

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yamlWithGlobals);

    await page.click('.console-tab[data-tab="globals"]');
    const pane = page.locator('#tab-globals .yaml-pane');
    await expect(pane).toBeVisible();
    const text = await pane.textContent();
    expect(text).toContain('my_counter');
  });

});

test.describe('Error handling', () => {

  test('invalid YAML shows error, no JS crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    await page.click('.console-tab[data-tab="edit"]');
    await page.fill('#yamlEditor', 'this: is: not: valid: yaml: {{{{');
    await page.click('#renderPreview');
    await page.waitForTimeout(500);

    // No uncaught JS errors
    const real = errors.filter(e => !e.includes('favicon'));
    expect(real, `JS crashed: ${real.join('\n')}`).toHaveLength(0);

    // Placeholder should still be visible (or error message shown), not widgets
    // Either the placeholder remains OR an error element is present
    const hasPlaceholder = await page.locator('#lvglDisplay .placeholder').count() > 0;
    const hasError = await page.locator('#lvglDisplay .render-error, .error-banner, [class*="error"]').count() > 0;
    expect(hasPlaceholder || hasError, 'Expected either placeholder or error message').toBeTruthy();
  });

  test('page loads with no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Filter out network failures for external resources (fonts CDN, favicon, etc.)
    const real = errors.filter(e =>
      !e.includes('favicon') && !e.includes('net::ERR_') && !e.includes('Failed to load resource')
    );
    expect(real, `Console errors: ${real.join('\n')}`).toHaveLength(0);
  });

  test('no JS errors after loading example config', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    const real = errors.filter(e => !e.includes('favicon'));
    expect(real, `Errors during render: ${real.join('\n')}`).toHaveLength(0);
  });

  test('unknown widget type renders .lvgl-unsupported placeholder', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      widgets:
        - frobnicate:
            id: unknown_widget
            width: 60
            height: 40
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    await expect(page.locator('.lvgl-unsupported')).toHaveCount(1);
    // Should show the widget type name in brackets
    const text = await page.locator('.lvgl-unsupported').textContent();
    expect(text).toContain('frobnicate');
  });

  test('widget without id does not get data-lvgl-id attribute', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      widgets:
        - label:
            text: "No ID label"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // The label renders but must NOT have data-lvgl-id (no id in YAML)
    const label = page.locator('.lvgl-label');
    await expect(label).toHaveCount(1);
    const hasId = await label.evaluate(el => el.hasAttribute('data-lvgl-id'));
    expect(hasId, 'label without YAML id should not have data-lvgl-id').toBe(false);
  });

});

// ─── UI controls ────────────────────────────────────────────────────────────

test.describe('UI controls', () => {

  test('display preset 320x240 overrides YAML dimensions', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML); // YAML says 480x320

    // Select a different preset
    await page.selectOption('#displayPreset', '320x240');
    await page.waitForTimeout(300);

    const { w, h } = await page.locator('#lvglDisplay').evaluate(el => ({
      w: el.style.width, h: el.style.height,
    }));
    expect(w, 'preset should override to 320px').toBe('320px');
    expect(h, 'preset should override to 240px').toBe('240px');
  });

  test('theme toggle switches data-theme attribute', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Default: no data-theme (dark)
    const before = await page.locator('html').getAttribute('data-theme');
    expect(before).toBeNull();

    await page.click('#theme-toggle');

    const after = await page.locator('html').getAttribute('data-theme');
    expect(after).toBe('light');

    // Toggle back
    await page.click('#theme-toggle');
    const final = await page.locator('html').getAttribute('data-theme');
    expect(final).toBeNull();
  });

  test('rotation 90° applies transform rotate to #lvglDisplay', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    await page.selectOption('#rotationSelect', '90');
    await page.waitForTimeout(100);

    const transform = await page.locator('#lvglDisplay').evaluate(el => el.style.transform);
    expect(transform).toContain('rotate(90deg)');
  });

  test('rotation 0° removes transform after being set', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    await page.selectOption('#rotationSelect', '180');
    await page.waitForTimeout(100);
    await page.selectOption('#rotationSelect', '0');
    await page.waitForTimeout(100);

    const transform = await page.locator('#lvglDisplay').evaluate(el => el.style.transform);
    // rotate(0deg) is fine, or empty — must not be 180
    expect(transform).not.toContain('rotate(180deg)');
  });

  test('display preset Auto re-reads YAML dimensions', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML); // 480x320

    // Override with preset, then switch back to Auto
    await page.selectOption('#displayPreset', '320x240');
    await page.waitForTimeout(300);
    await page.selectOption('#displayPreset', '');
    await page.waitForTimeout(300);

    const { w, h } = await page.locator('#lvglDisplay').evaluate(el => ({
      w: el.style.width, h: el.style.height,
    }));
    expect(w).toBe('480px');
    expect(h).toBe('320px');
  });

});

// ─── Re-render correctness ───────────────────────────────────────────────────

test.describe('Re-render correctness', () => {

  test('re-rendering different YAML removes stale widget ids', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // First render: has container_box
    await renderYAML(page, SINGLE_PAGE_YAML);
    await expect(page.locator('[data-lvgl-id="container_box"]')).toHaveCount(1);

    // Second render: TWO_PAGE_YAML — no container_box
    await renderYAML(page, TWO_PAGE_YAML);

    await expect(page.locator('[data-lvgl-id="container_box"]'), 'stale widget from first render should be gone').toHaveCount(0);
  });

  test('re-rendering updates display dimensions', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    await renderYAML(page, SINGLE_PAGE_YAML); // 480x320
    const size1 = await page.locator('#lvglDisplay').evaluate(el => el.style.width);
    expect(size1).toBe('480px');

    await renderYAML(page, TWO_PAGE_YAML); // 320x240
    const size2 = await page.locator('#lvglDisplay').evaluate(el => el.style.width);
    expect(size2).toBe('320px');
  });

  test('re-rendering resets page selector to page 1', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    await renderYAML(page, TWO_PAGE_YAML);
    // Navigate to page 2
    await page.click('#swipe-left');
    await page.waitForTimeout(400);
    expect(await page.locator('#page-selector-index').textContent()).toBe('2/2');

    // Re-render the same YAML — should reset to page 1
    await renderYAML(page, TWO_PAGE_YAML);
    expect(await page.locator('#page-selector-index').textContent()).toBe('1/2');
  });

});

// ─── Widget styles ───────────────────────────────────────────────────────────

test.describe('Widget styles', () => {

  test('bg_color applies to widget background', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      widgets:
        - obj:
            id: colored_box
            width: 100
            height: 100
            align: CENTER
            bg_color: 0xFF0000
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const bg = await page.locator('[data-lvgl-id="colored_box"]').evaluate(
      el => el.style.backgroundColor
    );
    // parseColor(0xFF0000) → '#FF0000' → browser normalises to rgb(255,0,0)
    expect(bg).toMatch(/rgb\(255,\s*0,\s*0\)/i);
  });

  test('radius applies border-radius to widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      widgets:
        - obj:
            id: rounded_box
            width: 80
            height: 80
            align: CENTER
            radius: 10
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const radius = await page.locator('[data-lvgl-id="rounded_box"]').evaluate(
      el => el.style.borderRadius
    );
    expect(radius).toBe('10px');
  });

  test('radius: 100+ applies border-radius: 50% (circle)', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      widgets:
        - obj:
            id: circle_box
            width: 80
            height: 80
            align: CENTER
            radius: 100
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const radius = await page.locator('[data-lvgl-id="circle_box"]').evaluate(
      el => el.style.borderRadius
    );
    expect(radius).toBe('50%');
  });

  test('min_width and max_width apply CSS min/maxWidth', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      widgets:
        - obj:
            id: sized_box
            min_width: 50
            max_width: 200
            height: 60
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const el = page.locator('[data-lvgl-id="sized_box"]');
    const minW = await el.evaluate(e => e.style.minWidth);
    const maxW = await el.evaluate(e => e.style.maxWidth);
    expect(minW).toBe('50px');
    expect(maxW).toBe('200px');
  });

  test('shadow_width applies box-shadow to widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      widgets:
        - obj:
            id: shadowed_box
            width: 100
            height: 100
            align: CENTER
            shadow_width: 8
            shadow_color: 0x000000
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const shadow = await page.locator('[data-lvgl-id="shadowed_box"]').evaluate(
      el => el.style.boxShadow
    );
    expect(shadow).not.toBe('');
    expect(shadow).toContain('8px');
  });

  test('bar value sets indicator width as percentage of bar', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      widgets:
        - bar:
            id: progress_bar
            width: 200
            height: 20
            align: CENTER
            value: 50
            min_value: 0
            max_value: 100
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // The bar indicator element should have approximately 50% width
    const indicator = page.locator('[data-lvgl-id="progress_bar"] .lvgl-bar__indicator');
    await expect(indicator).toHaveCount(1);
    const width = await indicator.evaluate(el => el.style.width);
    expect(width).toBe('50%');
  });

});

// ─── Navigation edge cases ───────────────────────────────────────────────────

test.describe('Navigation edge cases', () => {

  test('swipe on page with no handler does not navigate', async ({ page }) => {
    // A page with no on_swipe_right handler — swiping right stays on same page
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: only_page
      widgets:
        - label:
            id: solo_label
            text: "Only page"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const before = await page.locator('#page-selector-index').textContent();

    await page.click('#swipe-right');
    await page.waitForTimeout(300);
    await page.click('#swipe-left');
    await page.waitForTimeout(300);

    const after = await page.locator('#page-selector-index').textContent();
    expect(after, 'swipe without handler should not change page').toBe(before);
  });

  test('clicking page list row on current page does not break display', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    // Click first row (already current)
    await page.locator('#page-list .page-list-row').first().click();
    await page.waitForTimeout(200);

    // Display should still show content (clicking current page shouldn't blank it)
    const childCount = await page.locator('#lvglDisplay').evaluate(el => el.children.length);
    expect(childCount).toBeGreaterThan(0);
    expect(await page.locator('#page-selector-index').textContent()).toBe('1/2');
  });

  test('rapid swipe clicks do not leave page stuck mid-animation', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TWO_PAGE_YAML);

    // Click swipe-left multiple times in rapid succession
    await page.click('#swipe-left');
    await page.click('#swipe-left');
    await page.click('#swipe-left');
    await page.waitForTimeout(600);

    // Display should not be blank after rapid clicks
    const childCount = await page.locator('#lvglDisplay').evaluate(el => el.children.length);
    expect(childCount, 'display should not go blank after rapid swipes').toBeGreaterThan(0);
  });

});
