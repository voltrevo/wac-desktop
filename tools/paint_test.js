#!/usr/bin/env node
// Paint as a desktop program, in Chromium against dist/: found in the launcher, a stroke drawn with the pointer — off
// the picture and back — a rectangle and a fill in a colour from the palette, undone and redone, saved to the desktop
// as a PNG under the name typed, opened again from the Viewer's Edit with its tool kept between runs, and a PNG
// dropped on its window, and one chosen in the desktop's picker, opened.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..', 'dist');
const shots = process.env.SHOTS || '';

// The canvas, wherever it is — inside a window's shadow root — read at picture pixel (x, y), or its size.
const FIND = `const find = (n) => { for (const e of n.querySelectorAll('*')) { if (e.classList?.contains('pcanvas')) return e;
  if (e.shadowRoot) { const f = find(e.shadowRoot); if (f) return f; } } return null; };`;
const pixel = (p, x, y) => p.evaluate(`(() => { ${FIND} const c = find(document); if (!c || !c.width) return null;
  return Array.from(c.getContext('2d').getImageData(${x}, ${y}, 1, 1).data); })()`);
const size = (p) => p.evaluate(`(() => { ${FIND} const c = find(document); return c ? [c.width, c.height] : null; })()`);

// A PNG `w` by `h` of one colour, interlaced or not being nothing to the picture: made here, so a drop has a file.
const solidPng = (w, h, [r, g, b]) => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xFFFFFFFF; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (kind, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(kind), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-'));
  fs.writeFileSync(path.join(tmp, 'dropped.png'), solidPng(40, 30, [20, 120, 220]));
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
    const settle = () => p.waitForTimeout(250);
    const frame = p.locator('.pframe');
    // A point of the picture, in the page's pixels.
    const at = async (x, y) => {
      const box = await frame.boundingBox();
      const [w, h] = await size(p);
      return [box.x + (x + 0.5) * box.width / w, box.y + (y + 0.5) * box.height / h];
    };
    const until = async (what, f) => {
      for (let i = 0; i < 80; i++) { if (await f()) return; await p.waitForTimeout(100); }
      assert.fail(what);
    };
    const launch = async () => {
      await p.locator('.tblaunch').click();
      await p.locator('.lq').fill('draw');
      await p.keyboard.press('Enter');
    };

    await launch();
    await frame.waitFor();
    await until('the canvas is drawn', async () => (await size(p))?.[0] === 800);
    assert.deepEqual(await size(p), [800, 600], 'a new picture is 800 × 600');
    assert.deepEqual(await pixel(p, 400, 300), [255, 255, 255, 255], 'and white');
    ok('found by "draw": a white 800 × 600 picture');

    // The pencil, a stroke that leaves the picture on the left and comes back.
    await p.locator('.ptool[title^="Pencil"]').click();
    let [x0, y0] = await at(100, 100);
    let [x1, y1] = await at(300, 100);
    const box = await frame.boundingBox();
    await p.mouse.move(x0, y0);
    await p.mouse.down();
    await p.mouse.move(x1, y1, { steps: 12 });
    await p.mouse.move(box.x - 30, y1 + 40, { steps: 6 });
    await p.mouse.move(x0, y0 + 80 * box.height / 600, { steps: 6 });
    await p.mouse.up();
    await settle();
    const ink = [0x1e, 0x1e, 0x2e, 255];
    await until('the stroke is drawn', async () => JSON.stringify(await pixel(p, 200, 100)) === JSON.stringify(ink));
    const edge = await p.evaluate(`(() => { ${FIND} const c = find(document);
      const d = c.getContext('2d').getImageData(0, 0, 3, 600).data; const rows = [];
      for (let y = 0; y < 600; y++) if (d[y * 12] === 0x1e && d[y * 12 + 3] === 255) rows.push(y); return rows; })()`);
    assert(edge.length >= 6, `the stroke reached the left edge on its way out: rows ${edge}`);
    assert.deepEqual(await pixel(p, 100, 180), ink, 'and carried on once back over the picture');
    assert.deepEqual(await pixel(p, 200, 108), [255, 255, 255, 255], "a pencil of size 6 is no wider than that");
    ok('a pencil stroke, off the picture and back');
    const title = p.locator('.win .tt', { hasText: /^Untitled\.png/ });
    assert.match(await title.textContent(), /•$/, 'the title marks the change');

    // A red rectangle, then filled.
    await p.locator('.pswatch[title^="#d63a3a"]').click();
    await p.keyboard.press('r');
    [x0, y0] = await at(400, 300);
    [x1, y1] = await at(500, 380);
    await p.mouse.move(x0, y0);
    await p.mouse.down();
    await p.mouse.move(x1 + 100, y1 + 50, { steps: 5 });
    await p.mouse.move(x1, y1, { steps: 5 });
    await p.mouse.up();
    const red = [0xd6, 0x3a, 0x3a, 255];
    await until('the rectangle is drawn', async () => JSON.stringify(await pixel(p, 400, 340)) === JSON.stringify(red));
    assert.deepEqual(await pixel(p, 550, 410), [255, 255, 255, 255], 'where the rectangle was dragged through is clear again');
    assert.deepEqual(await pixel(p, 450, 340), [255, 255, 255, 255], 'an outline is hollow');
    await p.locator('.pswatch[title^="#3e8e41"]').click();
    await p.keyboard.press('f');
    [x0, y0] = await at(450, 340);
    await p.mouse.click(x0, y0);
    const green = [0x3e, 0x8e, 0x41, 255];
    await until('the fill', async () => JSON.stringify(await pixel(p, 450, 340)) === JSON.stringify(green));
    assert.deepEqual(await pixel(p, 600, 340), [255, 255, 255, 255], 'the fill stays inside the outline');
    ok('a rectangle in a colour from the palette, and a fill inside it');
    if (shots) await p.screenshot({ path: path.join(shots, 'paint-1.png') });

    await p.keyboard.press('Control+z');
    await until('undone', async () => JSON.stringify(await pixel(p, 450, 340)) === JSON.stringify([255, 255, 255, 255]));
    await p.keyboard.press('Control+y');
    await until('redone', async () => JSON.stringify(await pixel(p, 450, 340)) === JSON.stringify(green));
    ok('Ctrl+Z undoes the fill, Ctrl+Y does it again');

    await p.keyboard.press('Control+s');
    await p.locator('.pname').fill('sketch');
    await p.locator('.pgo', { hasText: 'Save' }).click();
    await p.locator('.dicon', { hasText: 'sketch.png' }).waitFor({ timeout: 30000 });
    await until('the title says it is saved', async () => (await p.locator('.win .tt', { hasText: /^sketch\.png/ }).count()) === 1);
    assert.equal(await p.locator('.win .tt', { hasText: /^sketch\.png/ }).textContent(), 'sketch.png');
    ok('Ctrl+S asks for a name and saves sketch.png on the desktop');

    // The saved file opened in the Viewer, and from there in Paint again.
    await p.locator('.win', { has: p.locator('.tt', { hasText: /^sketch\.png$/ }) }).locator('[title="Close"]').first().click();
    await p.locator('.dicon', { hasText: 'sketch.png' }).dblclick();
    await p.locator('.btn[title="Edit in Paint"]').click();
    await frame.waitFor();
    await until('the saved picture opens in Paint', async () => JSON.stringify(await pixel(p, 450, 340)) === JSON.stringify(green));
    assert.deepEqual(await pixel(p, 200, 100), ink, 'with the stroke');
    assert.equal(await p.locator('.ptool.on').getAttribute('title'), 'Fill — the area of one colour (F)', 'and the last tool');
    ok('the Viewer\'s Edit opens it in Paint, as it was saved, with the tool last used');
    if (shots) await p.screenshot({ path: path.join(shots, 'paint-2.png') });

    // A PNG dropped on Paint's window opens in it, rather than landing on the desktop.
    const cdp = await context.newCDPSession(p);
    const win = await p.locator('.win', { has: p.locator('.pframe') }).boundingBox();
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await cdp.send('Input.dispatchDragEvent', { type, x: win.x + win.width / 2, y: win.y + win.height / 2,
        data: { items: [], files: [path.join(tmp, 'dropped.png')], dragOperationsMask: 1 } });
    }
    await until('the dropped picture opens', async () => JSON.stringify(await size(p)) === '[40,30]');
    assert.deepEqual(await pixel(p, 20, 15), [20, 120, 220, 255], 'with its colour');
    await p.locator('.win .tt', { hasText: /^dropped\.png$/ }).waitFor();
    assert.equal(await p.locator('.dicon', { hasText: 'dropped.png' }).count(), 0, 'and not on the desktop');
    ok('a PNG dropped on the window opens in Paint');

    // Open asks the desktop's picker, which hands Paint the picture chosen.
    await p.locator('.popen').click();
    await p.locator('.pick .prow[title="sketch.png"]').click();
    await p.locator('.pick .btn.primary').click();
    await until('the picked picture opens', async () => JSON.stringify(await size(p)) === '[800,600]');
    assert.deepEqual(await pixel(p, 450, 340), green, 'the picture chosen');
    ok('Open asks the desktop\'s picker, and opens what is chosen');

    assert.deepEqual(errors, [], 'no page errors');
    ok('no page errors');
    console.log('Paint behaved');
  } catch (e) {
    console.error('FAIL ' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
