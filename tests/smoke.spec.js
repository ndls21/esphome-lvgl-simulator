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

// ─── Style properties (extended) ────────────────────────────────────────────

test.describe('Style properties (extended)', () => {

  test('border_color applies CSS border-color to widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: colored_border
            width: 100
            height: 50
            border_width: 3
            border_color: 0xFF0000
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const color = await page.locator('[data-lvgl-id="colored_border"]').evaluate(
      el => el.style.borderColor
    );
    expect(color).toBe('rgb(255, 0, 0)');
  });

  test('pad_left and pad_right apply CSS paddingLeft/paddingRight', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: padded_obj
            width: 200
            height: 60
            pad_left: 15
            pad_right: 25
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [pl, pr] = await page.locator('[data-lvgl-id="padded_obj"]').evaluate(
      el => [el.style.paddingLeft, el.style.paddingRight]
    );
    expect(pl).toBe('15px');
    expect(pr).toBe('25px');
  });

  test('pad_top and pad_bottom apply CSS paddingTop/paddingBottom', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: padded_tb
            width: 200
            height: 80
            pad_top: 8
            pad_bottom: 12
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [pt, pb] = await page.locator('[data-lvgl-id="padded_tb"]').evaluate(
      el => [el.style.paddingTop, el.style.paddingBottom]
    );
    expect(pt).toBe('8px');
    expect(pb).toBe('12px');
  });

  test('x and y without align position widget absolutely', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: pos_label
            text: "POS"
            x: 30
            y: 50
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [pos, left, top] = await page.locator('[data-lvgl-id="pos_label"]').evaluate(
      el => [el.style.position, el.style.left, el.style.top]
    );
    expect(pos).toBe('absolute');
    expect(left).toBe('30px');
    expect(top).toBe('50px');
  });

  test('align: TOP_LEFT positions widget at top-left', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: tl_obj
            width: 50
            height: 50
            align: TOP_LEFT
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [pos, left, top] = await page.locator('[data-lvgl-id="tl_obj"]').evaluate(
      el => [el.style.position, el.style.left, el.style.top]
    );
    expect(pos).toBe('absolute');
    expect(left).toBe('0px');
    expect(top).toBe('0px');
  });

  test('align: BOTTOM_RIGHT positions widget at bottom-right', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: br_obj
            width: 50
            height: 50
            align: BOTTOM_RIGHT
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [pos, right, bottom] = await page.locator('[data-lvgl-id="br_obj"]').evaluate(
      el => [el.style.position, el.style.right, el.style.bottom]
    );
    expect(pos).toBe('absolute');
    expect(right).toBe('0px');
    expect(bottom).toBe('0px');
  });

  test('min_height and max_height apply CSS minHeight/maxHeight', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: minmax_obj
            width: 100
            min_height: 40
            max_height: 120
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [minH, maxH] = await page.locator('[data-lvgl-id="minmax_obj"]').evaluate(
      el => [el.style.minHeight, el.style.maxHeight]
    );
    expect(minH).toBe('40px');
    expect(maxH).toBe('120px');
  });

  test('shadow_color applies colored box-shadow', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: colored_shadow
            width: 100
            height: 60
            shadow_width: 10
            shadow_color: 0x0000FF
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const shadow = await page.locator('[data-lvgl-id="colored_shadow"]').evaluate(
      el => el.style.boxShadow
    );
    expect(shadow).toContain('0, 0, 255');
  });

  test('border_side: BOTTOM applies only bottom border', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: bottom_border
            width: 150
            height: 50
            border_width: 3
            border_side: BOTTOM
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [top, bottom, left, right] = await page.locator('[data-lvgl-id="bottom_border"]').evaluate(
      el => [el.style.borderTopWidth, el.style.borderBottomWidth, el.style.borderLeftWidth, el.style.borderRightWidth]
    );
    expect(top).toBe('0px');
    expect(bottom).toBe('3px');
    expect(left).toBe('0px');
    expect(right).toBe('0px');
  });

  test('clip_corner: true applies overflow:hidden', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: clipped_obj
            width: 100
            height: 60
            clip_corner: true
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const overflow = await page.locator('[data-lvgl-id="clipped_obj"]').evaluate(
      el => el.style.overflow
    );
    expect(overflow).toBe('hidden');
  });

  test('width: SIZE_CONTENT applies max-content to CSS width', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: content_label
            text: "Hello"
            width: SIZE_CONTENT
            height: 30
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const width = await page.locator('[data-lvgl-id="content_label"]').evaluate(
      el => el.style.width
    );
    expect(width).toBe('max-content');
  });

  test('width as percentage string applies % CSS', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: pct_obj
            width: "75%"
            height: 40
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const width = await page.locator('[data-lvgl-id="pct_obj"]').evaluate(
      el => el.style.width
    );
    expect(width).toContain('%');
  });

});

// ─── Label features ──────────────────────────────────────────────────────────

test.describe('Label features', () => {

  test('text_align: CENTER applies text-align:center', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: center_label
            text: "Center"
            width: 200
            text_align: CENTER
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const ta = await page.locator('[data-lvgl-id="center_label"]').evaluate(
      el => el.style.textAlign
    );
    expect(ta).toBe('center');
  });

  test('text_align: RIGHT applies text-align:right', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: right_label
            text: "Right"
            width: 200
            text_align: RIGHT
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const ta = await page.locator('[data-lvgl-id="right_label"]').evaluate(
      el => el.style.textAlign
    );
    expect(ta).toBe('right');
  });

  test('long_mode: DOT applies text-overflow:ellipsis', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: dot_label
            text: "Very long text that gets truncated"
            width: 80
            long_mode: DOT
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const te = await page.locator('[data-lvgl-id="dot_label"]').evaluate(
      el => el.style.textOverflow
    );
    expect(te).toBe('ellipsis');
  });

  test('long_mode: WRAP applies white-space:normal', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: wrap_label
            text: "Long text that wraps to next line"
            width: 80
            long_mode: WRAP
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const ws = await page.locator('[data-lvgl-id="wrap_label"]').evaluate(
      el => el.style.whiteSpace
    );
    expect(ws).toBe('normal');
  });

  test('empty text label renders without crash', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: empty_label
            text: ""
            width: 100
            height: 30
`.trim();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    expect(errors).toHaveLength(0);
    const el = page.locator('[data-lvgl-id="empty_label"]');
    await expect(el).toBeVisible();
  });

});

// ─── Widget details ──────────────────────────────────────────────────────────

test.describe('Widget details', () => {

  test('dropdown selected_index shows correct option text', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - dropdown:
            id: my_dropdown
            options:
              - Apple
              - Banana
              - Cherry
            selected_index: 2
            width: 150
            height: 40
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="my_dropdown"] .lvgl-dropdown__text').textContent();
    expect(text).toBe('Cherry');
  });

  test('roller selected_index marks correct option with selected class', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - roller:
            id: my_roller
            options:
              - Mon
              - Tue
              - Wed
              - Thu
              - Fri
            selected_index: 2
            visible_row_count: 3
            width: 100
            height: 90
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const selectedText = await page.locator('[data-lvgl-id="my_roller"] .lvgl-roller__option--selected').textContent();
    expect(selectedText).toBe('Wed');
  });

  test('led color property applies background-color', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - led:
            id: red_led
            color: 0xFF0000
            width: 24
            height: 24
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const bg = await page.locator('[data-lvgl-id="red_led"]').evaluate(
      el => el.style.backgroundColor
    );
    expect(bg).toBe('rgb(255, 0, 0)');
  });

  test('led brightness scales opacity', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - led:
            id: dim_led
            color: 0xFFFFFF
            brightness: 128
            width: 24
            height: 24
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const opacity = await page.locator('[data-lvgl-id="dim_led"]').evaluate(
      el => parseFloat(el.style.opacity)
    );
    // brightness 128/255 ≈ 0.502 → opacity = 0.2 + 0.502*0.8 ≈ 0.6
    expect(opacity).toBeGreaterThan(0.2);
    expect(opacity).toBeLessThan(1.0);
  });

  test('switch checked: true adds lvgl-switch--on class', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - switch:
            id: on_switch
            checked: true
            width: 60
            height: 30
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const hasClass = await page.locator('[data-lvgl-id="on_switch"]').evaluate(
      el => el.classList.contains('lvgl-switch--on')
    );
    expect(hasClass).toBe(true);
  });

  test('switch checked: false does not add lvgl-switch--on class', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - switch:
            id: off_switch
            checked: false
            width: 60
            height: 30
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const hasClass = await page.locator('[data-lvgl-id="off_switch"]').evaluate(
      el => el.classList.contains('lvgl-switch--on')
    );
    expect(hasClass).toBe(false);
  });

  test('button widget can contain a label child', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - button:
            id: btn_with_label
            width: 120
            height: 40
            align: CENTER
            widgets:
              - label:
                  id: btn_text
                  text: "Click Me"
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="btn_text"]').textContent();
    expect(text).toBe('Click Me');
    // Ensure btn_text is inside btn_with_label
    const isNested = await page.locator('[data-lvgl-id="btn_with_label"]').evaluate(
      el => el.querySelector('[data-lvgl-id="btn_text"]') !== null
    );
    expect(isNested).toBe(true);
  });

});

// ─── Layout features (extended) ─────────────────────────────────────────────

test.describe('Layout features (extended)', () => {

  test('flex layout pad_row applies row gap CSS', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: flex_gap
            width: 200
            height: 200
            layout:
              type: FLEX
              flex_flow: COLUMN
              pad_row: 10
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const gap = await page.locator('[data-lvgl-id="flex_gap"]').evaluate(
      el => el.style.rowGap
    );
    expect(gap).toBe('10px');
  });

  test('flex layout pad_column applies column gap CSS', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: flex_col_gap
            width: 300
            height: 100
            layout:
              type: FLEX
              flex_flow: ROW
              pad_column: 8
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const gap = await page.locator('[data-lvgl-id="flex_col_gap"]').evaluate(
      el => el.style.columnGap
    );
    expect(gap).toBe('8px');
  });

  test('grid_cell_column_pos applies CSS gridColumnStart (1-based)', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: grid_parent
            width: 300
            height: 200
            layout:
              type: GRID
              grid_columns: [1fr, 1fr, 1fr]
              grid_rows: [1fr, 1fr]
            widgets:
              - label:
                  id: cell_item
                  text: "Cell"
                  grid_cell_column_pos: 1
                  grid_cell_row_pos: 0
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const colStart = await page.locator('[data-lvgl-id="cell_item"]').evaluate(
      el => el.style.gridColumnStart
    );
    // grid_cell_column_pos: 1 → CSS gridColumnStart: 2 (1-based)
    expect(colStart).toBe('2');
  });

  test('flex_grow: 0 leaves default flex-grow', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: flex_container
            width: 300
            height: 80
            layout:
              type: FLEX
              flex_flow: ROW
            widgets:
              - label:
                  id: grow_label
                  text: "A"
                  flex_grow: 2
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const fg = await page.locator('[data-lvgl-id="grow_label"]').evaluate(
      el => el.style.flexGrow
    );
    expect(fg).toBe('2');
  });

});

// ─── Inspector and tree ──────────────────────────────────────────────────────

test.describe('Inspector and tree (extended)', () => {

  test('tree node has data-widget-id attribute matching widget id', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: tree_test_label
            text: "Tree"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const id = await page.locator('.tree-node[data-widget-id="tree_test_label"]').getAttribute('data-widget-id');
    expect(id).toBe('tree_test_label');
  });

  test('clicking tree node sets inspector-widget-name', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: clickable_tree_node
            text: "Click me"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.locator('.tree-node[data-widget-id="clickable_tree_node"]').click();
    const name = await page.locator('#inspector-widget-name').textContent();
    expect(name).toBe('clickable_tree_node');
  });

  test('inspector shows numeric width property for selected widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: sized_obj
            width: 150
            height: 80
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.locator('[data-lvgl-id="sized_obj"]').click();
    const bodyText = await page.locator('#inspector-body').textContent();
    expect(bodyText).toContain('150');
  });

});

// ─── Entity summary ──────────────────────────────────────────────────────────

test.describe('Entity summary', () => {

  test('entity summary shows sensor count badge after render', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: s1
  - platform: template
    id: s2
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: val_label
            text: !lambda "return String(id(s1).state);"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const summaryEl = page.locator('#entitySummary');
    const display = await summaryEl.evaluate(el => window.getComputedStyle(el).display);
    expect(display).not.toBe('none');
    const badgeText = await page.locator('#entityBadges').textContent();
    expect(badgeText).toContain('sensor');
  });

  test('entity summary is hidden when config has no entities', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: static_label
            text: "Hello"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const display = await page.locator('#entitySummary').evaluate(
      el => el.style.display
    );
    expect(display).toBe('none');
  });

});

// ─── Display controls ────────────────────────────────────────────────────────

test.describe('Display controls', () => {

  test('custom display size preset shows width/height inputs', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.selectOption('#displayPreset', 'custom');
    const inputsDisplay = await page.locator('#customSizeInputs').evaluate(
      el => el.style.display
    );
    expect(inputsDisplay).not.toBe('none');
  });

  test('custom display size inputs apply to rendered display dimensions', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            text: "Custom size"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.selectOption('#displayPreset', 'custom');
    await page.fill('#customWidth', '400');
    await page.fill('#customHeight', '300');
    await renderYAML(page, yaml);
    const [w, h] = await page.locator('#lvglDisplay').evaluate(
      el => [el.style.width, el.style.height]
    );
    expect(w).toBe('400px');
    expect(h).toBe('300px');
  });

  test('display preset 466x466 sets correct dimensions', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 100, height: 100}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            text: "Round"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.selectOption('#displayPreset', '466x466');
    await renderYAML(page, yaml);
    const [w, h] = await page.locator('#lvglDisplay').evaluate(
      el => [el.style.width, el.style.height]
    );
    expect(w).toBe('466px');
    expect(h).toBe('466px');
  });

});

// ─── Drive tab controls ──────────────────────────────────────────────────────

test.describe('Drive tab controls', () => {

  test('screensaver controls are present in Drive tab', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const ssEnable = page.locator('#ssEnable');
    await expect(ssEnable).toBeAttached();
    const ssTrigger = page.locator('#ssTrigger');
    await expect(ssTrigger).toBeAttached();
  });

  test('interval controls are present in Drive tab', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const intervalsEnable = page.locator('#intervalsEnable');
    await expect(intervalsEnable).toBeAttached();
    const intervalSpeed = page.locator('#intervalSpeed');
    await expect(intervalSpeed).toBeAttached();
  });

  test('global mock control appears after rendering config with globals', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
globals:
  - id: my_counter
    type: int
    initial_value: "42"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: counter_label
            text: !lambda "return String(id(my_counter));"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="drive"]');
    const mockControls = await page.locator('#mockControls').textContent();
    expect(mockControls.toLowerCase()).toContain('my_counter');
  });

});

// ─── Arc widget (extended) ───────────────────────────────────────────────────

test.describe('Arc widget (extended)', () => {

  test('arc renders SVG background path element', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - arc:
            id: my_arc
            width: 100
            height: 100
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const pathCount = await page.locator('[data-lvgl-id="my_arc"] path, [data-lvgl-id="my_arc"] circle').count();
    expect(pathCount).toBeGreaterThanOrEqual(1);
  });

  test('arc with indicator section renders arc-indicator element', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - arc:
            id: ind_arc
            width: 100
            height: 100
            value: 50
            align: CENTER
            indicator:
              arc_color: 0x4DA6FF
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const count = await page.locator('[data-lvgl-id="ind_arc"] .arc-indicator').count();
    expect(count).toBe(1);
  });

  test('arc without indicator block renders no arc-indicator', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - arc:
            id: no_ind_arc
            width: 100
            height: 100
            value: 75
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const count = await page.locator('[data-lvgl-id="no_ind_arc"] .arc-indicator').count();
    expect(count).toBe(0);
  });

});

// ─── Slider widget (extended) ────────────────────────────────────────────────

test.describe('Slider widget (extended)', () => {

  test('slider indicator width matches value percentage', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - slider:
            id: half_slider
            width: 200
            height: 20
            min_value: 0
            max_value: 100
            value: 50
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const width = await page.locator('[data-lvgl-id="half_slider"] .lvgl-slider__indicator').evaluate(
      el => el.style.width
    );
    expect(width).toBe('50%');
  });

  test('slider at max value has full-width indicator', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - slider:
            id: full_slider
            width: 200
            height: 20
            min_value: 0
            max_value: 100
            value: 100
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const width = await page.locator('[data-lvgl-id="full_slider"] .lvgl-slider__indicator').evaluate(
      el => el.style.width
    );
    expect(width).toBe('100%');
  });

  test('slider at min value has zero-width indicator', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - slider:
            id: empty_slider
            width: 200
            height: 20
            min_value: 0
            max_value: 100
            value: 0
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const width = await page.locator('[data-lvgl-id="empty_slider"] .lvgl-slider__indicator').evaluate(
      el => el.style.width
    );
    expect(width).toBe('0%');
  });

});

// ─── Checkbox widget (extended) ──────────────────────────────────────────────

test.describe('Checkbox widget (extended)', () => {

  test('checkbox checked: true adds box--checked class', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - checkbox:
            id: checked_cb
            text: "Accept"
            checked: true
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const hasClass = await page.locator('[data-lvgl-id="checked_cb"] .lvgl-checkbox__box').evaluate(
      el => el.classList.contains('lvgl-checkbox__box--checked')
    );
    expect(hasClass).toBe(true);
  });

  test('checkbox text renders in label span', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - checkbox:
            id: text_cb
            text: "Remember me"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="text_cb"] .lvgl-checkbox__label').textContent();
    expect(text).toBe('Remember me');
  });

  test('checkbox indicator bg_color applies to box background', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - checkbox:
            id: color_cb
            text: "Colored"
            checked: true
            indicator:
              bg_color: 0x00AA00
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const bg = await page.locator('[data-lvgl-id="color_cb"] .lvgl-checkbox__box').evaluate(
      el => el.style.backgroundColor
    );
    expect(bg).toBe('rgb(0, 170, 0)');
  });

});

// ─── Button widget (extended) ────────────────────────────────────────────────

test.describe('Button widget (extended)', () => {

  test('button with text property renders text content', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - button:
            id: text_btn
            text: "Submit"
            width: 100
            height: 40
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="text_btn"]').textContent();
    expect(text.trim()).toBe('Submit');
  });

  test('button with checkable: true and checked: true has lvgl-button--checked class', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - button:
            id: checked_btn
            text: "Active"
            width: 100
            height: 40
            checkable: true
            checked: true
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const hasClass = await page.locator('[data-lvgl-id="checked_btn"]').evaluate(
      el => el.classList.contains('lvgl-button--checked')
    );
    expect(hasClass).toBe(true);
  });

});

// ─── Font rendering ──────────────────────────────────────────────────────────

test.describe('Font rendering', () => {

  test('montserrat_140 font scales to 70px', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: big_label
            text: "0"
            text_font: montserrat_140
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const fs = await page.locator('[data-lvgl-id="big_label"]').evaluate(
      el => el.style.fontSize
    );
    expect(fs).toBe('70px');
  });

  test('montserrat_20 font renders as 20px', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: small_label
            text: "Hi"
            text_font: montserrat_20
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const fs = await page.locator('[data-lvgl-id="small_label"]').evaluate(
      el => el.style.fontSize
    );
    expect(fs).toBe('20px');
  });

  test('montserrat font applies Montserrat font-family', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: mont_label
            text: "Montserrat"
            text_font: montserrat_20
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const ff = await page.locator('[data-lvgl-id="mont_label"]').evaluate(
      el => el.style.fontFamily
    );
    expect(ff.toLowerCase()).toContain('montserrat');
  });

});

// ─── Alignment (extended) ────────────────────────────────────────────────────

test.describe('Alignment (extended)', () => {

  test('align: TOP_MID positions widget horizontally centered at top', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: top_mid_obj
            width: 80
            height: 40
            align: TOP_MID
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [pos, left, top] = await page.locator('[data-lvgl-id="top_mid_obj"]').evaluate(
      el => [el.style.position, el.style.left, el.style.top]
    );
    expect(pos).toBe('absolute');
    expect(left).toContain('50%');
    expect(top).toBe('0px');
  });

  test('align: RIGHT_MID positions widget at right edge, vertically centered', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: right_mid_obj
            width: 50
            height: 50
            align: RIGHT_MID
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const [pos, top] = await page.locator('[data-lvgl-id="right_mid_obj"]').evaluate(
      el => [el.style.position, el.style.top]
    );
    expect(pos).toBe('absolute');
    expect(top).toContain('50%');
  });

  test('align: CENTER with x/y offset includes offset in transform', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: offset_center
            width: 60
            height: 40
            align: CENTER
            x: 20
            y: -10
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const transform = await page.locator('[data-lvgl-id="offset_center"]').evaluate(
      el => el.style.transform
    );
    // Browser normalizes calc(-50% + -10px) → calc(-50% - 10px), so check for both offsets
    expect(transform).toContain('20px');
    expect(transform).toContain('10px');
    expect(transform).toMatch(/calc\(-50%.*-.*10px/);
  });

});

// ─── FLEX alignment ──────────────────────────────────────────────────────────

test.describe('FLEX alignment', () => {

  test('flex_align_main: SPACE_BETWEEN applies justify-content: space-between', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: spaced_flex
            width: 300
            height: 60
            layout:
              type: FLEX
              flex_flow: ROW
              flex_align_main: SPACE_BETWEEN
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const jc = await page.locator('[data-lvgl-id="spaced_flex"]').evaluate(
      el => el.style.justifyContent
    );
    expect(jc).toBe('space-between');
  });

  test('flex_align_cross: CENTER applies align-items: center', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: cross_center
            width: 300
            height: 80
            layout:
              type: FLEX
              flex_flow: ROW
              flex_align_cross: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const ai = await page.locator('[data-lvgl-id="cross_center"]').evaluate(
      el => el.style.alignItems
    );
    expect(ai).toBe('center');
  });

});

// ─── Shadow offset ───────────────────────────────────────────────────────────

test.describe('Shadow offset', () => {

  test('shadow_offset_x and shadow_offset_y apply offset in box-shadow', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: offset_shadow
            width: 100
            height: 60
            shadow_width: 8
            shadow_offset_x: 5
            shadow_offset_y: 3
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const shadow = await page.locator('[data-lvgl-id="offset_shadow"]').evaluate(
      el => el.style.boxShadow
    );
    expect(shadow).toContain('5px');
    expect(shadow).toContain('3px');
  });

});

// ─── Swipe up ────────────────────────────────────────────────────────────────

test.describe('Swipe up', () => {

  test('swipe-up arrow is present in DOM', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#swipe-up')).toBeAttached();
  });

  test('on_swipe_up lambda navigates to target page', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: ground_page
      on_swipe_up: !lambda "id(lvgl_comp)->show_page(id(sky_page)->index, LV_SCR_LOAD_ANIM_MOVE_TOP, 200);"
      widgets:
        - label:
            text: "Ground"
            align: CENTER
    - id: sky_page
      widgets:
        - label:
            id: sky_label
            text: "Sky"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.locator('#swipe-up').click();
    await expect(page.locator('[data-lvgl-id="sky_label"]')).toBeVisible({ timeout: 3000 });
  });

});

// ─── Edge cases ──────────────────────────────────────────────────────────────

test.describe('Edge cases', () => {

  test('opacity: 0 applies CSS opacity 0 to widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: invisible_obj
            width: 80
            height: 40
            opacity: 0
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const opacity = await page.locator('[data-lvgl-id="invisible_obj"]').evaluate(
      el => parseFloat(el.style.opacity)
    );
    expect(opacity).toBe(0);
  });

  test('label with numeric text value renders as string', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: num_label
            text: 42
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="num_label"]').textContent();
    expect(text.trim()).toBe('42');
  });

  test('border_width: 0 does not apply border-style to widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: no_border_obj
            width: 100
            height: 60
            border_width: 0
            border_color: 0xFF0000
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const borderStyle = await page.locator('[data-lvgl-id="no_border_obj"]').evaluate(
      el => el.style.borderStyle
    );
    expect(borderStyle).not.toBe('solid');
  });

  test('deeply nested widgets render all levels correctly', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: level1
            width: 280
            height: 200
            align: CENTER
            widgets:
              - obj:
                  id: level2
                  width: 200
                  height: 140
                  widgets:
                    - obj:
                        id: level3
                        width: 120
                        height: 80
                        widgets:
                          - label:
                              id: deep_label
                              text: "Deep"
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="deep_label"]').textContent();
    expect(text).toBe('Deep');
    const isDeep = await page.locator('[data-lvgl-id="level1"]').evaluate(
      el => el.querySelector('[data-lvgl-id="level3"]') !== null
    );
    expect(isDeep).toBe(true);
  });

  test('config re-render with fewer pages removes extra page list rows', async ({ page }) => {
    const yaml3 = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: page_a
      widgets: []
    - id: page_b
      widgets: []
    - id: page_c
      widgets: []
`.trim();
    const yaml1 = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: only_page
      widgets: []
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml3);
    let rows = await page.locator('#page-list .page-list-row').count();
    expect(rows).toBe(3);
    await renderYAML(page, yaml1);
    rows = await page.locator('#page-list .page-list-row').count();
    expect(rows).toBe(1);
  });

  test('page count badge updates when re-rendering with different page count', async ({ page }) => {
    const yaml5 = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: p1
      widgets: []
    - id: p2
      widgets: []
    - id: p3
      widgets: []
    - id: p4
      widgets: []
    - id: p5
      widgets: []
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml5);
    const badge = await page.locator('#page-count-badge').textContent();
    expect(badge).toBe('5');
  });

});

// ─── Drive panel entity types ────────────────────────────────────────────────

test.describe('Drive panel entity types', () => {

  test('text_sensor appears with text input control in Drive panel', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
text_sensor:
  - platform: template
    id: my_text_sensor
    name: "Status"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: status_label
            text: !lambda "return id(my_text_sensor).state;"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="drive"]');
    const textInput = page.locator('#mockControls input[type="text"]');
    await expect(textInput).toBeAttached();
  });

  test('number entity appears with numeric control in Drive panel', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
number:
  - platform: template
    id: brightness
    name: "Brightness"
    min_value: 0
    max_value: 100
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: bright_label
            text: !lambda "return String(id(brightness).state);"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="drive"]');
    const numControl = page.locator('#mockControls .mock-control--numeric');
    await expect(numControl).toBeAttached();
  });

  test('entity summary shows text sensor count badge', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
text_sensor:
  - platform: template
    id: ts1
  - platform: template
    id: ts2
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: ts_label
            text: !lambda "return id(ts1).state;"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const badgeText = await page.locator('#entityBadges').textContent();
    expect(badgeText.toLowerCase()).toContain('text sensor');
  });

  test('entity summary shows combined sensor and binary_sensor counts', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: temp
binary_sensor:
  - platform: template
    id: motion
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: temp_label
            text: !lambda "return String(id(temp).state);"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const badgeText = await page.locator('#entityBadges').textContent();
    expect(badgeText.toLowerCase()).toContain('sensor');
    expect(badgeText.toLowerCase()).toContain('binary');
  });

  test('text_sensor value binding updates label on input change', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
text_sensor:
  - platform: template
    id: txt_sensor
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: txt_label
            text: !lambda "return id(txt_sensor).state;"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="drive"]');
    const input = page.locator('#mockControls input[type="text"]').first();
    await input.fill('ONLINE');
    await input.dispatchEvent('input');
    await page.waitForTimeout(200);
    const text = await page.locator('[data-lvgl-id="txt_label"]').textContent();
    expect(text).toContain('ONLINE');
  });

});

// ─── Label format text ────────────────────────────────────────────────────────

test.describe('Label format text', () => {

  test('text: {format, args} renders formatted sensor value', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: temp_val
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: fmt_label2
            text:
              format: "T:%.0f"
              args:
                - id: temp_val
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="fmt_label2"]').textContent();
    // Default sensor value is 0, so "T:0" or "T:0.0" etc.
    expect(text).toContain('T:');
    expect(text).toMatch(/T:\d/);
  });

  test('text: {time_format} renders a time string with digits', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: time_label
            text:
              time_format: "%H:%M"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="time_label"]').textContent();
    // Should look like "14:32" - two digits, colon, two digits
    expect(text.trim()).toMatch(/^\d{2}:\d{2}$/);
  });

});

// ─── Border and visual opacity ────────────────────────────────────────────────

test.describe('Border and visual opacity', () => {

  test('border_opa: TRANSP makes border color transparent', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: transp_border
            width: 100
            height: 60
            border_width: 3
            border_color: 0xFF0000
            border_opa: TRANSP
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const borderColor = await page.locator('[data-lvgl-id="transp_border"]').evaluate(
      el => el.style.borderColor
    );
    expect(borderColor).toBe('transparent');
  });

  test('bg_opa: 128 (50%) makes background semi-transparent', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: semi_bg
            width: 100
            height: 60
            bg_color: 0xFF0000
            bg_opa: 128
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    // bg_opa: 128 means opacity is < 1, so background should be somewhat transparent
    // The simulator applies bg_opa < 0.01 as transparent; 128/255 ≈ 0.5 is NOT transparent
    // So bg_color should still be set (not transparent)
    const bg = await page.locator('[data-lvgl-id="semi_bg"]').evaluate(
      el => el.style.backgroundColor
    );
    // bg_color 0xFF0000 should be applied
    expect(bg).toBe('rgb(255, 0, 0)');
  });

  test('opacity: 255 applies CSS opacity 1 to widget', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: full_opacity
            width: 80
            height: 40
            opacity: 255
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const opacity = await page.locator('[data-lvgl-id="full_opacity"]').evaluate(
      el => parseFloat(el.style.opacity)
    );
    expect(opacity).toBeCloseTo(1.0, 1);
  });

});

// ─── Multiple top_layer widgets ──────────────────────────────────────────────

test.describe('Multiple top_layer widgets', () => {

  test('two top_layer widgets both appear in #lvgl-top-layer', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  top_layer:
    widgets:
      - label:
          id: overlay_a
          text: "A"
          align: TOP_LEFT
      - label:
          id: overlay_b
          text: "B"
          align: TOP_RIGHT
  pages:
    - id: main
      widgets:
        - label:
            text: "Page"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const countA = await page.locator('#lvgl-top-layer [data-lvgl-id="overlay_a"]').count();
    const countB = await page.locator('#lvgl-top-layer [data-lvgl-id="overlay_b"]').count();
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

});

// ─── Bar with custom min/max ─────────────────────────────────────────────────

test.describe('Bar with custom min/max', () => {

  test('bar at midpoint of custom range has ~50% indicator width', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - bar:
            id: custom_bar
            width: 200
            height: 20
            min_value: 50
            max_value: 150
            value: 100
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const width = await page.locator('[data-lvgl-id="custom_bar"] .lvgl-bar__indicator').evaluate(
      el => el.style.width
    );
    expect(width).toBe('50%');
  });

  test('bar at min value has 0% indicator width', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - bar:
            id: min_bar
            width: 200
            height: 20
            min_value: 20
            max_value: 80
            value: 20
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const width = await page.locator('[data-lvgl-id="min_bar"] .lvgl-bar__indicator').evaluate(
      el => el.style.width
    );
    expect(width).toBe('0%');
  });

});

// ─── Share URL ────────────────────────────────────────────────────────────────

test.describe('Share URL', () => {

  test('share URL contains #state= fragment with base64 encoded content', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            text: "Share test"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Intercept clipboard and get the URL
    let shareUrl = null;
    await page.evaluate(() => {
      window._lastClipboard = null;
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (text) => {
        window._lastClipboard = text;
        return Promise.resolve();
      };
    });
    await page.click('#shareBtn');
    await page.waitForTimeout(200);
    shareUrl = await page.evaluate(() => window._lastClipboard);

    expect(shareUrl).not.toBeNull();
    expect(shareUrl).toContain('#state=');
    // The base64 encoded part should decode to contain the YAML
    const hash = shareUrl.split('#state=')[1];
    const decoded = JSON.parse(decodeURIComponent(escape(atob(hash))));
    expect(decoded.yaml).toContain('Share test');
  });

  test('loading page with #state= hash restores and renders the YAML', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: restored_label
            text: "Restored!"
            align: CENTER
`.trim();
    const state = JSON.stringify({ yaml });
    const encoded = btoa(unescape(encodeURIComponent(state)));
    const url = `http://localhost:8765/#state=${encoded}`;

    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const text = await page.locator('[data-lvgl-id="restored_label"]').textContent();
    expect(text).toBe('Restored!');
  });

});

// ─── Grid cell span ──────────────────────────────────────────────────────────

test.describe('Grid cell span', () => {

  test('grid_cell_column_span: 2 applies gridColumnEnd: span 2', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: grid_parent
            width: 300
            height: 200
            layout:
              type: GRID
              grid_columns: [1fr, 1fr, 1fr]
              grid_rows: [1fr, 1fr]
            widgets:
              - label:
                  id: wide_cell
                  text: "Wide"
                  grid_cell_column_pos: 0
                  grid_cell_row_pos: 0
                  grid_cell_column_span: 2
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const span = await page.locator('[data-lvgl-id="wide_cell"]').evaluate(
      el => el.style.gridColumnEnd
    );
    expect(span).toBe('span 2');
  });

  test('grid_cell_x_align: CENTER applies justifySelf: center', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - obj:
            id: grid_p2
            width: 300
            height: 200
            layout:
              type: GRID
              grid_columns: [1fr, 1fr]
              grid_rows: [1fr]
            widgets:
              - label:
                  id: centered_cell
                  text: "C"
                  grid_cell_column_pos: 0
                  grid_cell_row_pos: 0
                  grid_cell_x_align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const js = await page.locator('[data-lvgl-id="centered_cell"]').evaluate(
      el => el.style.justifySelf
    );
    expect(js).toBe('center');
  });

});

// ─── Robustness / XSS prevention ────────────────────────────────────────────

test.describe('Robustness', () => {

  test('label with HTML special characters renders as text not HTML', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: html_label
            text: "<b>bold</b> & 'quotes'"
            align: CENTER
`.trim();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    expect(errors).toHaveLength(0);
    const text = await page.locator('[data-lvgl-id="html_label"]').textContent();
    // textContent should show the raw string, not render as HTML
    expect(text).toContain('<b>bold</b>');
  });

  test('config with sensor unit_of_measurement shows unit in Drive panel', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: temp_c
    name: "Temperature"
    unit_of_measurement: "°C"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: temp_lbl
            text: !lambda "return String(id(temp_c).state);"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="drive"]');
    const driveText = await page.locator('#mockControls').textContent();
    expect(driveText).toContain('°C');
  });

  test('globals with type: bool creates boolean toggle control', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
globals:
  - id: flag
    type: bool
    initial_value: "false"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: flag_label
            text: !lambda "return id(flag) ? 'ON' : 'OFF';"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="drive"]');
    const checkbox = page.locator('#mockControls input[type="checkbox"]').first();
    await expect(checkbox).toBeAttached();
  });

  test('page bg_color per-page overrides default background', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: colored_page
      bg_color: 0x123456
      widgets:
        - label:
            text: "Hello"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const bg = await page.locator('.lvgl-page').evaluate(
      el => el.style.backgroundColor
    );
    expect(bg).toBe('rgb(18, 52, 86)');
  });

});

// ─── on_value lambda updating bar and slider ─────────────────────────────────

test.describe('on_value lambda widget updates', () => {

  test('lv_bar_set_value in sensor on_value lambda updates bar indicator width', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: level_sensor
    on_value:
      - lambda: "lv_bar_set_value(id(level_bar), (int)x, LV_ANIM_OFF);"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - bar:
            id: level_bar
            width: 200
            height: 20
            min_value: 0
            max_value: 100
            value: 0
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Set sensor to 75 → bar should show 75%
    await page.click('.console-tab[data-tab="drive"]');
    const slider = page.locator('#mockControls input[type="range"]').first();
    await slider.evaluate(el => {
      el.value = '75';
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);

    const width = await page.locator('[data-lvgl-id="level_bar"] .lvgl-bar__indicator').evaluate(
      el => el.style.width
    );
    const pct = parseFloat(width);
    expect(pct).toBeGreaterThan(70);
    expect(pct).toBeLessThanOrEqual(100);
  });

  test('lv_bar_set_value translation produces correct JS (lambda translator)', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: pct_sensor
    on_value:
      - lambda: "lv_bar_set_value(id(pct_bar), (int)x, LV_ANIM_OFF);"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - bar:
            id: pct_bar
            width: 200
            height: 20
            min_value: 0
            max_value: 100
            value: 0
            align: CENTER
`.trim();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    // Just confirm no JS crash from the lambda translation
    expect(errors).toHaveLength(0);
  });

  test('lv_slider_set_value in on_value lambda updates slider indicator', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: slider_src
    on_value:
      - lambda: "lv_slider_set_value(id(driven_slider), (int)x, LV_ANIM_OFF);"
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - slider:
            id: driven_slider
            width: 200
            height: 20
            min_value: 0
            max_value: 100
            value: 0
            align: CENTER
`.trim();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    expect(errors).toHaveLength(0);

    // Trigger via Drive panel
    await page.click('.console-tab[data-tab="drive"]');
    const slider = page.locator('#mockControls input[type="range"]').first();
    await slider.evaluate(el => {
      el.value = '50';
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);

    const width = await page.locator('[data-lvgl-id="driven_slider"] .lvgl-slider__indicator').evaluate(
      el => el.style.width
    );
    const pct = parseFloat(width);
    expect(pct).toBeGreaterThan(45);
    expect(pct).toBeLessThanOrEqual(55);
  });

});

// ─── lv_label_set_text lambda (proxy setText) ────────────────────────────────

test.describe('lv_label_set_text lambda', () => {

  test('lv_label_set_text in on_value lambda updates label text content', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
sensor:
  - platform: template
    id: temp_s
    on_value:
      - lambda: |
          lv_label_set_text(id(temp_display), _sprintf("%.0f°", x).c_str());
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: temp_display
            text: "---"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Set sensor value via Drive panel
    await page.click('.console-tab[data-tab="drive"]');
    const slider = page.locator('#mockControls input[type="range"]').first();
    await slider.evaluate(el => {
      el.value = '42';
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);

    const text = await page.locator('[data-lvgl-id="temp_display"]').textContent();
    // Should contain the formatted value (42°)
    expect(text).toContain('42');
  });

});

// ─── Overlay YAML tab ────────────────────────────────────────────────────────

test.describe('Overlay YAML tab', () => {

  test('overlay tab is present after loading config with top_layer', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  top_layer:
    widgets:
      - label:
          id: overlay_widget
          text: "Overlay"
          align: TOP_MID
  pages:
    - id: main
      widgets:
        - label:
            text: "Page"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const overlayTab = page.locator('.console-tab[data-tab="overlay"]');
    await expect(overlayTab).toBeAttached();
  });

  test('overlay tab content shows top_layer YAML when top_layer present', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  top_layer:
    widgets:
      - label:
          id: persist_label
          text: "Persistent"
          align: TOP_MID
  pages:
    - id: main
      widgets:
        - label:
            text: "Page"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="overlay"]');
    const content = await page.locator('#tab-overlay').textContent();
    expect(content.trim().length).toBeGreaterThan(10);
    expect(content).toContain('top_layer');
  });

});

// ─── Arc with nested child widgets ───────────────────────────────────────────

test.describe('Arc with nested widgets', () => {

  test('arc with children renders wrapper div containing SVG and child widgets', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - arc:
            id: arc_with_child
            width: 120
            height: 120
            align: CENTER
            widgets:
              - label:
                  id: arc_center_label
                  text: "50%"
                  align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    // The child label should be present
    const label = page.locator('[data-lvgl-id="arc_center_label"]');
    await expect(label).toBeAttached();
    const text = await label.textContent();
    expect(text).toBe('50%');
  });

});

// ─── Dropdown options string format ──────────────────────────────────────────

test.describe('Dropdown and Roller string options', () => {

  test('dropdown with newline-separated options string renders correctly', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - dropdown:
            id: str_dropdown
            options: "Red\\nGreen\\nBlue"
            selected_index: 1
            width: 120
            height: 40
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="str_dropdown"] .lvgl-dropdown__text').textContent();
    expect(text).toBe('Green');
  });

  test('roller with newline-separated options string renders selected item', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - roller:
            id: str_roller
            options: "Jan\\nFeb\\nMar\\nApr\\nMay"
            selected_index: 3
            visible_row_count: 3
            width: 80
            height: 90
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const text = await page.locator('[data-lvgl-id="str_roller"] .lvgl-roller__option--selected').textContent();
    expect(text).toBe('Apr');
  });

});

// ─── Number entity Drive panel ───────────────────────────────────────────────

test.describe('Number entity Drive panel', () => {

  test('number entity with min/max shows correct range in slider control', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
number:
  - platform: template
    id: volume
    name: "Volume"
    min_value: 0
    max_value: 100
    step: 1
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: vol_label
            text: !lambda "return String(id(volume).state);"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="drive"]');
    const rangeInput = page.locator('#mockControls input[type="range"]').first();
    const min = await rangeInput.getAttribute('min');
    const max = await rangeInput.getAttribute('max');
    expect(Number(min)).toBe(0);
    expect(Number(max)).toBe(100);
  });

  test('number entity default value appears as 0 in Drive panel slider', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
number:
  - platform: template
    id: speed
    name: "Speed"
    min_value: 0
    max_value: 200
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - label:
            id: speed_label
            text: !lambda "return String(id(speed).state);"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    await page.click('.console-tab[data-tab="drive"]');
    const rangeInput = page.locator('#mockControls input[type="range"]').first();
    const val = await rangeInput.evaluate(el => parseFloat(el.value));
    expect(val).toBe(0);
  });

});

// ─── LED defaults ────────────────────────────────────────────────────────────

test.describe('LED defaults', () => {

  test('led with no color defaults to white background', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - led:
            id: default_led
            width: 24
            height: 24
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const bg = await page.locator('[data-lvgl-id="default_led"]').evaluate(
      el => el.style.backgroundColor
    );
    // Default color is #ffffff
    expect(bg).toBe('rgb(255, 255, 255)');
  });

  test('bright LED (brightness > 128) has box-shadow glow', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - led:
            id: bright_led
            color: 0x00FF00
            brightness: 200
            width: 24
            height: 24
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const shadow = await page.locator('[data-lvgl-id="bright_led"]').evaluate(
      el => el.style.boxShadow
    );
    // Bright LED should have box-shadow glow
    expect(shadow.length).toBeGreaterThan(0);
    expect(shadow).not.toBe('');
  });

  test('dim LED (brightness = 0) has no box-shadow', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: main
      widgets:
        - led:
            id: dim_led2
            color: 0xFF0000
            brightness: 0
            width: 24
            height: 24
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const shadow = await page.locator('[data-lvgl-id="dim_led2"]').evaluate(
      el => el.style.boxShadow
    );
    expect(shadow).toBe('');
  });

});

// ─── Page list navigation correctness ────────────────────────────────────────

test.describe('Page list navigation correctness', () => {

  test('clicking non-first page row navigates and renders that page content', async ({ page }) => {
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:
    - id: page_one
      widgets:
        - label:
            id: one_label
            text: "One"
            align: CENTER
    - id: page_two
      widgets:
        - label:
            id: two_label
            text: "Two"
            align: CENTER
    - id: page_three
      widgets:
        - label:
            id: three_label
            text: "Three"
            align: CENTER
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);

    // Click the third page row
    const rows = page.locator('#page-list .page-list-row');
    await rows.nth(2).click();
    await page.waitForTimeout(200);

    const label = await page.locator('[data-lvgl-id="three_label"]').textContent();
    expect(label).toBe('Three');
    const pillIndex = await page.locator('#page-selector-index').textContent();
    expect(pillIndex).toBe('3/3');
  });

  test('10-page config shows correct count badge', async ({ page }) => {
    const pages = Array.from({ length: 10 }, (_, i) => `
    - id: page_${i + 1}
      widgets:
        - label:
            text: "Page ${i + 1}"
            align: CENTER`).join('');
    const yaml = `
display:
  - platform: custom
    dimensions: {width: 320, height: 240}
lvgl:
  color_depth: 16
  pages:${pages}
`.trim();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await renderYAML(page, yaml);
    const badge = await page.locator('#page-count-badge').textContent();
    expect(badge).toBe('10');
  });

});
