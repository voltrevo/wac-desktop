#!/usr/bin/env node
// Mandelbrot as a desktop program, in Chromium against dist/: it draws the set, a drag and the wheel move it, new
// colours colour it again without working it out, the view is kept for the next start, and a picture is saved to the
// desktop as a PNG.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { deep, onCanvas } = require('./canvas.js');
const root = path.join(__dirname, '..', 'dist');
const shots = process.env.SHOTS || '';

// The picture, read from the canvas wherever it is — inside the window's shadow root, drawn in the program's worker
// (`canvas.js`) — and how the page shows it: its transform, which is the page's.
const CANVAS = deep('.mcanvas');
const SUMMARY = `(c) => {
  if (!c.width) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const at = (fx, fy) => { const i = (Math.floor(fy * (c.height - 1)) * c.width + Math.floor(fx * (c.width - 1))) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  let sum = 0; for (let i = 0; i < d.length; i += 997) sum = (sum * 31 + d[i]) % 1000000007;
  return { w: c.width, h: c.height, centre: at(0.5, 0.5), corner: at(0.02, 0.02), sum }; }`;
const read = async (p) => {
  const picture = await onCanvas(p, CANVAS, SUMMARY);
  if (picture === null) return null;
  return { ...picture, transform: await p.evaluate(`getComputedStyle((${CANVAS})()).transform`) };
};

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
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await context.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`http://localhost:${server.address().port}/`);
    await p.waitForSelector('.dicons');
    const ok = (what) => console.log('ok   ' + what);
    const status = p.locator('.mstatus');
    // Drawn once the move has been taken up — a wheel's waits a moment for the next notch — and the status says so.
    const drawn = async () => {
      await p.waitForTimeout(400);
      await p.waitForFunction(() => {
        const find = (n) => { for (const e of n.querySelectorAll('*')) { if (e.classList?.contains('mstatus')) return e;
          if (e.shadowRoot) { const f = find(e.shadowRoot); if (f) return f; } } return null; };
        return /Drawn in/.test(find(document)?.textContent ?? '');
      }, null, { timeout: 60000 });
      return await read(p);
    };
    const launch = async () => {
      await p.locator('.tblaunch').click();
      await p.locator('.lq').fill('fractal');
      await p.keyboard.press('Enter');
    };

    await launch();
    await status.waitFor();
    const first = await drawn();
    assert(first && first.w > 400 && first.h > 300, `the canvas is the window's size: ${JSON.stringify(first)}`);
    assert.deepEqual(first.centre, [0, 0, 0], 'the middle of the start view is in the set, and black');
    assert.notDeepEqual(first.corner, [0, 0, 0], 'the corner is not');
    ok(`found by "fractal" and drawn, ${first.w}×${first.h}: the set black in the middle`);
    if (shots) await p.screenshot({ path: path.join(shots, 'mandelbrot-1.png') });

    const stage = p.locator('.mstage');
    const box = await stage.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    await p.mouse.move(cx + 60, cy + 10, { steps: 6 });
    const during = await read(p);
    assert.match(during.transform, /matrix\(1, 0, 0, 1, 6\d/, `dragging moves the picture by its transform first: ${during.transform}`);
    await p.mouse.up();
    const dragged = await drawn();
    assert.equal(dragged.transform, 'none', 'and drawn, the transform goes');
    assert.notEqual(dragged.sum, first.sum, 'the picture moved');
    ok('a drag moves the picture at once, then draws it');

    await p.mouse.move(box.x + box.width * 0.3, cy);
    await p.mouse.wheel(0, -300);
    const zoomed = await drawn();
    const zoomText = await status.textContent();
    assert.match(zoomText, /×(3\.\d|2\.\d)/, `three notches of the wheel zoom in about 1.5³: ${zoomText}`);
    assert.notEqual(zoomed.sum, dragged.sum);
    ok(`the wheel zooms: ${zoomText}`);

    await stage.focus();
    const t0 = Date.now();
    await p.keyboard.press('c');
    for (let i = 0; (await onCanvas(p, CANVAS, SUMMARY))?.sum === zoomed.sum; i++) {
      assert(i < 200, 'the picture changed');
      await p.waitForTimeout(50);
    }
    ok(`"c" colours it again in ${Date.now() - t0} ms, nothing worked out`);
    if (shots) await p.screenshot({ path: path.join(shots, 'mandelbrot-2.png') });

    await p.locator('.mmenu').click();
    await p.locator('.mwide', { hasText: 'Save picture' }).click();
    await p.locator('.dicon', { hasText: 'Mandelbrot.png' }).waitFor({ timeout: 60000 });
    ok('Save picture puts Mandelbrot.png on the desktop');

    // Closed and opened again, it is where it was left.
    await p.reload();
    await p.waitForSelector('.dicons');
    await p.locator('.win', { has: p.locator('.tt', { hasText: /^Mandelbrot$/ }) }).locator('.tbtn.close, .wclose, [title="Close"]').first().click().catch(() => {});
    await launch();
    await status.waitFor();
    await drawn();
    const again = await status.textContent();
    assert.equal(again.split(' · ').slice(0, 2).join(' · '), zoomText.split(' · ').slice(0, 2).join(' · '), 'the depth and zoom are kept');
    ok('opened again, the view is where it was left');

    assert.deepEqual(errors, [], 'no page errors');
    ok('no page errors');
    console.log('Mandelbrot behaved');
  } catch (e) {
    console.error('FAIL ' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
