import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

/**
 * Browser-level behavior of the parallel shell.
 *
 * Fixtures model only what the component actually consumes: the framework page
 * hook, the injected page actions, and a keyed content slot. Settings are absent
 * from this component by design, so this test asserts the shell does not rebuild
 * them rather than simulating a settings surface it no longer has.
 */
async function loadShell() {
  const result = await build({
    stdin: {
      contents: `
        import React, { useSyncExternalStore } from 'react';
        import { createRoot } from 'react-dom/client';
        import { installPageShell } from './src/page-shell.jsx';
        import { Context } from '@deepseek-ai/cordis';
        let Component, injected, dictionary;
        const ctx = new Context();
        ctx.locale = {
          resolveText: label => typeof label === 'string' ? label : label.en,
          register(ns, dict) { return ctx.effect(() => { dictionary = dict.en; return () => { dictionary = undefined; }; }); },
        };
        ctx.slots = {
          inject(name, fn) { return ctx.effect(() => fn()); },
          register(options, component) {
            return ctx.effect(() => { Component = component; injected = options.inject(); return () => { Component = undefined; }; });
          },
        };
        const dispose = installPageShell(ctx);
        const root = createRoot(document.getElementById('copy'));
        const useSource = source => selector => selector(useSyncExternalStore(source.subscribe, source.getSnapshot));
        const mount = () => root.render(<Component
          homePage={injected.homePage} managerPage={injected.managerPage} pageSlot={injected.pageSlot}
          usePages={useSource(injected.hooks.pages)}
          selectPage={injected.selectPage} setPageRegion={injected.setPageRegion} setPagePinned={injected.setPagePinned} setRailWidth={injected.setRailWidth}
          setPageOrder={injected.setPageOrder} promotePage={injected.promotePage}
          resolveLabel={injected.resolveLabel}
          renderSlot={(name, props, options) => { window.slotRequest = { name, props, options }; return <p>Page body: {options.entryKey}</p>; }}
          t={key => dictionary[key]}/>);
        window.mount = mount;
        window.unmount = () => root.render(null);
        window.disposeShell = () => dispose();
        window.addPage = spec => ctx.pages.registerPage(spec);
        window.addIconPage = () => ctx.pages.registerPage({ id: 'custom-icon', label: 'Custom icon', icon: () => <svg data-custom-icon="" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg> });
        window.pick = id => ctx.pages.selectPage(id);
        window.park = id => ctx.pages.setPageRegion(id, 'overflow');
        window.snapshot = () => ctx.pages.getSnapshot().pages.map(page => ({ id: page.id, region: page.region }));
        mount();`,
      resolveDir: process.cwd(), loader: 'jsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
  });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (!String(error).includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  }
  return { text: result.outputFiles[0].text, browser };
}

test('the rail navigates pages, opens the manager, and never rebuilds settings', async () => {
  const { text, browser } = await loadShell();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // The shell pads the mount container it is rendered into.
    await page.setContent('<div id="root"><div id="copy"></div></div>');
    await page.addScriptTag({ content: text });

    const nav = page.getByRole('navigation', { name: 'Pages' });
    await nav.waitFor();
    const home = nav.getByRole('button', { name: 'DSH workbench' });
    const manager = nav.getByRole('button', { name: 'Pages', exact: true });
    assert.equal(await home.getAttribute('aria-current'), 'page');
    // A settings entry would be a dead end: settings are the native panel's.
    assert.equal(await nav.getByRole('button', { name: 'Settings' }).count(), 0);
    assert.equal(await page.getByRole('checkbox').count(), 0, 'the shell renders no settings controls');

    assert.equal(await page.locator('#root').evaluate(node => getComputedStyle(node).paddingLeft), '64px');

    await page.evaluate(() => { window.addIconPage(); window.addPage({ id: 'recycled-probe', label: 'Recycled probe', region: 'overflow' }); });
    await manager.click();
    await page.getByRole('heading', { name: 'Page manager' }).waitFor();
    const width = page.getByRole('slider', { name: 'Navigation width' });
    await width.fill('48');
    assert.equal(await nav.evaluate(node => node.getBoundingClientRect().width), 48);
    assert.equal(await page.locator('#root').evaluate(node => getComputedStyle(node).paddingLeft), '48px');
    assert.equal(await page.locator('section[id]').evaluate(node => node.getBoundingClientRect().left), 48);
    for (const pixels of [40, 64, 96]) {
      await width.fill(String(pixels));
      assert.equal(await nav.evaluate(node => node.getBoundingClientRect().width), pixels);
      assert.equal(await nav.evaluate(node => node.scrollWidth <= node.clientWidth), true);
      const iconWidths = await nav.locator('[data-dsh-pages-rail-icon]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
      assert.ok(iconWidths.length >= 4, 'home, manager, custom icon and more all use rail scaling');
      for (const actual of iconWidths) assert.ok(Math.abs(actual - 23 * pixels / 64) < 0.01);
      const customWidth = await nav.locator('[data-custom-icon]').evaluate(node => node.getBoundingClientRect().width);
      assert.ok(Math.abs(customWidth - 24 * pixels / 64) < 0.01, 'fixed-size plugin icons scale too');
      const geometry = await nav.evaluate(rail => {
        const style = getComputedStyle(rail);
        const box = rail.getBoundingClientRect();
        const contentCenter = box.left + (box.width - parseFloat(style.borderRightWidth)) / 2;
        return {
          gap: parseFloat(style.rowGap), padding: parseFloat(style.paddingTop),
          buttons: [...rail.querySelectorAll('button')].map(button => {
            const b = button.getBoundingClientRect();
            const icon = button.querySelector('svg').getBoundingClientRect();
            return { width: b.width, height: b.height, railOffset: b.x + b.width / 2 - contentCenter,
              iconX: icon.x + icon.width / 2 - (b.x + b.width / 2),
              iconY: icon.y + icon.height / 2 - (b.y + b.height / 2) };
          }),
        };
      });
      assert.ok(Math.abs(geometry.gap - 8 * pixels / 64) < 0.01);
      assert.ok(Math.abs(geometry.padding - 16 * pixels / 64) < 0.01);
      for (const button of geometry.buttons) {
        assert.ok(Math.abs(button.width - 46 * pixels / 64) < 0.01);
        assert.ok(Math.abs(button.height - button.width) < 0.01, 'rail targets remain square');
        for (const offset of [button.railOffset, button.iconX, button.iconY]) assert.ok(Math.abs(offset) < 0.05, 'icons and buttons are centered');
      }
    }
    await page.getByRole('button', { name: 'Reset width' }).click();
    assert.equal(await nav.evaluate(node => node.getBoundingClientRect().width), 64);
    assert.equal(await manager.getAttribute('aria-current'), 'page');
    assert.equal(await home.getAttribute('aria-current'), null);
    assert.equal(await page.locator('#root').evaluate(node => getComputedStyle(node).paddingLeft), '64px');

    await page.getByRole('button', { name: 'Back to workbench' }).click();
    await page.getByRole('heading', { name: 'Page manager' }).waitFor({ state: 'detached' });
    assert.equal(await home.getAttribute('aria-current'), 'page');

    await page.evaluate(() => window.addPage({ id: 'notes', label: { en: 'Notes' }, glyph: 'N', order: 10 }));
    const notes = nav.getByRole('button', { name: 'Notes' });
    await notes.waitFor();
    await notes.click();
    await page.getByText('Page body: notes', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.slotRequest), { name: 'page.content', props: {}, options: { entryKey: 'notes' } });

    await page.keyboard.press('Escape');
    await page.getByText('Page body: notes', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await home.getAttribute('aria-current'), 'page');

    await page.evaluate(() => window.unmount());
    await nav.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#root').evaluate(node => getComputedStyle(node).paddingLeft), '0px',
      'rail spacing reverses when the shell unmounts');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('manager recycles pages and pinning appends a top-tail shortcut without changing membership', async () => {
  const { text, browser } = await loadShell();
  try {
    const view = await browser.newPage({ viewport: { width: 1200, height: 820 } });
    await view.setContent('<div id="root"><div id="copy"></div></div>');
    await view.addScriptTag({ content: text });
    const nav = view.getByRole('navigation', { name: 'Pages' });
    await nav.waitFor();
    // A page in the recycle group is registered and reachable, but not on the rail.
    await view.evaluate(() => window.addPage({ id: 'notes', label: { en: 'Notes' }, glyph: 'N', order: 10 }),);
    assert.equal(await nav.locator('[data-dsh-pages-more]').count(), 0);
    await nav.getByRole('button', { name: 'Pages', exact: true }).click();
    await view.getByRole('combobox', { name: 'Group Notes', exact: true }).selectOption('overflow');
    await view.getByRole('region', { name: 'Recycle group', exact: true }).getByRole('listitem', { name: 'Notes', exact: true }).waitFor();
    await view.getByRole('button', { name: 'Back to workbench' }).click();
    await nav.getByRole('button', { name: 'Notes' }).waitFor({ state: 'detached' });
    const more = nav.getByRole('button', { name: 'More pages' });
    await more.waitFor();
    await more.click();
    const panel = view.getByRole('menu', { name: 'More pages' });
    await panel.waitFor();
    const item = panel.getByRole('menuitem', { name: 'Notes' });
    await item.waitFor();
    await panel.getByRole('button', { name: 'Pin to top group Notes' }).click();
    await panel.getByRole('button', { name: 'Unpin Notes' }).waitFor();
    const pages = await view.evaluate(() => window.snapshot());
    assert.deepEqual(pages.map(page => page.id).sort(), ['home', 'notes', 'pages'], 'pinning registers no new page');
    assert.equal(pages.find(page => page.id === 'notes').region, 'overflow');
    assert.deepEqual(await nav.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['DSH workbench', 'More pages', 'Notes', 'Pages']);
    assert.equal(await item.count(), 1, 'the candidate remains in the menu');
    await panel.getByRole('button', { name: 'Unpin Notes' }).click();
    await nav.getByRole('button', { name: 'Notes' }).waitFor({ state: 'detached' });
    assert.equal(await more.count(), 1);
    await item.click();
    await view.getByText('Page body: notes', { exact: true }).waitFor();
  } finally {
    await browser.close();
  }
});

test('the manager can recycle itself and remains reachable through more', async () => {
  const { text, browser } = await loadShell();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
    await page.setContent('<div id="root"><div id="copy"></div></div>');
    await page.addScriptTag({ content: text });
    const nav = page.getByRole('navigation', { name: 'Pages' });
    await nav.waitFor();
    await page.evaluate(() => window.addPage({ id: 'notes', label: { en: 'Notes' }, glyph: 'N', order: 10 }));
    await nav.getByRole('button', { name: 'Pages' }).click();
    await page.getByRole('heading', { name: 'Page manager' }).waitFor();
    await page.getByRole('switch', { name: 'Hide Pages', exact: true }).click();
    await nav.getByRole('button', { name: 'Pages', exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Back to workbench' }).click();
    await nav.getByRole('button', { name: 'More pages' }).click();
    await page.getByRole('menuitem', { name: 'Pages', exact: true }).click();
    await page.getByRole('heading', { name: 'Page manager' }).waitFor();
    await page.getByRole('switch', { name: 'Hide Notes' }).click();
    await nav.getByRole('button', { name: 'Notes' }).waitFor({ state: 'detached' });
    await page.getByRole('switch', { name: 'Show Notes' }).click();
    await nav.getByRole('button', { name: 'Notes' }).waitFor();
    await page.evaluate(() => window.disposeShell());
    await nav.waitFor({ state: 'detached' });
  } finally {
    await browser.close();
  }
});
