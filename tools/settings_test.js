#!/usr/bin/env node
// Settings and the Markdown editor, in Chromium against dist/: the desktop set dark, an accent and a wallpaper, each
// reaching the windows of the programs already open; kept across a reload; the volume and Mute heard by a game's
// voices as it plays; Markdown files sent to the Markdown editor, written in — the toolbar wrapping what is selected —
// shown beside the text as it is typed, and saved.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.join(__dirname, '..', 'dist');
const shots = process.env.SHOTS || '';

const WATCH = `
  window.__ramps = [];
  const ramp = AudioParam.prototype.linearRampToValueAtTime;
  AudioParam.prototype.linearRampToValueAtTime = function (v, t) { window.__ramps.push(Math.round(v * 1000) / 1000); return ramp.call(this, v, t); };
`;

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (rel.split('/').includes('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.json') ? 'application/json' : 'text/html');
    res.end(fs.readFileSync(file));
  }).listen(0);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    const p = await context.newPage();
    await p.addInitScript(WATCH);
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const url = `http://localhost:${server.address().port}/`;
    await p.goto(url);
    await p.waitForSelector('.dicons');
    const ok = (what) => console.log('ok   ' + what);
    // The Welcome note opens in the Viewer the first time: a program's window, its page a shadow root.
    const viewer = p.locator('.win', { hasText: 'Welcome.md' });
    await viewer.locator('.md h1').first().waitFor({ timeout: 60000 });
    // What a colour token comes to inside the Viewer's page, and on the desktop's own window frame.
    const inViewer = (prop) => viewer.locator('.md').first().evaluate((el, prop) => getComputedStyle(el)[prop], prop);
    const frameBg = () => viewer.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(await inViewer('color'), 'rgb(18, 24, 38)', 'light to begin with, as the system is');
    assert.equal(await frameBg(), 'rgb(255, 255, 255)');

    await p.locator('.tblaunch').click();
    await p.locator('.lq').fill('dark mode');
    await p.keyboard.press('Enter');
    const settings = p.locator('.settings');
    await settings.waitFor();
    ok('found by "dark mode": Settings');

    await settings.locator('.seg', { hasText: 'Dark' }).click();
    await p.waitForFunction(() => document.querySelector('.desk').classList.contains('theme-dark'));
    assert.equal(await frameBg(), 'rgb(19, 22, 29)', 'the frame is dark');
    assert.equal(await inViewer('color'), 'rgb(231, 233, 240)', 'and so is the Viewer, a program, inside it');
    ok('Dark: the desktop and the windows of programs already open');

    await settings.locator('.swatch[title="Rose"]').click();
    await settings.locator('.wall', { hasText: 'Ocean' }).click();
    await p.waitForFunction(() => document.querySelector('.desk').className.includes('accent-rose wall-ocean'));
    const launch = await p.locator('.tblaunch').evaluate(el => getComputedStyle(el).backgroundImage);
    assert.match(launch, /rgb\(251, 113, 133\)/, 'the launcher button in the dark rose: ' + launch);
    assert.equal(await viewer.locator('.md a').first().evaluate(el => getComputedStyle(el).color), 'rgb(251, 113, 133)',
                 'a link in the Viewer in the accent');
    ok('Rose and Ocean, in the desktop and in the Viewer');
    if (shots) await p.screenshot({ path: path.join(shots, 'settings-1.png') });

    // Kept: the next time the desktop starts, it is as it was left.
    await p.waitForTimeout(400);
    await p.reload();
    await p.waitForSelector('.dicons');
    assert.match(await p.locator('.desk').getAttribute('class'), /theme-dark accent-rose wall-ocean/);
    await settings.waitFor();
    ok('kept across a reload, the Settings window with it');

    // The volume, heard by every program as it plays: Pip's title music, its seven layers looping.
    await settings.locator('.seg', { hasText: 'As the system' }).click();
    await p.locator('.tblaunch').click();
    await p.locator('.lq').fill('platformer');
    await p.keyboard.press('Enter');
    await p.locator('.pcard h1').waitFor({ timeout: 60000 });
    await p.waitForTimeout(1500);
    await p.evaluate('window.__ramps = []');
    await p.locator('.win', { has: p.locator('.settings') }).locator('.tbar').click();
    await settings.locator('.vrange').fill('50');
    // Half the slider is a quarter as loud; the title asks for 0.8 of its layers.
    await p.waitForFunction(() => window.__ramps.includes(0.2), null, { timeout: 5000 });
    await settings.locator('.seg', { hasText: 'Mute' }).click();
    await p.waitForFunction(() => window.__ramps.includes(0), null, { timeout: 5000 });
    await p.evaluate('window.__ramps = []');
    await settings.locator('.seg', { hasText: 'Muted' }).click();
    await p.waitForFunction(() => window.__ramps.includes(0.2), null, { timeout: 5000 });
    ok('the volume turns a game down as it plays, Mute silences it, and back');
    await p.locator('.win', { has: p.locator('.pip') }).locator('.wbtn.close').click();

    // What opens what: Markdown in the Markdown editor, from the desktop's icon.
    await settings.locator('.srow', { hasText: 'Markdown' }).locator('.seg', { hasText: 'Markdown editor' }).click();
    await p.waitForTimeout(300);
    await p.locator('.dicon', { hasText: 'Welcome.md' }).dblclick();
    const mded = p.locator('.mded');
    await mded.waitFor({ timeout: 60000 });
    const shown = mded.locator('.mdshown');
    assert.equal(await shown.locator('h1').first().textContent(), await viewer.locator('.md h1').first().textContent(),
                 'the same note, shown beside its text');
    ok('Welcome.md opens in the Markdown editor, shown beside its text');

    const src = mded.locator('textarea.mdsrc');
    await src.click();
    await p.waitForFunction((el) => el.getRootNode().activeElement === el, await src.elementHandle());
    await p.keyboard.press('Control+End');
    await p.keyboard.type('\n\n## Written here\n\nSome words');
    await shown.locator('h2', { hasText: 'Written here' }).waitFor({ timeout: 5000 }).catch(async (e) => {
      const focused = await p.evaluate(() => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a ? a.tagName + '.' + a.className : 'none'; });
      throw new Error(e.message + '\ntext ends: ' + JSON.stringify((await src.inputValue()).slice(-60)) + '\nfocus: ' + focused
        + '\nshown h2s: ' + JSON.stringify(await shown.locator('h2').allTextContents()));
    });
    ok('a heading typed shows as it is typed');
    // "words", selected with the keyboard, made bold from the toolbar.
    for (let i = 0; i < 5; i++) await p.keyboard.press('Shift+ArrowLeft');
    await p.keyboard.up('Shift');
    await mded.locator('.mdt[title^="Bold"]').click();
    await shown.locator('strong', { hasText: 'words' }).waitFor({ timeout: 5000 }).catch(async (e) => {
      throw new Error(e.message + '\ntext ends: ' + JSON.stringify((await src.inputValue()).slice(-40)));
    });
    assert.match(await src.inputValue(), /Some \*\*words\*\*$/);
    // Selected again once the program has heard the field change — a moment after, which typing at once would beat.
    await p.waitForFunction((el) => el.selectionEnd - el.selectionStart === 5, await src.elementHandle(), { timeout: 5000 });
    await p.keyboard.type('WORDS');
    assert.match(await src.inputValue(), /Some \*\*WORDS\*\*$/, 'what was wrapped is left selected, to type over');
    ok('Bold wraps the selection, and leaves it selected');
    assert.equal(await mded.locator('.estate').textContent(), 'Unsaved changes');
    await p.keyboard.press('Control+s');
    await p.locator('.toast', { hasText: 'Saved Welcome.md' }).waitFor({ timeout: 5000 });
    assert.equal(await mded.locator('.estate').textContent(), 'Saved');
    assert.match(await mded.locator('.mdcount').textContent(), /^\d+ words · \d+ min read$/);
    ok('Ctrl+S saves it: ' + await mded.locator('.mdcount').textContent());
    if (shots) await p.screenshot({ path: path.join(shots, 'settings-2.png') });

    await mded.locator('.seg', { hasText: 'Read' }).click();
    await src.waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(await shown.isVisible(), true);
    ok('Read shows only what it makes');

    assert.deepEqual(errors, [], 'no page errors');
    ok('no page errors');
    console.log('Settings behaved');
  } catch (e) {
    console.error('FAIL ' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
