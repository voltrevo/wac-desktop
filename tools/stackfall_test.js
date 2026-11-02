#!/usr/bin/env node
// Stackfall as a desktop program: controls, focus, repeat handling and persistence in a real browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.join(__dirname, '..', 'dist');
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (rel.split('/').includes('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.json') ? 'application/json' : 'text/html');
    res.end(fs.readFileSync(file));
  }).listen(0);
  let browser;
  let p;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    p = await context.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`http://localhost:${server.address().port}/`);
    const settle = () => p.waitForTimeout(300);
    await p.waitForSelector('.dicons');
    const launch = async title => {
      await p.locator('.tblaunch').click();
      await p.locator('.litem', { has: p.locator('.lt', { hasText: new RegExp(`^${title}$`) }) }).click();
    };
    await launch('Stackfall');
    const game = p.locator('.sf');
    await game.waitFor();
    await settle();
    assert.equal(await game.locator('.sf-board .sf-cell').count(), 200);
    assert.equal(await game.locator('.sf-overlay').count(), 1, 'new game starts paused');
    await game.locator('.sf-primary').click();
    await settle();
    assert.equal(await game.locator('.sf-overlay').count(), 0, 'Play starts the game');
    await p.keyboard.press('c');
    await settle();
    assert.equal(await game.locator('.sf-preview').nth(1).locator('.sf-cell:not(.sf-empty)').count(), 4, 'hold stores four cells');
    await p.keyboard.press('Space');
    await settle();
    const score = Number(await game.locator('.sf-score').textContent());
    assert(score > 0, 'hard drop scores points');
    // Repeated keydown events without a keyup must never hard-drop a second piece.
    await p.keyboard.down('Space');
    await settle();
    const one = Number(await game.locator('.sf-score').textContent());
    await p.keyboard.down('Space');
    await settle();
    assert.equal(Number(await game.locator('.sf-score').textContent()), one, 'native repeat cannot repeat hard drop');
    await p.keyboard.up('Space');
    await p.keyboard.press('p');
    await settle();
    assert.equal(await game.locator('.sf-overlay').count(), 1, 'P pauses');
    await game.locator('.sf-primary').click();
    await settle();
    assert.equal(await game.locator('.sf-overlay').count(), 0, 'Play resumes');
    await game.locator('.sf-primary').click();
    await settle();
    assert.equal(await game.locator('.sf-overlay').count(), 1, 'Pause button pauses instead of blurring then resuming');
    await p.keyboard.press('Enter');
    await settle();
    await p.locator('.win', { has: p.locator('.tt', { hasText: /^Welcome.md$/ }) }).locator('.tbar').click();
    await settle();
    assert.equal(await game.locator('.sf-overlay').count(), 1, 'another window title bar pauses the game');
    const before = Number(await game.locator('.sf-score').textContent());
    await p.keyboard.press('Space');
    await settle();
    assert.equal(Number(await game.locator('.sf-score').textContent()), before, 'unfocused game ignores keys');
    await p.locator('.tbwin', { hasText: 'Stackfall' }).click();
    await game.locator('.sf-well').click();
    await p.keyboard.press('Enter');
    await settle();
    assert.equal(await game.locator('.sf-overlay').count(), 0);
    // Our repeat timer should move multiple columns while a key is held.
    await p.keyboard.down('ArrowLeft');
    await p.waitForTimeout(440);
    await p.keyboard.up('ArrowLeft');
    const left = await game.locator('.sf-board > span').evaluateAll(cells => Math.min(...cells.flatMap((cell, i) => i < 100 && !cell.classList.contains('sf-empty') && !cell.classList.contains('sf-ghost') ? [i % 10] : [])));
    assert.equal(left, 0, 'holding left repeats movement to the wall');
    await p.keyboard.press('p');
    await settle();
    const cells = await game.locator('.sf-board').innerHTML();
    const best = await game.locator('.sf-best').textContent();
    if (process.argv[2]) { await p.screenshot({ path: process.argv[2] }); }
    // Resize through the desktop's actual corner handle; the board must remain square-celled.
    const window = p.locator('.win', { has: game });
    const box = await window.boundingBox();
    await p.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
    await p.mouse.down();
    await p.mouse.move(box.x + 357, box.y + 617, { steps: 8 });
    await p.mouse.up();
    await settle();
    const boardBox = await game.locator('.sf-board').boundingBox();
    assert(Math.abs(boardBox.height / boardBox.width - 2) < 0.1, 'resized board keeps its aspect ratio');
    assert(await game.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'small window has no horizontal overflow');
    const sideBox = await game.locator('.sf-side').boundingBox();
    const holdBox = await game.locator('.sf-preview').nth(1).boundingBox();
    assert(holdBox.y + holdBox.height <= sideBox.y + sideBox.height + 1, 'hold preview stays inside the sidebar');
    if (process.argv[2]) { await p.screenshot({ path: process.argv[2].replace(/\.png$/, '-small.png') }); }
    await p.reload();
    await game.waitFor();
    await settle();
    assert.equal(await game.locator('.sf-board').innerHTML(), cells, 'board and active piece survive reload');
    assert.equal(await game.locator('.sf-score').textContent(), String(before), 'score survives reload');
    assert.equal(await game.locator('.sf-best').textContent(), best, 'best survives reload');
    assert.equal(await game.locator('.sf-overlay').count(), 1, 'reload returns paused');
    await launch('Stackfall');
    await settle();
    assert.equal(await p.locator('.sf').count(), 1, 'launcher reuses the running game');
    await game.locator('button', { hasText: /^New game$/ }).click();
    await settle();
    assert.equal(await game.locator('button', { hasText: 'Confirm new game' }).count(), 1);
    assert.equal(await game.locator('.sf-score').textContent(), String(before), 'new game confirmation preserves current score');
    await game.locator('button', { hasText: 'Confirm new game' }).click();
    await settle();
    assert.equal(await game.locator('.sf-score').textContent(), '0');
    assert.equal(await game.locator('.sf-best').textContent(), best);
    assert.deepEqual(errors, []);
    console.log('ok   Stackfall: play, hold, drop, repeat, pause, window focus, reload, singleton and restart');
  } catch (error) {
    if (p && process.argv[2]) { await p.screenshot({ path: process.argv[2] }).catch(() => {}); }
    throw error;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
