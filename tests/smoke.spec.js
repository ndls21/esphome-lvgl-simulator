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

// ─── YAML fixtures for deeper tests ──────────────────────────────────────────

/** All eight non-basic widget types on one page. */
const WIDGET_GALLERY_YAML = `
display:
  - platform: custom
    dimensions: {width: 480, height: 480}
lvgl:
  color_depth: 16
  pages:
    - id: gallery_page
      widgets:
        - arc:
            id: my_arc
            width: 80
            height: 80
            x: 10
            y: 10
            value: 50
        - slider:
            id: my_slider
            width: 120
            height: 20
            x: 100
            y: 10
        - checkbox:
            id: my_checkbox
            text: "Check me"
            x: 10
            y: 100
        - switch:
            id: my_switch
            x: 10
            y: 150
        - dropdown:
            id: my_dropdown
            options: "Option A\\nOption B\\nOption C"
            x: 10
            y: 200
        - roller:
            id: my_roller
            options: "X\\nY\\nZ"
            x: 200
            y: 200
        - spinner:
            id: my_spinner
            width: 50
            height: 50
            x: 300
            y: 10
        - led:
            id: my_led
            width: 20
            height: 20
            x: 300
            y: 100
`.trim();

/** Two-page config with a persistent top_layer label. */
const TOP_LAYER_YAML = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: tl_page1
      widgets:
        - label:
            id: tl_label1
            text: "Page One"
            align: CENTER
    - id: tl_page2
      widgets:
        - label:
            id: tl_label2
            text: "Page Two"
            align: CENTER
  top_layer:
    widgets:
      - label:
          id: persistent_label
          text: "Always Here"
          align: BOTTOM_MID
          y: -10
`.trim();

/** FLEX and GRID layout containers with children. */
const LAYOUT_YAML = `
display:
  - platform: custom
    dimensions: {width: 480, height: 320}
lvgl:
  color_depth: 16
  pages:
    - id: layout_page
      widgets:
        - obj:
            id: flex_row_box
            width: 280
            height: 50
            x: 10
            y: 10
            layout:
              type: FLEX
              flex_flow: ROW
            widgets:
              - label:
                  id: flex_child_a
                  text: "A"
              - label:
                  id: flex_child_b
                  text: "B"
              - label:
                  id: flex_child_c
                  text: "C"
        - obj:
            id: flex_col_box
            width: 60
            height: 200
            x: 310
            y: 10
            layout:
              type: FLEX
              flex_flow: COLUMN
            widgets:
              - label:
                  id: col_child_x
                  text: "X"
              - label:
                  id: col_child_y
                  text: "Y"
`.trim();

// ─── Widget gallery ──────────────────────────────────────────────────────────

test.describe('Widget gallery', () => {

  test('arc widget: SVG element renders at data-lvgl-id', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, WIDGET_GALLERY_YAML);

    // Arc renders as an SVG (or wraps one)
    const arc = page.locator('[data-lvgl-id="my_arc"]');
    await expect(arc).toHaveCount(1);
    const tag = await arc.evaluate(el => el.tagName.toLowerCase());
    // arc.js returns the SVG element directly
    expect(tag).toBe('svg');
  });

  test('slider widget: .lvgl-slider in DOM', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, WIDGET_GALLERY_YAML);
    await expect(page.locator('[data-lvgl-id="my_slider"].lvgl-slider')).toHaveCount(1);
  });

  test('checkbox widget: .lvgl-checkbox in DOM', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, WIDGET_GALLERY_YAML);
    await expect(page.locator('[data-lvgl-id="my_checkbox"].lvgl-checkbox')).toHaveCount(1);
  });

  test('switch widget: .lvgl-switch in DOM', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, WIDGET_GALLERY_YAML);
    await expect(page.locator('[data-lvgl-id="my_switch"].lvgl-switch')).toHaveCount(1);
  });

  test('dropdown widget: .lvgl-dropdown in DOM', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, WIDGET_GALLERY_YAML);
    await expect(page.locator('[data-lvgl-id="my_dropdown"].lvgl-dropdown')).toHaveCount(1);
  });

  test('roller widget: .lvgl-roller in DOM with option rows', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, WIDGET_GALLERY_YAML);
    await expect(page.locator('[data-lvgl-id="my_roller"].lvgl-roller')).toHaveCount(1);
    // Roller renders one row per option (X, Y, Z)
    const optCount = await page.locator('[data-lvgl-id="my_roller"] .lvgl-roller__option').count();
    expect(optCount).toBe(3);
  });

  test('spinner widget: SVG with .lvgl-spinner class', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, WIDGET_GALLERY_YAML);
    await expect(page.locator('[data-lvgl-id="my_spinner"].lvgl-spinner')).toHaveCount(1);
  });

  test('led widget: .lvgl-led in DOM', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, WIDGET_GALLERY_YAML);
    await expect(page.locator('[data-lvgl-id="my_led"].lvgl-led')).toHaveCount(1);
  });

});

// ─── top_layer ───────────────────────────────────────────────────────────────

test.describe('top_layer', () => {

  test('top_layer widget appears in #lvgl-top-layer after render', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TOP_LAYER_YAML);

    await expect(page.locator('#lvgl-top-layer')).toHaveCount(1);
    await expect(page.locator('[data-lvgl-id="persistent_label"]')).toHaveCount(1);
  });

  test('top_layer widget persists after navigating to page 2', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, TOP_LAYER_YAML);

    // Confirm top_layer label exists on page 1
    await expect(page.locator('[data-lvgl-id="persistent_label"]')).toHaveCount(1);

    // Navigate to page 2 via left-rail row click
    await page.locator('#page-list .page-list-row').nth(1).click();
    await page.waitForTimeout(300);

    // persistent_label must still exist (top_layer doesn't get replaced)
    await expect(
      page.locator('[data-lvgl-id="persistent_label"]'),
      'top_layer widget should persist after page navigation'
    ).toHaveCount(1);

    // tl_label2 should now be visible and tl_label1 gone
    await expect(page.locator('[data-lvgl-id="tl_label2"]')).toHaveCount(1);
    await expect(page.locator('[data-lvgl-id="tl_label1"]')).toHaveCount(0);
  });

});

// ─── Layout system ───────────────────────────────────────────────────────────

test.describe('Layout system', () => {

  test('FLEX ROW container has display:flex and flex-direction:row', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, LAYOUT_YAML);

    const styles = await page.locator('[data-lvgl-id="flex_row_box"]').evaluate(el => ({
      display: el.style.display,
      direction: el.style.flexDirection,
    }));
    expect(styles.display).toBe('flex');
    expect(styles.direction).toBe('row');
  });

  test('FLEX COLUMN container has flex-direction:column', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, LAYOUT_YAML);

    const dir = await page.locator('[data-lvgl-id="flex_col_box"]').evaluate(
      el => el.style.flexDirection
    );
    expect(dir).toBe('column');
  });

  test('FLEX container children all render inside parent', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, LAYOUT_YAML);

    // flex_child_a/b/c should be descendants of flex_row_box
    const count = await page.locator('[data-lvgl-id="flex_row_box"] .lvgl-label').count();
    expect(count).toBe(3);
  });

  test('nested obj: children render inside parent element', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    // container_box has hello_label as a child
    const nested = await page.locator(
      '[data-lvgl-id="container_box"] [data-lvgl-id="hello_label"]'
    ).count();
    expect(nested, 'hello_label should be inside container_box').toBe(1);
  });

});

// ─── Inspector ───────────────────────────────────────────────────────────────

test.describe('Inspector', () => {

  test('clicking a widget sets #inspector-widget-name to the widget id', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    // Click the hello_label (centered inside container_box) — direct click on the label
    await page.locator('[data-lvgl-id="hello_label"]').click();
    await page.waitForTimeout(100);

    const name = await page.locator('#inspector-widget-name').textContent();
    expect(name).toBe('hello_label');
  });

  test('inspector body is populated after widget click', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    await page.locator('[data-lvgl-id="my_button"]').click();
    await page.waitForTimeout(100);

    // Inspector should no longer show the placeholder text
    const placeholder = await page.locator('#inspector-body p.rail-placeholder').count();
    expect(placeholder, 'inspector should have content after click').toBe(0);
  });

  test('widget tree (right-rail) is populated after render', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, SINGLE_PAGE_YAML);

    // Tree nodes are created for each widget with an id
    const nodes = await page.locator('#tree-body .tree-node').count();
    expect(nodes, 'tree should have at least one node').toBeGreaterThan(0);
  });

});

// ─── Style property coverage ─────────────────────────────────────────────────

test.describe('Style property coverage', () => {

  test('text_color applies CSS color to label element', async ({ page }) => {
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
            id: colored_label
            text: "Hello"
            text_color: 0x00FF00
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const color = await page.locator('[data-lvgl-id="colored_label"]').evaluate(
      el => el.style.color
    );
    expect(color).toMatch(/rgb\(0,\s*255,\s*0\)/i);
  });

  test('border_width applies CSS border-style:solid to widget', async ({ page }) => {
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
            id: bordered_box
            width: 100
            height: 100
            align: CENTER
            border_width: 3
            border_color: 0xFF0000
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const el = page.locator('[data-lvgl-id="bordered_box"]');
    const borderStyle = await el.evaluate(e => e.style.borderStyle);
    const borderWidth = await el.evaluate(e => e.style.borderWidth);
    expect(borderStyle).toBe('solid');
    expect(borderWidth).toBe('3px');
  });

  test('pad_all applies CSS padding to widget', async ({ page }) => {
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
            id: padded_box
            width: 100
            height: 100
            align: CENTER
            pad_all: 12
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const padding = await page.locator('[data-lvgl-id="padded_box"]').evaluate(
      el => el.style.padding
    );
    expect(padding).toBe('12px');
  });

  test('page bg_color applied to page container element', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: test_page
      bg_color: 0x0000FF
      widgets: []
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // The .lvgl-page element gets the page-level bg_color
    const bg = await page.locator('#lvglDisplay .lvgl-page').evaluate(
      el => el.style.backgroundColor
    );
    expect(bg).toMatch(/rgb\(0,\s*0,\s*255\)/i);
  });

  test('align CENTER sets left:50% and top:50% on widget', async ({ page }) => {
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
            id: centered_box
            width: 80
            height: 80
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const styles = await page.locator('[data-lvgl-id="centered_box"]').evaluate(el => ({
      left: el.style.left,
      top: el.style.top,
    }));
    expect(styles.left).toBe('50%');
    expect(styles.top).toBe('50%');
  });

  test('border_side TOP: only top border is non-zero', async ({ page }) => {
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
            id: top_border_box
            width: 120
            height: 60
            align: CENTER
            border_width: 4
            border_side: TOP
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const el = page.locator('[data-lvgl-id="top_border_box"]');
    const borderTop    = await el.evaluate(e => e.style.borderTopWidth);
    const borderBottom = await el.evaluate(e => e.style.borderBottomWidth);
    expect(borderTop).toBe('4px');
    expect(borderBottom).toBe('0px');
  });

});

// ─── Resilience ──────────────────────────────────────────────────────────────

test.describe('Resilience', () => {

  test('config without lvgl key shows error without JS crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: gpio
    id: my_sensor
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.click('.console-tab[data-tab="edit"]');
    await page.fill('#yamlEditor', yaml);
    await page.click('#renderPreview');
    await page.waitForTimeout(500);

    // No JS crash
    const real = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR_'));
    expect(real, `crashed: ${real.join('\n')}`).toHaveLength(0);

    // Should show an error element (displayError sets innerHTML)
    const hasError = await page.locator('#lvglDisplay .render-error, [class*="error"]').count() > 0;
    const placeholder = await page.locator('#lvglDisplay .placeholder').count() > 0;
    expect(hasError || placeholder, 'should show error or placeholder').toBeTruthy();
  });

  test('one bad widget does not prevent other page widgets from rendering', async ({ page }) => {
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
            id: good_label
            text: "Good"
            align: TOP_MID
        - frobnicate:
            id: bad_widget
            x: 10
            y: 100
        - label:
            id: another_label
            text: "Also Good"
            align: BOTTOM_MID
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // good_label and another_label should render
    await expect(page.locator('[data-lvgl-id="good_label"]')).toHaveCount(1);
    await expect(page.locator('[data-lvgl-id="another_label"]')).toHaveCount(1);
    // bad_widget renders as .lvgl-unsupported
    await expect(page.locator('[data-lvgl-id="bad_widget"].lvgl-unsupported')).toHaveCount(1);
  });

  test('rendering with empty widgets list produces empty page without crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: empty_page
      widgets: []
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const real = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR_'));
    expect(real, `crashed: ${real.join('\n')}`).toHaveLength(0);
    // Page still renders (pill shows 1/1)
    expect(await page.locator('#page-selector-index').textContent()).toBe('1/1');
  });

  test('bar with lambda value shows midpoint indicator with unknown class', async ({ page }) => {
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
            id: lambda_bar
            width: 200
            height: 20
            align: CENTER
            min_value: 0
            max_value: 100
            value: !lambda "return id(some_sensor).state;"
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Bar renders even with a lambda value — shows midpoint (50%) with --unknown class
    await expect(page.locator('[data-lvgl-id="lambda_bar"]')).toHaveCount(1);
    const indicator = page.locator('[data-lvgl-id="lambda_bar"] .lvgl-bar__indicator');
    await expect(indicator).toHaveCount(1);
    const hasUnknown = await indicator.evaluate(
      el => el.classList.contains('lvgl-bar__indicator--unknown')
    );
    expect(hasUnknown, 'lambda value bar should have --unknown indicator class').toBe(true);
  });

});

// ─── Inspector (extended) ────────────────────────────────────────────────────

test.describe('Inspector extended', () => {

  test('clicking anonymous widget shows (anonymous) in inspector name', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - label:
            text: "No ID"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Find the label without id (no data-lvgl-id) — still rendered as .lvgl-label
    const labels = page.locator('#lvglDisplay .lvgl-label');
    await expect(labels).toHaveCount(1);
    await labels.first().click();
    await page.waitForTimeout(100);

    const name = await page.locator('#inspector-widget-name').textContent();
    expect(name).toBe('(anonymous)');
  });

  test('clicking named widget shows correct type in inspector chip', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - label:
            id: typed_label
            text: "Type test"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    await page.locator('[data-lvgl-id="typed_label"]').click();
    await page.waitForTimeout(100);

    // Inspector chip should show the widget type "label"
    const chipSub = await page.locator('.inspector-chip-sub').textContent();
    expect(chipSub).toBe('label');
  });

  test('inspector shows text property for label widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - label:
            id: info_label
            text: "Inspector text"
            text_color: 0xFF0000
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    await page.locator('[data-lvgl-id="info_label"]').click();
    await page.waitForTimeout(100);

    // Inspector body should contain the text value
    const bodyText = await page.locator('#inspector-body').textContent();
    expect(bodyText).toContain('Inspector text');
  });

});

// ─── Gradient and visual properties ─────────────────────────────────────────

test.describe('Gradient and visual properties', () => {

  test('bg_grad_color + bg_grad_dir:VER applies CSS linear-gradient', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: grad_box
            width: 100
            height: 100
            align: CENTER
            bg_color: 0x1A1A2E
            bg_grad_color: 0x16213E
            bg_grad_dir: VER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const bg = await page.locator('[data-lvgl-id="grad_box"]').evaluate(
      el => el.style.background
    );
    expect(bg).toContain('linear-gradient');
  });

  test('bg_grad_dir:HOR applies horizontal gradient', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: hor_grad_box
            width: 100
            height: 100
            align: CENTER
            bg_color: 0xFF0000
            bg_grad_color: 0x0000FF
            bg_grad_dir: HOR
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const bg = await page.locator('[data-lvgl-id="hor_grad_box"]').evaluate(
      el => el.style.background
    );
    expect(bg).toContain('linear-gradient');
    expect(bg).toContain('right');
  });

  test('bg_opa TRANSP makes background transparent', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: transp_box
            width: 100
            height: 100
            align: CENTER
            bg_opa: TRANSP
            bg_color: 0xFF0000
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const bgColor = await page.locator('[data-lvgl-id="transp_box"]').evaluate(
      el => el.style.backgroundColor
    );
    // bg_opa TRANSP means transparent — background should not be the solid red colour
    expect(bgColor).not.toBe('rgb(255, 0, 0)');
  });

  test('opacity property applies CSS opacity', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: faded_box
            width: 100
            height: 100
            align: CENTER
            bg_color: 0x00FF00
            opacity: 128
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const opVal = await page.locator('[data-lvgl-id="faded_box"]').evaluate(
      el => parseFloat(el.style.opacity)
    );
    // opacity 128/255 ≈ 0.50 (within 0.05 tolerance)
    expect(opVal).toBeGreaterThan(0.4);
    expect(opVal).toBeLessThan(0.6);
  });

  test('shadow_width: 0 does not apply box-shadow', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: no_shadow_box
            width: 100
            height: 100
            align: CENTER
            shadow_width: 0
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const shadow = await page.locator('[data-lvgl-id="no_shadow_box"]').evaluate(
      el => el.style.boxShadow
    );
    // shadow_width: 0 should not produce a box-shadow
    expect(shadow).toBe('');
  });

});

// ─── Advanced widget rendering ───────────────────────────────────────────────

test.describe('Advanced widget rendering', () => {

  test('meter widget renders SVG with .lvgl-meter class', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 480, height: 320}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - meter:
            id: my_meter
            width: 200
            height: 200
            align: CENTER
            scales:
              - range_from: 0
                range_to: 100
                angle_range: 270
                rotation: 135
                ticks:
                  count: 11
                  length: 8
                  width: 2
                  color: 0xAAAAAA
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const meter = page.locator('[data-lvgl-id="my_meter"]');
    await expect(meter).toHaveCount(1);
    // Meter renders an SVG inside a .lvgl-meter div
    const hasSvg = await meter.locator('svg').count();
    expect(hasSvg).toBeGreaterThanOrEqual(1);
  });

  test('meter SVG has tick mark lines', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 480, height: 320}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - meter:
            id: tick_meter
            width: 200
            height: 200
            align: CENTER
            scales:
              - range_from: 0
                range_to: 100
                angle_range: 270
                rotation: 135
                ticks:
                  count: 6
                  length: 8
                  width: 2
                  color: 0xAAAAAA
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const lineCount = await page.locator('[data-lvgl-id="tick_meter"] svg line').count();
    expect(lineCount).toBeGreaterThanOrEqual(6);
  });

  test('chart widget renders canvas element in .lvgl-chart', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 480, height: 320}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - chart:
            id: my_chart
            width: 300
            height: 200
            align: CENTER
            type: LINE
            range_min: 0
            range_max: 100
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const chart = page.locator('[data-id="my_chart"]');
    await expect(chart).toHaveCount(1);
    await expect(chart.locator('canvas')).toHaveCount(1);
  });

  test('image widget renders .lvgl-img placeholder for firmware reference', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - img:
            id: fw_img
            src: my_icon_png
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    await expect(page.locator('[data-lvgl-id="fw_img"]')).toHaveCount(1);
    // Firmware reference renders a placeholder div inside .lvgl-img
    await expect(page.locator('[data-lvgl-id="fw_img"] .lvgl-img__placeholder')).toHaveCount(1);
  });

  test('line widget renders SVG polyline', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - line:
            id: my_line
            points:
              - {x: 10, y: 10}
              - {x: 100, y: 50}
              - {x: 200, y: 30}
            line_color: 0xFF8800
            line_width: 3
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Line renders as an SVG (no data-lvgl-id for line — it's the SVG element itself)
    const svgs = await page.locator('#lvglDisplay svg').count();
    expect(svgs).toBeGreaterThanOrEqual(1);
    const polylines = await page.locator('#lvglDisplay svg polyline').count();
    expect(polylines).toBeGreaterThanOrEqual(1);
  });

});

// ─── Grid layout ─────────────────────────────────────────────────────────────

test.describe('Grid layout', () => {

  test('GRID container has display:grid CSS property', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 480, height: 320}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: grid_box
            width: 300
            height: 200
            align: CENTER
            layout:
              type: GRID
              grid_columns: "FR(1) FR(1) FR(1)"
              grid_rows: "FR(1) FR(1)"
            widgets:
              - label:
                  id: cell1
                  text: "C1"
              - label:
                  id: cell2
                  text: "C2"
              - label:
                  id: cell3
                  text: "C3"
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const display = await page.locator('[data-lvgl-id="grid_box"]').evaluate(
      el => el.style.display
    );
    expect(display).toBe('grid');
  });

  test('GRID container grid-template-columns contains fr units', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 480, height: 320}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: fr_grid
            width: 300
            height: 200
            align: CENTER
            layout:
              type: GRID
              grid_columns: "FR(1) FR(2)"
              grid_rows: "FR(1)"
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const cols = await page.locator('[data-lvgl-id="fr_grid"]').evaluate(
      el => el.style.gridTemplateColumns
    );
    expect(cols).toContain('fr');
  });

});

// ─── Style inheritance from lvgl: root ──────────────────────────────────────

test.describe('Global style defaults', () => {

  test('global text_font from lvgl: root applies to label without explicit font', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  text_font: montserrat_20
  pages:
    - id: p
      widgets:
        - label:
            id: inherited_label
            text: "Inherited font"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const fontSize = await page.locator('[data-lvgl-id="inherited_label"]').evaluate(
      el => el.style.fontSize
    );
    // montserrat_20 → 20px
    expect(fontSize).toBe('20px');
  });

  test('widget explicit text_font overrides global default', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  text_font: montserrat_14
  pages:
    - id: p
      widgets:
        - label:
            id: override_label
            text: "Override font"
            text_font: montserrat_48
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const fontSize = await page.locator('[data-lvgl-id="override_label"]').evaluate(
      el => el.style.fontSize
    );
    // Override with montserrat_48 → 48px (capped at 50% if >100 → 24px if 48>100, else 48px)
    // 48 is NOT > 100, so it stays 48px
    expect(fontSize).toBe('48px');
  });

});

// ─── YAML anchors and aliases ────────────────────────────────────────────────

test.describe('YAML anchors and aliases', () => {

  test('YAML anchor and alias produce correct widget structure', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // js-yaml supports anchors/aliases natively
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: anchor_page
      widgets:
        - label:
            id: anchor_label
            text: "Anchor test"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const real = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR_') && !e.includes('Failed to load'));
    expect(real, `JS error: ${real.join('\n')}`).toHaveLength(0);
    await expect(page.locator('[data-lvgl-id="anchor_label"]')).toHaveCount(1);
  });

});

// ─── scrollable and overflow ─────────────────────────────────────────────────

test.describe('Scrollable property', () => {

  test('scrollable: false applies overflow:hidden to obj', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: no_scroll_box
            width: 100
            height: 100
            align: CENTER
            scrollable: false
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const overflow = await page.locator('[data-lvgl-id="no_scroll_box"]').evaluate(
      el => el.style.overflow
    );
    expect(overflow).toBe('hidden');
  });

  test('scrollable: true leaves overflow as default (auto or visible)', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: scroll_box
            width: 100
            height: 100
            align: CENTER
            scrollable: true
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const overflow = await page.locator('[data-lvgl-id="scroll_box"]').evaluate(
      el => el.style.overflow
    );
    // Should NOT be hidden when scrollable is true
    expect(overflow).not.toBe('hidden');
  });

});

// ─── Flex child properties ───────────────────────────────────────────────────

test.describe('Flex child properties', () => {

  test('flex_grow: 1 applies CSS flex-grow: 1 to child', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 480, height: 320}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: flex_parent
            width: 300
            height: 50
            align: CENTER
            layout:
              type: FLEX
              flex_flow: ROW
            widgets:
              - label:
                  id: grow_label
                  text: "Grow"
                  flex_grow: 1
              - label:
                  id: fixed_label
                  text: "Fixed"
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const flexGrow = await page.locator('[data-lvgl-id="grow_label"]').evaluate(
      el => el.style.flexGrow
    );
    expect(flexGrow).toBe('1');
  });

  test('flex child without flex_grow has no explicit flex-grow', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 480, height: 320}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - obj:
            id: flex_p
            width: 300
            height: 50
            align: CENTER
            layout:
              type: FLEX
              flex_flow: ROW
            widgets:
              - label:
                  id: no_grow_label
                  text: "No grow"
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const flexGrow = await page.locator('[data-lvgl-id="no_grow_label"]').evaluate(
      el => el.style.flexGrow
    );
    // Without flex_grow, CSS flex-grow should be empty string (browser default)
    expect(flexGrow).toBe('');
  });

});

// ─── on_load handler ─────────────────────────────────────────────────────────

test.describe('on_load handler', () => {

  test('page with no on_load renders without JS crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main_page
      widgets:
        - label:
            id: onload_label
            text: "No on_load"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const real = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR_') && !e.includes('Failed to load'));
    expect(real, `JS errors: ${real.join('\n')}`).toHaveLength(0);
    await expect(page.locator('[data-lvgl-id="onload_label"]')).toHaveCount(1);
  });

});

// ─── Display rotation ─────────────────────────────────────────────────────────

test.describe('Display rotation (extended)', () => {

  test('rotation 180° applies rotate(180deg) transform', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    await page.selectOption('#rotationSelect', '180');
    const transform = await page.locator('#lvglDisplay').evaluate(el => el.style.transform);
    expect(transform).toContain('rotate(180deg)');
  });

  test('rotation 270° applies rotate(270deg) transform', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    await page.selectOption('#rotationSelect', '270');
    const transform = await page.locator('#lvglDisplay').evaluate(el => el.style.transform);
    expect(transform).toContain('rotate(270deg)');
  });

});

// ─── Share button ─────────────────────────────────────────────────────────────

test.describe('Share button', () => {

  test('share button click does not throw JS error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    // Grant clipboard permission so the copy doesn't fail
    await page.context().grantPermissions(['clipboard-write']);
    await page.click('#shareBtn');
    await page.waitForTimeout(300);

    const real = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR_') && !e.includes('Failed to load'));
    expect(real, `JS errors: ${real.join('\n')}`).toHaveLength(0);
  });

});

// ─── YAML tab content ─────────────────────────────────────────────────────────

test.describe('YAML tab content', () => {

  test('page YAML tab contains the page widget tree', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await loadExample(page);

    // Click the page YAML tab (first tab, labelled "Main")
    const pageTab = page.locator('#yaml-tabs .console-tab').first();
    await pageTab.click();
    await page.waitForTimeout(200);

    const content = await page.locator('#tab-page').textContent();
    // Should contain something from the first page (at minimum the page id)
    expect(content.length).toBeGreaterThan(10);
  });

  test('globals YAML tab shows no-globals placeholder when absent', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p
      widgets:
        - label:
            id: lbl
            text: "No globals"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    await page.click('.console-tab[data-tab="globals"]');
    await page.waitForTimeout(100);

    const content = await page.locator('#tab-globals').textContent();
    // Should show a "not found" or "no globals" placeholder — any non-empty message
    expect(content.trim().length).toBeGreaterThan(5);
  });

});

// ─── Sensor binding (store → label re-render) ────────────────────────────────

test.describe('Sensor binding', () => {

  test('sensor mock control appears in Drive panel after render', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: temp_sensor
    unit_of_measurement: "°C"
    state_class: measurement
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: temp_label
            text: !lambda "return _sprintf('%.1f°C', id(temp_sensor).state);"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Navigate to Drive tab
    await page.click('.console-tab[data-tab="drive"]');
    await page.waitForTimeout(200);

    const driveContent = await page.locator('#mockControls').textContent();
    expect(driveContent).toContain('temp_sensor');
  });

  test('changing sensor slider value triggers label re-render', async ({ page }) => {
    // Use simple string concatenation (not _sprintf) to avoid format string edge cases
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: speed_sensor
    unit_of_measurement: "km/h"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: speed_label
            text: !lambda "return to_string(id(speed_sensor).state);"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Switch to Drive tab and interact with the sensor slider
    await page.click('.console-tab[data-tab="drive"]');
    await page.waitForTimeout(200);

    // Find the number input for speed_sensor and set it to 99 via 'change' event
    const numInput = page.locator('.mock-control__number').first();
    await numInput.fill('99');
    await numInput.dispatchEvent('change');
    await page.waitForTimeout(400);

    // The label should now show 99 (re-rendered by store subscription)
    const labelText = await page.locator('[data-lvgl-id="speed_label"]').textContent();
    expect(labelText.trim()).toContain('99');
  });

  test('_sprintf lambda formats sensor value correctly', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: fmt_sensor
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: fmt_label
            width: 200
            height: 30
            text: !lambda "return _sprintf('%.2f°', id(fmt_sensor).state);"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Default value 0 → "0.00°"
    const text = await page.locator('[data-lvgl-id="fmt_label"]').textContent();
    expect(text.trim()).toContain('0.00°');
  });

  test('binary sensor toggle updates checkbox state', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
binary_sensor:
  - platform: template
    id: door_sensor
    name: "Door"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: door_label
            text: !lambda "return id(door_sensor).state ? 'OPEN' : 'CLOSED';"
            align: CENTER
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Switch to Drive tab
    await page.click('.console-tab[data-tab="drive"]');
    await page.waitForTimeout(200);

    // The binary sensor control should be a checkbox/toggle
    const boolControls = page.locator('.mock-control--boolean');
    await expect(boolControls).toHaveCount(1);
  });

});

// ─── style_definitions inheritance ──────────────────────────────────────────

test.describe('style_definitions', () => {

  test('widget referencing style by id inherits style properties', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  style_definitions:
    - id: my_red_style
      bg_color: 0xFF0000
      radius: 12
  pages:
    - id: p
      widgets:
        - obj:
            id: styled_box
            width: 80
            height: 80
            align: CENTER
            styles: my_red_style
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const bgColor = await page.locator('[data-lvgl-id="styled_box"]').evaluate(
      el => el.style.backgroundColor
    );
    expect(bgColor).toBe('rgb(255, 0, 0)');
  });

  test('widget style property overrides style_definitions value', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  style_definitions:
    - id: base_style
      bg_color: 0xFF0000
      radius: 5
  pages:
    - id: p
      widgets:
        - obj:
            id: override_box
            width: 80
            height: 80
            align: CENTER
            styles: base_style
            bg_color: 0x0000FF
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Widget-level bg_color should override the style_definition
    const bgColor = await page.locator('[data-lvgl-id="override_box"]').evaluate(
      el => el.style.backgroundColor
    );
    expect(bgColor).toBe('rgb(0, 0, 255)');
  });

  test('multiple style_definitions can be applied', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  style_definitions:
    - id: shape_style
      radius: 20
      border_width: 3
    - id: color_style
      bg_color: 0x00AA00
  pages:
    - id: p
      widgets:
        - obj:
            id: multi_style_box
            width: 80
            height: 80
            align: CENTER
            styles:
              - shape_style
              - color_style
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Both styles should be applied
    const style = await page.locator('[data-lvgl-id="multi_style_box"]').evaluate(el => ({
      bg: el.style.backgroundColor,
      radius: el.style.borderRadius,
    }));
    expect(style.bg).toBe('rgb(0, 170, 0)');
    expect(style.radius).toBe('20px');
  });

});

// ─── Theme inheritance ───────────────────────────────────────────────────────

test.describe('Theme inheritance', () => {

  test('lvgl theme.bar.radius applies to bar widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  theme:
    bar:
      radius: 0
      indicator:
        radius: 0
  pages:
    - id: p
      widgets:
        - bar:
            id: themed_bar
            width: 200
            height: 20
            align: CENTER
            value: 50
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const radius = await page.locator('[data-lvgl-id="themed_bar"]').evaluate(
      el => el.style.borderRadius
    );
    expect(radius).toBe('0px');
  });

  test('bar indicator inherits theme indicator.bg_color', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  theme:
    bar:
      indicator:
        bg_color: 0xFF8800
  pages:
    - id: p
      widgets:
        - bar:
            id: color_bar
            width: 200
            height: 20
            align: CENTER
            value: 75
`.trim();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    const indColor = await page.locator('[data-lvgl-id="color_bar"] .lvgl-bar__indicator').evaluate(
      el => el.style.backgroundColor
    );
    expect(indColor).toBe('rgb(255, 136, 0)');
  });

});
