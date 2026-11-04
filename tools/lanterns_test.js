#!/usr/bin/env node
// Lantern Light, in Chromium against dist/: found in the launcher and played with the keys — each of the first three
// levels won at par, the win card and the next level; Undo and Restart; a ghost catching Pip, and Undo out of it; the
// levels listed, the fewest moves kept across a reload. Then on a phone: a swipe moves Pip, and so do the buttons.
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { openLauncher } = require('./launcher.js');
const { deep, onCanvas } = require('./canvas.js');
const root = path.join(__dirname, '..', 'dist');
const shots = process.env.SHOTS || '';

// Each level's way at par, as `solve.wac` finds it (`wac run tools/lanterns_par.wac`).
const WAYS = ['RRRRRDLRRD', 'RRRRDDLRRDDRRR', 'RRDDDDLRRRRRRDR'];
const KEYS = { L: 'ArrowLeft', R: 'ArrowRight', U: 'ArrowUp', D: 'ArrowDown' };

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
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const ok = (what) => console.log('ok   ' + what);
    const url = `http://localhost:${server.address().port}/`;
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const win = p.locator('.win', { has: p.locator('.lanterns') });
    const hud = win.locator('.lhud');
    const moves = async () => Number((await hud.locator('.num').textContent()).match(/Moves (\d+)/)[1]);
    const until = async (what, why) => {
      for (let i = 0; i < 100; i++) { if (await what()) return; await p.waitForTimeout(50); }
      assert.fail(why);
    };
    const play = async (way) => {
      for (const c of way) {
        const was = await moves();
        await p.keyboard.press(KEYS[c]);
        // Each key answered before the next: a move counted, or — a lantern walked into — the same count and lit.
        await p.waitForTimeout(40);
        if (await win.locator('.lcard').count() > 0) return;
        if ((await moves()) === was) await p.waitForTimeout(60);
      }
    };

    await p.goto(url);
    await p.waitForSelector('.dicons');
    await p.locator('.win.focus .md h1').first().waitFor({ timeout: 60000 });
    await openLauncher(p);
    await p.locator('.lq').fill('puzzle');
    assert.ok((await p.locator('.litem .lt').allTextContents()).includes('Lantern Light'), 'found by "puzzle"');
    await p.locator('.lq').fill('lantern light');
    await p.keyboard.press('Enter');
    await hud.waitFor({ timeout: 60000 });
    assert.match(await hud.textContent(), /^1\. First Flame\s*Moves 0 · Par 10$/);
    assert.match(await win.locator('.lhint').textContent(), /Walk into the lantern/);
    // The board and a margin of Pip's screen, sixteen pixels a tile: a ten by five level is 172 by 92.
    for (let i = 0; i < 40 && JSON.stringify(await onCanvas(p, deep('.lscreen'), '(c) => [c.width, c.height]')) !== '[172,92]'; i++) await p.waitForTimeout(50);
    assert.deepEqual(await onCanvas(p, deep('.lscreen'), '(c) => [c.width, c.height]'), [172, 92], 'drawn at the board\'s size');
    ok('found by "puzzle", the first level and what it teaches');

    // Walls take no move; Undo takes one back; Restart is itself undone.
    await win.locator('.lanterns').focus();
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    await until(async () => (await moves()) === 2, 'two moves, the wall none');
    await p.keyboard.press('z');
    await until(async () => (await moves()) === 1, 'Undo takes one back');
    await p.keyboard.press('r');
    await until(async () => (await moves()) === 0, 'Restart: the start');
    await p.keyboard.press('z');
    await until(async () => (await moves()) === 1, 'and Restart undone');
    await p.keyboard.press('r');
    await until(async () => (await moves()) === 0, 'Restart again');
    ok('a wall takes no move; Undo, Restart, and Restart undone');

    for (let i = 0; i < WAYS.length; i++) {
      await play(WAYS[i]);
      await win.locator('.lcard h1', { hasText: 'The way is lit' }).waitFor({ timeout: 5000 });
      assert.match(await win.locator('.lcard').textContent(), /★ At par/);
      if (i === 0 && shots) await p.screenshot({ path: path.join(shots, 'lanterns-won.png') });
      await p.keyboard.press('Enter');
      await until(async () => (await hud.textContent()).startsWith(`${i + 2}. `), `level ${i + 2} next`);
    }
    ok('the first three levels won at par, each card saying so, Enter the next');

    // Level 4: straight at the ghost, in the dark — caught; Undo, and on.
    assert.match(await hud.textContent(), /^4\. Keep to the Light/);
    await play('RRR');
    await win.locator('.lcard h1', { hasText: 'A ghost caught Pip' }).waitFor({ timeout: 5000 });
    if (shots) await p.screenshot({ path: path.join(shots, 'lanterns-caught.png') });
    await p.keyboard.press('ArrowLeft');
    assert.equal(await moves(), 3, 'caught, nothing moves');
    await win.locator('.lcard .lbtn', { hasText: 'Undo' }).click();
    await until(async () => (await win.locator('.lcard').count()) === 0 && (await moves()) === 2, 'Undo out of it');
    ok('a ghost met in the dark catches Pip; Undo, and Pip is free');

    // The levels, and the fewest moves kept: across a reload, it starts where it was left.
    await p.keyboard.press('Escape');
    const list = win.locator('.llevel');
    await list.first().waitFor();
    assert.equal(await list.count(), 6);
    assert.deepEqual(await win.locator('.llevel.par .lname').allTextContents(), ['First Flame', 'Across the Water', 'Turn of the Light']);
    assert.equal(await win.locator('.llevel.locked').count(), 2, 'two not reached yet');
    await p.reload();
    await p.waitForSelector('.dicons');
    await win.locator('.lhud').waitFor({ timeout: 60000 });
    await until(async () => /^4\. Keep to the Light/.test(await hud.textContent()), 'reloaded, at the first level not yet won');
    ok('the levels listed, three at par and two locked; reloaded, it starts at the fourth');

    // **On a phone**: on a page of its own, a swipe on the board moves Pip, and so do the buttons for each way.
    const q = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
    q.on('pageerror', (e) => errors.push(e.message));
    await q.goto(url + 'apps/lanterns/index.html');
    await q.locator('.lhud').waitFor({ timeout: 60000 });
    await q.waitForTimeout(500);
    const qmoves = async () => Number((await q.locator('.lhud .num').textContent()).match(/Moves (\d+)/)[1]);
    const stage = await q.locator('.lstage').boundingBox();
    const cdp = await q.context().newCDPSession(q);
    const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + k * 14, y: cy + 2, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    for (let i = 0; i < 40 && (await qmoves()) !== 1; i++) await q.waitForTimeout(50);
    assert.equal(await qmoves(), 1, 'a swipe right: one move');
    assert.equal(await q.locator('.ldpad').isVisible(), true, 'the buttons for each way, on a touch screen');
    // A tap within about a fifth of a second of a swipe's end is the browser's to drop — Chromium's handling of the
    // touches, before the page hears of it — so a thumb's pause, as a person's would be.
    await q.waitForTimeout(300);
    await q.locator('.ldown').tap();
    for (let i = 0; i < 40 && (await qmoves()) !== 2; i++) await q.waitForTimeout(50);
    assert.equal(await qmoves(), 2, 'and the Down button');
    if (shots) await q.screenshot({ path: path.join(shots, 'lanterns-phone.png') });
    ok('on a phone: a swipe moves Pip, and so do the buttons');

    assert.deepEqual(errors, [], 'no page errors');
    ok('no page errors');
    console.log('Lantern Light behaved');
  } catch (e) {
    console.error('FAIL ' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
