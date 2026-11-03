#!/usr/bin/env node
// Full screen, in Chromium against dist/: a program is given it only just after a tap or key in its own window, and
// whatever it does — `samples/hostile.wac` covers everything, takes every pointer and key, asks every frame, and hangs —
// the desktop's handle, Escape or Back, and Home take the person out, and it cannot take the screen back on its own.
// Then Pip: full screen from its button and Shift+F, in a window and on a page of its own.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const repo = path.join(__dirname, '..');
const root = path.join(repo, 'dist');
const shots = process.env.SHOTS || '';

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (rel.split('/').includes('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.json') ? 'application/json'
      : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html');
    res.end(fs.readFileSync(file));
  }).listen(0);
  let browser;
  try {
    // The hostile program, built as a page's module to drop on the desktop.
    const built = path.join(repo, '.cache', 'hostile');
    execFileSync('wac', ['run', '--allow-read', '--allow-write', '--allow-run', 'build.wac', 'samples/hostile.wac', path.relative(repo, built)],
                 { cwd: repo, stdio: 'pipe' });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wac-full-'));
    fs.copyFileSync(path.join(built, 'page.wasm'), path.join(tmp, 'hostile.wasm'));

    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const ok = (what) => console.log('ok   ' + what);
    const url = `http://localhost:${server.address().port}/`;
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const isFull = () => p.evaluate(() => document.querySelector('.desk.full') !== null);
    const browserFull = () => p.evaluate(() => document.fullscreenElement?.classList.contains('desk') ?? false);
    const until = async (what, why, ms = 10000) => {
      for (let i = 0; i < ms / 50; i++) { if (await what()) return; await p.waitForTimeout(50); }
      assert.fail(why);
    };
    const said = () => p.locator('.win .program-body >> .said').textContent().catch(() => '');

    await p.goto(url);
    await p.waitForSelector('.dicons');
    await p.locator('.win.focus .md h1').first().waitFor({ timeout: 60000 });
    await p.locator('.win.focus .wbtn[title=Close]').click();
    const cdp = await p.context().newCDPSession(p);
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await cdp.send('Input.dispatchDragEvent', { type, x: 1100, y: 600, data: { items: [], files: [path.join(tmp, 'hostile.wasm')], dragOperationsMask: 1 } });
    }
    await p.waitForSelector('.dicon[title="hostile.wasm"]', { timeout: 10000 });
    await p.$eval('.dicon[title="hostile.wasm"]', (e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    await p.locator('.win.focus .tt', { hasText: 'Hostile' }).waitFor({ timeout: 15000 });
    await p.locator('.win.focus .program-body >> .said').waitFor({ timeout: 15000 });
    // It asked as it started, and asks every frame: not given, with no tap in its window.
    await p.waitForTimeout(1500);
    assert.equal(await isFull(), false, 'asked for with no tap in its window: not given');
    ok('a program asking for full screen on its own, every frame, is not given it');

    // A tap in its window: given — the whole screen, the browser's too — and the desktop's handle over it, which the
    // program's element fixed over everything does not cover.
    const win = await p.locator('.win.focus .wbody').boundingBox();
    await p.mouse.click(win.x + win.width / 2, win.y + win.height / 2);
    await until(isFull, 'a tap in its window, and it is given full screen');
    await until(browserFull, 'and the browser\'s full screen with it');
    const box = await p.locator('.win.fullwin').boundingBox();
    assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 1280, 800], 'the whole screen');
    const handle = await p.locator('.fullhandle').boundingBox();
    const top = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.fullhandle') !== null,
                                 [handle.x + handle.width / 2, handle.y + handle.height / 2]);
    assert.ok(top, 'the handle is on top of what the program drew');
    assert.match(await p.locator('.fullnote').textContent(), /Hostile is full screen\. Esc, or the handle at the top, leaves it\./);
    if (shots) await p.screenshot({ path: path.join(shots, 'full-1.png') });
    ok('a tap in its window: full screen, the browser\'s too, the handle on top, and how to leave said');

    // It has stopped answering: the desktop has not, and its handle opens the bar, which leaves.
    await p.locator('.fullhandle').click();
    await p.locator('.fullbar').waitFor({ timeout: 2000 });
    assert.deepEqual(await p.locator('.fullbar .fbbtn').allTextContents(), ['Leave full screen', 'Home', 'Close', '']);
    if (shots) await p.screenshot({ path: path.join(shots, 'full-2.png') });
    await p.locator('.fbleave').click();
    await until(async () => !(await isFull()) && !(await browserFull()), 'Leave full screen leaves it', 2000);
    ok('while the program is hung, the handle\'s bar leaves full screen');
    // Its asking every frame, once it answers again, does not bring it back.
    await until(async () => (await said()) === 'not full · 2', 'the program told it is no longer full screen, once it answers again');
    await p.waitForTimeout(1000);
    assert.equal(await isFull(), false, 'and its asking every frame does not take the screen back');
    ok('told, and its asking every frame since does not take it back');

    // The browser leaving full screen — Escape, Back — leaves the desktop's too.
    await p.mouse.click(win.x + win.width / 2, win.y + win.height / 2);
    await until(isFull, 'a tap again, and full screen again');
    await until(browserFull, 'the browser\'s too');
    await p.evaluate(() => document.exitFullscreen());
    await until(async () => !(await isFull()), 'the browser leaving it leaves the desktop\'s');
    // Answering again: a tap it hears only after the moment has passed is, rightly, not one that gives full screen.
    await until(async () => (await said()) === 'not full · 4', 'the program told, once it answers again');
    ok('the browser leaving full screen, by Escape or Back, leaves the desktop\'s');

    // Close, from the bar: the program ended.
    await p.mouse.click(win.x + win.width / 2, win.y + win.height / 2);
    await until(isFull, 'full screen once more');
    await p.locator('.fullhandle').click();
    await p.locator('.fbclose').click();
    await until(async () => !(await p.locator('.win .tt').allTextContents()).includes('Hostile'), 'Close closes it');
    assert.equal(await isFull(), false);
    ok('Close, from the bar, ends the program and full screen');

    // **On a phone**, Back leaves full screen for the home screen, and the phone's bar is hidden while it lasts.
    await p.setViewportSize({ width: 390, height: 700 });
    await p.waitForSelector('.desk.phone');
    await p.locator('.ptile', { hasText: 'hostile.wasm' }).click();
    await p.locator('.win.focus .tt', { hasText: 'Hostile' }).waitFor({ timeout: 15000 });
    await p.waitForTimeout(500);
    const pw = await p.locator('.win.focus .wbody').boundingBox();
    await p.mouse.click(pw.x + pw.width / 2, pw.y + pw.height / 2);
    await until(isFull, 'on a phone, a tap: full screen');
    assert.equal(await p.locator('.phonebar').isVisible(), false, 'the phone\'s bar hidden');
    assert.match(await p.locator('.fullnote').textContent(), /Back, or the handle at the top, leaves it\./);
    await p.goBack();
    await p.locator('.phome').waitFor();
    await until(async () => !(await isFull()) && !(await browserFull()), 'Back leaves full screen');
    assert.equal(await p.locator('.phonebar').isVisible(), true, 'and the phone\'s bar is back');
    ok('on a phone: the bar hidden, and Back goes home out of full screen');

    // **Pip**: full screen from the button on its title, and Shift+F out and in again; Back home.
    await p.locator('.ptile', { hasText: 'Pip and the Lost Lanterns' }).click();
    const pipBtn = p.locator('.win.focus .pscreenbtn');
    await pipBtn.waitFor({ timeout: 60000 });
    await pipBtn.click();
    await until(isFull, 'Pip\'s Full screen button: full screen');
    await p.locator('.win.focus .pip.screenfull').waitFor({ timeout: 5000 });
    assert.equal(await pipBtn.textContent(), ' Leave full screen');
    ok('Pip: its button gives it full screen, and it knows');
    await p.keyboard.press('Shift+F');
    await until(async () => !(await isFull()), 'Shift+F leaves it');
    await p.locator('.win.focus .pip:not(.screenfull)').waitFor({ timeout: 5000 });
    await p.keyboard.press('Shift+F');
    await until(isFull, 'and Shift+F, a key in its window, takes it again');
    if (shots) await p.screenshot({ path: path.join(shots, 'full-pip.png') });
    await p.goBack();
    await until(async () => !(await isFull()), 'Back leaves it');
    await p.locator('.phome').waitFor();
    ok('Pip: Shift+F out and in again, and Back home');

    // On a page of its own, the browser's full screen is Pip's.
    const q = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
    q.on('pageerror', (e) => errors.push(e.message));
    await q.goto(url + 'apps/pip/index.html');
    await q.locator('.pscreenbtn').waitFor({ timeout: 60000 });
    await q.locator('.pscreenbtn').click();
    await q.waitForFunction(() => document.fullscreenElement?.classList.contains('pip') && document.querySelector('.pip.screenfull') !== null,
                            null, { timeout: 10000 });
    await q.keyboard.press('Shift+F');
    await q.waitForFunction(() => document.fullscreenElement === null && document.querySelector('.pip.screenfull') === null, null, { timeout: 10000 });
    ok('Pip on a page of its own: the browser\'s full screen, and Shift+F out');

    assert.deepEqual(errors, [], 'no page errors');
    ok('no page errors');
    console.log('full screen behaved');
  } catch (e) {
    console.error('FAIL ' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
