#!/usr/bin/env node
// The desktop in Chromium, the way a person uses it — after `wac task build`; needs Playwright.
//
//     node tools/desk_test.js [screenshots-dir]
//
// Over http (where the browser gives the page storage): the first launch, opening demo.zip in place,
// Extract here, editing and saving, moving, resizing and snapping windows, and a reload that brings it all
// back. Then real drops — onto the desktop, and into a Files window — through the DevTools protocol. And
// from file://, where there is no storage: the desktop must say so, and still work.

const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const root = path.join(__dirname, '..');
const html = path.join(root, 'dist', 'index.html');
const shots = process.argv[2];
let failed = 0;
const check = (ok, what, seen) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ' — saw ' + JSON.stringify(seen)}`); };

(async () => {
  const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(html)); }).listen(0);
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = async (n) => { if (shots) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(shots, `desk-${n}.png`) }); } };
  const texts = (sel) => p.$$eval(sel, (l) => l.map((x) => x.textContent.trim()));
  const settle = (ms = 500) => p.waitForTimeout(ms);
  const row = (name) => p.locator('.win.focus .row', { has: p.locator('.t', { hasText: new RegExp(`^${name.replace(/[.]/g, '\\.')}$`) }) }).first();

  await p.goto(url);
  await p.waitForSelector('.dicons', { timeout: 20000 });
  await settle(800);
  check((await texts('.dicon .dname')).join() === 'Home,Welcome.md,demo.zip', 'a new desktop has Home, Welcome.md and demo.zip', await texts('.dicon .dname'));
  check((await texts('.win .tt')).join() === 'Welcome.md', 'and opens Welcome.md', await texts('.win .tt'));
  check((await p.textContent('.pill')).includes('Saved in this browser'), 'over http it says files are kept', await p.textContent('.pill'));
  await shot('1-first');

  await p.locator('.dicon', { hasText: 'demo.zip' }).dblclick();
  await settle(1200);
  check((await texts('.win.focus .crumb .t')).join(' > ') === 'Home > Desktop > demo.zip', 'demo.zip opens in Files, inside the archive', await texts('.win.focus .crumb .t'));
  await p.locator('.win.focus button', { hasText: 'Extract here' }).click();
  await settle(2500);
  check((await p.textContent('.toast').catch(() => '')).includes('Extracted 13 files to demo'), 'Extract here writes every file', await p.textContent('.toast').catch(() => ''));
  check((await texts('.win.focus .row .t')).includes('demo'), 'and the folder appears beside the archive', await texts('.win.focus .row .t'));
  await shot('2-extracted');

  await row('demo').dblclick(); await settle();
  await row('wordcount').dblclick(); await settle();
  await row('Makefile').click(); await settle();
  await p.locator('.win.focus .pactions button', { hasText: 'Edit' }).click(); await settle(800);
  await p.locator('.win.focus textarea').fill('# edited\nall: wordcount\n'); await settle(300);
  check((await p.textContent('.win.focus .estate')) === 'Unsaved changes', 'the editor notices a change', await p.textContent('.win.focus .estate'));
  await p.locator('.win.focus button', { hasText: 'Save' }).click(); await settle(800);
  check((await p.textContent('.win.focus .estate')) === 'Saved', 'and saves it', await p.textContent('.win.focus .estate'));

  const win = p.locator('.win.focus');
  const a = await win.boundingBox();
  await p.mouse.move(a.x + 150, a.y + 20); await p.mouse.down(); await p.mouse.move(a.x + 250, a.y + 90, { steps: 8 }); await p.mouse.up(); await settle(200);
  const b = await win.boundingBox();
  check(Math.round(b.x - a.x) === 100 && Math.round(b.y - a.y) === 70, 'a title bar drags the window', [b.x - a.x, b.y - a.y]);
  await p.mouse.move(b.x + b.width - 3, b.y + b.height - 3); await p.mouse.down(); await p.mouse.move(b.x + b.width - 123, b.y + b.height - 83, { steps: 8 }); await p.mouse.up(); await settle(200);
  const c = await win.boundingBox();
  check(Math.abs(c.width - b.width + 120) <= 3 && Math.abs(c.height - b.height + 80) <= 3, 'a corner resizes it', [c.width - b.width, c.height - b.height]);
  await p.mouse.move(c.x + 120, c.y + 20); await p.mouse.down(); await p.mouse.move(2, 300, { steps: 10 });
  check(!!(await p.$('.snapghost.l')), 'the left edge shows where it will snap', null);
  await p.mouse.up(); await settle(300);
  const d = await win.boundingBox();
  check(Math.round(d.x) === 0 && Math.round(d.width) === 720, 'and it fills the left half', [d.x, d.width]);
  await p.locator('.win.focus .wbtn[title=Minimise]').click(); await settle(200);
  check(!(await p.$('.win.focus')) || (await p.textContent('.win.focus .tt')) !== 'Makefile', 'minimise hides it', null);
  await p.locator('.tbwin', { hasText: 'Makefile' }).click(); await settle(200);
  check((await p.textContent('.win.focus .tt')) === 'Makefile', 'and the taskbar brings it back', await p.textContent('.win.focus .tt'));

  // A terminal in the Files window's folder: the same disk, seen from the shell.
  await p.locator('.tbwin', { hasText: 'wordcount' }).click(); await settle(300);
  await p.locator('.win.focus .ftop button', { hasText: 'Terminal' }).click(); await settle(800);
  const run = async (line, wait = 1500) => { await p.locator('.win.focus .tcmd').fill(line); await p.locator('.win.focus .tcmd').press('Enter'); await settle(wait); return p.$eval('.win.focus .tout', (e) => e.textContent).catch(() => ''); };
  let out = await run('pwd');
  check(out.trim().endsWith('/Desktop/demo/wordcount'), 'a terminal opened from Files starts in its folder', out.trim().split('\n').pop());
  out = await run('cat Makefile');
  check(out.includes('# edited\nall: wordcount'), 'and sees what the Editor saved', out.slice(-80));
  out = await run('grep -c word src/main.c; seq 1 100 | wc -l');
  check(/\n4\n100\n?$/.test(out.replace(/\/Desktop[^$]*\$ [^\n]*\n/g, '\n').replace(/\n+/g, '\n') + ''), 'box programs and pipes run', out.slice(-60));
  await run('echo made by the shell > shell.txt');
  await p.locator('.tbwin', { hasText: 'wordcount' }).click(); await settle(800);
  check((await texts('.win.focus .row .t')).includes('shell.txt'), 'and what the shell writes appears in Files', await texts('.win.focus .row .t'));
  await p.locator('.tbwin', { hasText: 'Terminal' }).click(); await settle(300);
  await run('open README.md', 1200);
  check((await texts('.win .tt')).includes('README.md'), '`open` shows a file in a window', await texts('.win .tt'));
  check(!!(await p.$('.win.focus .md')), 'a Markdown file opens rendered, in the Viewer', null);
  await p.locator('.win.focus .wbtn[title=Close]').click({ delay: 150 }); await settle(300);
  await p.locator('.tbwin', { hasText: 'Makefile' }).click(); await settle(300);

  // The window's own buttons, pressed at a person's speed: a press on a title bar must not become a drag
  // that swallows the click (it did — Playwright's instant clicks hid it).
  const press = (title) => p.locator(`.win.focus .wbtn[title=${title}]`).click({ delay: 150 });
  await press('Restore'); await settle(300);
  check(!(await p.$('.win.focus.snapl')), 'a slow press on Restore un-snaps', null);
  await press('Maximise'); await settle(300);
  check(!!(await p.$('.win.focus.max')), 'a slow press on Maximise maximises', null);
  await press('Restore'); await settle(300);
  check(!(await p.$('.win.focus.max')), 'and Restore restores', null);
  await press('Minimise'); await settle(300);
  check(!!(await p.$('.win.min')), 'a slow press on Minimise minimises', null);
  await p.locator('.tbwin', { hasText: 'Makefile' }).click(); await settle(300);
  await p.mouse.move(c.x + 120, c.y + 20); await p.mouse.down(); await p.mouse.move(2, 300, { steps: 10 }); await p.mouse.up(); await settle(300);

  // Drops: with no Files window in front, onto the desktop; with one in front, into its folder.
  const cdp = await ctx.newCDPSession(p);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-'));
  fs.writeFileSync(path.join(tmp, 'dropped.txt'), 'dropped on the desktop\n');
  fs.writeFileSync(path.join(tmp, 'into-files.txt'), 'dropped on a Files window\n');
  const drop = async (file, x, y) => { for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x, y, data: { items: [], files: [file], dragOperationsMask: 1 } }); await settle(1200); };
  await drop(path.join(tmp, 'dropped.txt'), 1300, 700);
  check((await texts('.dicon .dname')).includes('dropped.txt'), 'a file dropped with an editor in front lands on the desktop', await texts('.dicon .dname'));
  await p.locator('.tbwin', { hasText: 'wordcount' }).click(); await settle(300);
  await drop(path.join(tmp, 'into-files.txt'), 1300, 700);
  check((await texts('.win.focus .row .t')).includes('into-files.txt'), 'a file dropped with Files in front lands in its folder', await texts('.win.focus .row .t'));
  await shot('3-desktop');

  const before = await texts('.win .tt');
  await settle(1500);                       // the layout is saved a second after it changes
  await p.reload();
  await p.waitForSelector('.dicons', { timeout: 20000 });
  await settle(1500);
  check(JSON.stringify((await texts('.win .tt')).sort()) === JSON.stringify(before.sort()), 'a reload brings the windows back', [before, await texts('.win .tt')]);
  check((await texts('.dicon .dname')).join() === 'Home,Welcome.md,demo,demo.zip,dropped.txt', 'and the files', await texts('.dicon .dname'));
  check((await p.$eval('.win textarea', (e) => e.value).catch(() => '')) === '# edited\nall: wordcount\n', 'and the edit', null);
  check(!!(await p.$('.win.snapl')), 'and the snapped window, snapped', null);
  await shot('4-reloaded');

  // From a file: no storage. It must say so, and still work.
  const q = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  q.on('pageerror', (e) => errors.push('file:// ' + e.message));
  await q.goto('file://' + html);
  await q.waitForSelector('.dicons', { timeout: 20000 });
  await q.waitForTimeout(800);
  check((await q.textContent('.pill')).includes('Not saved'), 'from file:// it says nothing is kept', await q.textContent('.pill'));
  check((await q.$$eval('.dicon .dname', (l) => l.map((x) => x.textContent))).join() === 'Home,Welcome.md,demo.zip', 'and still starts with something to open', null);
  await q.locator('.dicon', { hasText: 'demo.zip' }).dblclick();
  await q.waitForTimeout(1200);
  check((await q.$$eval('.win.focus .crumb .t', (l) => l.map((x) => x.textContent))).includes('demo.zip'), 'and demo.zip still opens', null);

  // The shell on the in-memory disk: the same files Files shows, and its programs still run.
  await q.locator('.tblaunch').click(); await q.locator('.litem', { hasText: 'Terminal' }).click(); await q.waitForTimeout(800);
  const qrun = async (line) => { await q.locator('.win.focus .tcmd').fill(line); await q.locator('.win.focus .tcmd').press('Enter'); await q.waitForTimeout(1500); return q.$eval('.win.focus .tout', (e) => e.textContent).catch(() => ''); };
  let mem = await qrun('ls; echo in memory > mem.txt; cat mem.txt | wc -c');
  check(mem.includes('Welcome.md') && mem.includes('demo.zip') && /\n10\n?$/.test(mem), 'from file:// the shell runs on the same in-memory disk', mem.slice(-80));
  check((await q.$$eval('.dicon .dname', (l) => l.map((x) => x.textContent))).includes('mem.txt'), 'and what it writes appears on the desktop', null);
  await q.locator('.tbwin', { hasText: 'demo.zip' }).click(); await q.waitForTimeout(300);
  await q.locator('.win.focus .wbtn[title=Close]').click({ delay: 150 }); await q.waitForTimeout(300);
  check(!(await q.$$eval('.win .tt', (l) => l.map((x) => x.textContent))).includes('demo.zip'), 'a slow press on Close closes', null);

  check(errors.length === 0, 'no page errors', errors);
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `${failed} failed` : 'the desktop behaved');
  process.exit(failed ? 1 : 0);
})();
