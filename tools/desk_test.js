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
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const html = path.join(root, 'dist', 'index.html');
const shots = process.argv[2];
let failed = 0;
const check = (ok, what, seen) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ' — saw ' + JSON.stringify(seen)}`); };

// **Waiting for what a step does, not for a time.** The desktop draws in a worker, so what an event changes reaches
// the DOM a moment later — later still on a loaded machine. `until` asks `cond` again every 50ms, for up to `ms`, and
// goes on either way: the check after it says what was seen if it never came. `cond` must read without waiting
// (`read`, `texts`, `$`): Playwright's `textContent` waits 30s for an element that is not there. The time allowed is
// generous, as it costs nothing unless something is wrong: a loaded machine is slow, not broken.
const until = async (cond, ms = 20000) => {
  const end = Date.now() + ms;
  while (!(await cond().catch(() => false))) {
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
};

(async () => {
  // dist/ as a static server serves it: the desktop's own site, `/site` on its disk, is what is really there.
  const types = { '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm' };
  const server = http.createServer((q, r) => {
    const rel = decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, 'dist', rel);
    if (rel.split('/').includes('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { r.statusCode = 404; r.end(); return; }
    r.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    r.end(fs.readFileSync(file));
  }).listen(0);
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // **A program's window draws in a shadow root of its body** (web's `Element.shadow`), which a page's own
  // `querySelector` does not look into: `__deep('A >>> B')` is B inside the shadow root of the first A. Playwright's
  // selectors look into it already; this is for what a test reads in the page itself.
  await ctx.addInitScript(() => {
    window.__deep = (sel) => {
      const [outer, inner] = sel.split(' >>> ');
      const host = document.querySelector(outer);
      return inner === undefined ? host : (host?.shadowRoot?.querySelector(inner) ?? null);
    };
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = async (n) => { if (shots) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(shots, `desk-${n}.png`) }); } };
  const texts = (sel) => p.$$eval(sel, (l) => l.map((x) => x.textContent.trim()));
  const settle = (ms = 500) => p.waitForTimeout(ms);
  const row = (name) => p.locator('.win.focus .row', { has: p.locator('.t', { hasText: new RegExp(`^${name.replace(/[.]/g, '\\.')}$`) }) }).first();
  // An element's text now, or '' if it is not there — a read that does not wait, for `until` and for what a check says.
  const read = (sel, page = p) => page.$eval(sel, (e) => e.textContent).catch(() => '');
  const front = (page = p) => read('.win.focus .tt', page);
  const crumbs = () => texts('.win.focus .crumb .t');
  const titled = async (t) => (await texts('.win .tt')).includes(t);
  // What a window titled `title` shows at `sel`, inside its program's shadow root or out: '' if there is none.
  const inWin = (title, sel) => p.$$eval('.win', (ws, [t, s]) => {
    const w = ws.find((w) => w.querySelector('.tt')?.textContent === t);
    const body = w?.querySelector('.program-body');
    return (body?.shadowRoot?.querySelector(s) ?? w?.querySelector(s))?.textContent ?? '';
  }, [title, sel]);
  // A file on the desktop's disk — the browser's own storage, where a reload reads it back — or null if it is not
  // written yet. A reload waits for what it is to bring back to be there, not for a time.
  const stored = (file) => p.evaluate(async (parts) => {
    try {
      let d = await navigator.storage.getDirectory();
      for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x);
      return await (await (await d.getFileHandle(parts[parts.length - 1])).getFile()).text();
    } catch { return null; }
  }, file.split('/')).catch(() => null);
  const savedWindows = async () => JSON.parse((await stored('.desktop/session.json')) ?? '{"windows":[]}').windows;

  await p.goto(url);
  await p.waitForSelector('.dicons', { timeout: 20000 });
  await until(async () => (await texts('.dicon .dname')).join() === 'Home,Trash,Welcome.md,demo.zip' && (await texts('.win .tt')).join() === 'Welcome.md'
                          && (await read('.pill')).includes('Saved in this browser'));
  check((await texts('.dicon .dname')).join() === 'Home,Trash,Welcome.md,demo.zip', 'a new desktop has Home, the Trash, Welcome.md and demo.zip', await texts('.dicon .dname'));
  check((await texts('.win .tt')).join() === 'Welcome.md', 'and opens Welcome.md', await texts('.win .tt'));
  check((await p.textContent('.pill')).includes('Saved in this browser'), 'over http it says files are kept', await p.textContent('.pill'));
  await shot('1-first');

  await p.locator('.dicon', { hasText: 'demo.zip' }).dblclick();
  await until(async () => (await crumbs()).join(' > ') === 'Home > Desktop > demo.zip');
  check((await texts('.win.focus .crumb .t')).join(' > ') === 'Home > Desktop > demo.zip', 'demo.zip opens in Files, inside the archive', await texts('.win.focus .crumb .t'));
  await p.locator('.win.focus button', { hasText: 'Extract here' }).click();
  await until(async () => (await read('.toast')).includes('Extracted 13 files to demo') && (await texts('.win.focus .row .t')).includes('demo'), 20000);
  check((await read('.toast')).includes('Extracted 13 files to demo'), 'Extract here writes every file', await read('.toast'));
  check((await texts('.win.focus .row .t')).includes('demo'), 'and the folder appears beside the archive', await texts('.win.focus .row .t'));
  await shot('2-extracted');

  // Each step waits for what it did to show — the folder entered, the file chosen — so the next lands where it means to.
  await row('demo').dblclick(); await until(async () => (await crumbs()).pop() === 'demo');
  await row('wordcount').dblclick(); await until(async () => (await crumbs()).pop() === 'wordcount');
  await row('Makefile').click(); await until(async () => (await texts('.win.focus .row.sel .t')).join() === 'Makefile');
  await p.locator('.win.focus .pactions button', { hasText: 'Edit' }).click();
  // The Editor draws its field only once it has read the file, so what is filled in replaces what was loaded.
  await until(async () => (await front()) === 'Makefile' && !!(await p.$('.win.focus textarea')), 30000);
  const estate = () => read('.win.focus .estate');
  await p.locator('.win.focus textarea').fill('# edited\nall: wordcount\n');
  await until(async () => (await estate()) === 'Unsaved changes');
  check((await p.textContent('.win.focus .estate')) === 'Unsaved changes', 'the editor notices a change', await p.textContent('.win.focus .estate'));
  await p.locator('.win.focus button', { hasText: 'Save' }).click();
  await until(async () => (await estate()) === 'Saved');
  check((await p.textContent('.win.focus .estate')) === 'Saved', 'and saves it', await p.textContent('.win.focus .estate'));
  // Unsaved first, so that the Saved after Ctrl+S is that save's and not the last one's still showing.
  await p.locator('.win.focus textarea').fill('# edited\nall: wordcount\n!'); await until(async () => (await estate()) === 'Unsaved changes');
  await p.keyboard.press('Control+s');
  await until(async () => (await estate()) === 'Saved' && (await p.$eval('.win.focus textarea', (e) => e.value)) === '# edited\nall: wordcount\n!');
  check((await p.textContent('.win.focus .estate')) === 'Saved' && (await p.$eval('.win.focus textarea', (e) => e.value)) === '# edited\nall: wordcount\n!', 'Ctrl+S saves too, without typing an s', await p.$eval('.win.focus textarea', (e) => e.value));
  await p.locator('.win.focus textarea').fill('# edited\nall: wordcount\n'); await until(async () => (await estate()) === 'Unsaved changes');
  await p.keyboard.press('Control+s'); await until(async () => (await estate()) === 'Saved');

  const win = p.locator('.win.focus');
  const a = await win.boundingBox();
  await p.mouse.move(a.x + 150, a.y + 20); await p.mouse.down(); await p.mouse.move(a.x + 250, a.y + 90, { steps: 8 }); await p.mouse.up();
  await until(async () => { const b = await win.boundingBox(); return Math.round(b.x - a.x) === 100 && Math.round(b.y - a.y) === 70; });
  const b = await win.boundingBox();
  check(Math.round(b.x - a.x) === 100 && Math.round(b.y - a.y) === 70, 'a title bar drags the window', [b.x - a.x, b.y - a.y]);
  await p.mouse.move(b.x + b.width - 3, b.y + b.height - 3); await p.mouse.down(); await p.mouse.move(b.x + b.width - 123, b.y + b.height - 83, { steps: 8 }); await p.mouse.up();
  await until(async () => { const c = await win.boundingBox(); return Math.abs(c.width - b.width + 120) <= 3 && Math.abs(c.height - b.height + 80) <= 3; });
  const c = await win.boundingBox();
  check(Math.abs(c.width - b.width + 120) <= 3 && Math.abs(c.height - b.height + 80) <= 3, 'a corner resizes it', [c.width - b.width, c.height - b.height]);
  await p.mouse.move(c.x + 120, c.y + 20); await p.mouse.down(); await p.mouse.move(2, 300, { steps: 10 });
  // The desktop draws in a worker, so the ghost appears a moment after the pointer arrives.
  await p.waitForSelector('.snapghost.l', { timeout: 2000 }).catch(() => {});
  check(!!(await p.$('.snapghost.l')), 'the left edge shows where it will snap', null);
  await p.mouse.up();
  await until(async () => { const d = await win.boundingBox(); return Math.round(d.x) === 0 && Math.round(d.width) === 720; });
  const d = await win.boundingBox();
  check(Math.round(d.x) === 0 && Math.round(d.width) === 720, 'and it fills the left half', [d.x, d.width]);
  await p.locator('.win.focus .wbtn[title=Minimise]').click();
  await until(async () => !(await p.$('.win.focus')) || (await front()) !== 'Makefile');
  check(!(await p.$('.win.focus')) || (await p.textContent('.win.focus .tt')) !== 'Makefile', 'minimise hides it', null);
  await p.locator('.tbwin', { hasText: 'Makefile' }).click(); await until(async () => (await front()) === 'Makefile');
  check((await p.textContent('.win.focus .tt')) === 'Makefile', 'and the taskbar brings it back', await p.textContent('.win.focus .tt'));

  // A terminal in the Files window's folder: the same disk, seen from the shell.
  await p.locator('.tbwin', { hasText: 'wordcount' }).click(); await until(async () => (await front()) === 'wordcount');
  await p.locator('.win.focus .ftop button', { hasText: 'Terminal' }).click();
  const tout = () => read('.win.focus .tout');
  // A line has run when the shell has echoed it and its prompt is back: the prompt is hidden while a command runs.
  const run = async (line) => {
    const echoed = ` ${line}\n`;
    const seen = (await tout()).split(echoed).length;
    await p.locator('.win.focus .tcmd').fill(line); await p.locator('.win.focus .tcmd').press('Enter');
    await until(async () => (await tout()).split(echoed).length > seen && (await read('.win.focus .tps')) !== '', 30000);
    return tout();
  };
  let out = await run('pwd');
  check(out.trim().endsWith('/Desktop/demo/wordcount'), 'a terminal opened from Files starts in its folder', out.trim().split('\n').pop());
  out = await run('cat Makefile');
  check(out.includes('# edited\nall: wordcount'), 'and sees what the Editor saved', out.slice(-80));
  out = await run('grep -c word src/main.c; seq 1 100 | wc -l');
  check(/\n4\n100\n?$/.test(out.replace(/\/Desktop[^$]*\$ [^\n]*\n/g, '\n').replace(/\n+/g, '\n') + ''), 'box programs and pipes run', out.slice(-60));
  await p.locator('.win.focus .tcmd').press('Control+l'); await until(async () => (await p.$eval('.win.focus .tout', (e) => e.textContent)) === '');
  check((await p.$eval('.win.focus .tout', (e) => e.textContent).catch(() => 'x')) === '', 'Ctrl+L clears the terminal', null);
  // The `wac` command, from /usr/bin: a page runs a module it holds, and this one compiles what is on the disk.
  const runUntil = async (line, want, ms) => {
    await p.locator('.win.focus .tcmd').fill(line); await p.locator('.win.focus .tcmd').press('Enter');
    let seen = '';
    await until(async () => want.test(seen = await tout()), ms);
    return seen;
  };
  out = await runUntil("printf 'export i32 main() { return 3; }\\n' > three.wac; wac check three.wac", /three\.wac: 1 file\(s\)/, 60000);
  check(out.includes('three.wac: 1 file(s), no diagnostics'), 'wac, in the terminal, checks a file on the disk', out.slice(-120));
  out = await runUntil('wac build three.wac -o three && ./three.wasm', /\[exit 3\]/, 60000);
  check(/three\.wasm: \d+ bytes from 1 file\(s\)\n[^\n]*\$ ?\n?\[exit 3\]\n?$/.test(out) || (out.includes('three.wasm: ') && /\[exit 3\]\n?$/.test(out)), 'and builds it into a program the shell runs, which answers its status', out.slice(-120));
  out = await runUntil("printf '%s\\n' 'import { Sys } from \"std\";' 'export async i32 main(Sys sys) { sys.stdout().line(\"ran here\"); return 0; }' > ran.wac; wac run ran.wac; echo status $?", /status \d+/, 60000);
  check(/\nran here\nstatus 0\n?$/.test(out), 'and runs a program straight from its source', out.slice(-120));
  out = await runUntil("printf '%s\\n' 'export string test_holds() { return \"\"; }' 'export string test_breaks() { return \"on purpose\"; }' > two_test.wac; wac test two_test.wac", /\d+ passed, \d+ failed/, 60000);
  check(out.includes('ok   test_holds') && out.includes('FAIL test_breaks — on purpose') && out.includes('1 passed, 1 failed'), 'and tests it', out.slice(-160));
  // A loop that never asks anything: only ending its worker stops it.
  out = await runUntil("printf '%s\\n' 'export i32 main() {' '  i32 n = 0;' '  while (true) { n = n + 1; }' '  return n;' '}' > spin.wac; wac build spin.wac -o spin", /spin\.wasm: \d+ bytes/, 60000);
  await p.locator('.win.focus .tcmd').fill('./spin.wasm'); await p.locator('.win.focus .tcmd').press('Enter');
  // Started — its line echoed and the prompt gone — and then given a second, which is a wait for nothing to happen: a
  // program that ended at once, or failed to start, would have said so by then.
  await until(async () => /\$ \.\/spin\.wasm\n?$/.test(await tout()) && (await read('.win.focus .tps')) === '');
  await settle(1000);
  out = await p.$eval('.win.focus .tout', (e) => e.textContent).catch(() => '');
  check(/\$ \.\/spin\.wasm\n?$/.test(out), 'a program wac built runs as a process of the Terminal\'s', out.slice(-160));
  await p.locator('.win.focus .tcmd').press('Control+c');
  out = await runUntil('echo back after the stop', /\nback after the stop\n?$/, 15000);
  check(/\nback after the stop\n?$/.test(out), 'and ^C stops a program that never yields', out.slice(-160));
  await run('echo made by the shell > shell.txt');
  await p.locator('.tbwin', { hasText: 'wordcount' }).click();
  await until(async () => (await front()) === 'wordcount' && (await texts('.win.focus .row .t')).includes('shell.txt'));
  check((await texts('.win.focus .row .t')).includes('shell.txt'), 'and what the shell writes appears in Files', await texts('.win.focus .row .t'));
  await p.locator('.tbwin', { hasText: 'Terminal' }).click(); await until(async () => (await front()) === 'Terminal');
  // `open` puts the file's window in front, so it is that window, not the Terminal's prompt, that says it has run.
  await p.locator('.win.focus .tcmd').fill('open README.md'); await p.locator('.win.focus .tcmd').press('Enter');
  await until(async () => (await titled('README.md')) && !!(await p.$('.win.focus .md')));
  check((await texts('.win .tt')).includes('README.md'), '`open` shows a file in a window', await texts('.win .tt'));
  check(!!(await p.$('.win.focus .md')), 'a Markdown file opens rendered, in the Viewer', null);
  await p.locator('.win.focus .wbtn[title=Close]').click({ delay: 150 }); await until(async () => !(await titled('README.md')));
  await p.locator('.tbwin', { hasText: 'Makefile' }).click(); await until(async () => (await front()) === 'Makefile');

  // The window's own buttons, pressed at a person's speed: a press on a title bar must not become a drag
  // that swallows the click (it did — Playwright's instant clicks hid it).
  const press = (title) => p.locator(`.win.focus .wbtn[title=${title}]`).click({ delay: 150 });
  await press('Restore'); await until(async () => !(await p.$('.win.focus.snapl')));
  check(!(await p.$('.win.focus.snapl')), 'a slow press on Restore un-snaps', null);
  await press('Maximise'); await until(async () => !!(await p.$('.win.focus.max')));
  check(!!(await p.$('.win.focus.max')), 'a slow press on Maximise maximises', null);
  await press('Restore'); await until(async () => !(await p.$('.win.focus.max')));
  check(!(await p.$('.win.focus.max')), 'and Restore restores', null);
  await press('Minimise'); await until(async () => !!(await p.$('.win.min')));
  check(!!(await p.$('.win.min')), 'a slow press on Minimise minimises', null);
  await p.locator('.tbwin', { hasText: 'Makefile' }).click(); await until(async () => (await front()) === 'Makefile' && !(await p.$('.win.min')));
  await p.mouse.move(c.x + 120, c.y + 20); await p.mouse.down(); await p.mouse.move(2, 300, { steps: 10 });
  await p.waitForSelector('.snapghost.l', { timeout: 2000 }).catch(() => {});
  await p.mouse.up(); await until(async () => !!(await p.$('.win.focus.snapl')));

  // Drops: with no Files window in front, onto the desktop; with one in front, into its folder. Each is waited for
  // where it is to land.
  const cdp = await ctx.newCDPSession(p);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-'));
  fs.writeFileSync(path.join(tmp, 'dropped.txt'), 'dropped on the desktop\n');
  fs.writeFileSync(path.join(tmp, 'into-files.txt'), 'dropped on a Files window\n');
  const drop = async (file, x, y) => { for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x, y, data: { items: [], files: [file], dragOperationsMask: 1 } }); };
  await drop(path.join(tmp, 'dropped.txt'), 1300, 700);
  await until(async () => (await texts('.dicon .dname')).includes('dropped.txt'));
  check((await texts('.dicon .dname')).includes('dropped.txt'), 'a file dropped with an editor in front lands on the desktop', await texts('.dicon .dname'));
  await p.locator('.tbwin', { hasText: 'wordcount' }).click(); await until(async () => (await front()) === 'wordcount');
  await drop(path.join(tmp, 'into-files.txt'), 1300, 700);
  await until(async () => (await texts('.win.focus .row .t')).includes('into-files.txt'));
  check((await texts('.win.focus .row .t')).includes('into-files.txt'), 'a file dropped with Files in front lands in its folder', await texts('.win.focus .row .t'));
  await shot('3-desktop');

  // **A program from the disk, in a window**: samples/counter.wac built as a page's module, dropped on the desktop and
  // opened. It draws in its window's body, names its window, and hears a click there.
  const built = path.join(root, '.cache', 'counter');
  execFileSync('wac', ['run', '--allow-read', '--allow-write', '--allow-run', 'build.wac', 'samples/counter.wac', path.relative(root, built)],
               { cwd: root, stdio: 'pipe' });
  fs.copyFileSync(path.join(built, 'page.wasm'), path.join(tmp, 'counter.wasm'));
  await p.locator('.tbwin', { hasText: 'Makefile' }).click(); await until(async () => (await front()) === 'Makefile');
  await drop(path.join(tmp, 'counter.wasm'), 1300, 700);
  // Written to the browser's storage after it arrives, which takes longer than the drop: waited for.
  await p.waitForSelector('.dicon[title="counter.wasm"]', { timeout: 10000 }).catch(() => {});
  // Behind the snapped Editor, so double-clicked where it is rather than moved to: the layout is what the later checks read.
  await p.$eval('.dicon[title="counter.wasm"]', (e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  await p.waitForFunction(() => __deep('.win.focus .program-body >>> .count') !== null, null, { timeout: 15000 }).catch(() => {});
  const counted = () => p.$eval('.win.focus .program-body', (e) => (e.shadowRoot ?? e).textContent).catch(() => '');
  check((await counted()) === 'Clicks: 0 +1', 'a page module from the disk draws in its window', await counted());
  check((await texts('.win.focus .tt')).join() === 'Counter', 'and names it', await texts('.win.focus .tt'));
  await p.locator('.win.focus .program-body .up').click(); await until(async () => (await counted()) === 'Clicks: 1 +1');
  check((await counted()) === 'Clicks: 1 +1', 'and a click in it reaches the program, which draws again', await counted());
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Counter')));
  check(!(await texts('.win .tt')).includes('Counter'), 'closing the window ends the program', await texts('.win .tt'));

  // **A program asks the desktop for things** (samples/notes.wac): it may write its own folder and nothing it was not
  // handed; the picker hands it what the person chooses; and a file dropped on its window is its own.
  const notesBuilt = path.join(root, '.cache', 'notes');
  execFileSync('wac', ['run', '--allow-read', '--allow-write', '--allow-run', 'build.wac', 'samples/notes.wac', path.relative(root, notesBuilt)],
               { cwd: root, stdio: 'pipe' });
  fs.copyFileSync(path.join(notesBuilt, 'page.wasm'), path.join(tmp, 'notes.wasm'));
  // Dropped wherever a drop goes now — the folder of a Files window in front, or the desktop — and opened from there,
  // once it is there.
  const landed = async (name) => (await texts('.dicon .dname')).includes(name) || (await texts('.win.focus .row .t')).includes(name);
  await drop(path.join(tmp, 'notes.wasm'), 1300, 700);
  await until(() => landed('notes.wasm'), 30000);
  if ((await texts('.dicon .dname')).includes('notes.wasm')) {
    await p.$eval('.dicon[title="notes.wasm"]', (e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  } else {
    await row('notes.wasm').dblclick();
  }
  const inNotes = (sel) => p.$eval(`.win.focus .program-body ${sel}`, (e) => e.textContent).catch(() => '');
  await p.waitForFunction(() => { const e = __deep('.win.focus .program-body >>> .welcome'); return e !== null && e.textContent !== '…'; }, null, { timeout: 15000 }).catch(() => {});
  check((await inNotes('.launches')) === '1', 'a program keeps what it keeps in its own folder', await inNotes('.launches'));
  check((await inNotes('.welcome')) === 'refused', 'and may not read what it was not handed', await inNotes('.welcome'));
  await p.locator('.win.focus .program-body .pick').click();
  await p.waitForSelector('.pick-shade', { timeout: 5000 }).catch(() => {});
  const asked = await p.$eval('.pick .phead', (e) => e.textContent).catch(() => '');
  check(asked === 'Notes asks for a note to read', 'the picker says who asks, and for what', asked);
  await p.locator('.pick .prow[title="Welcome.md"]').click(); await until(async () => !!(await p.$('.pick .prow.sel[title="Welcome.md"]')));
  await p.locator('.pick .btn.primary').click();
  await p.waitForFunction(() => { const e = __deep('.win.focus .program-body >>> .text'); return e !== null && e.textContent !== ''; }, null, { timeout: 10000 }).catch(() => {});
  const picked = await inNotes('.text');
  check(picked.startsWith('/Desktop/Welcome.md\n') && picked.length > 40, 'what the person chose is the program\'s to read', picked.slice(0, 80));
  check((await p.$$('.pick-shade')).length === 0, 'and the picker is gone', null);
  await drop(path.join(tmp, 'into-files.txt'), 900, 400);
  await until(async () => (await inNotes('.got')).includes('into-files.txt (26 bytes)'));
  check((await inNotes('.got')).includes('into-files.txt (26 bytes)'), 'a file dropped on a program\'s window is handed to it', await inNotes('.got'));
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Notes')));

  // **A program opens its own windows**: samples/two.wac's page is its first, and it asks for a second. Each draws
  // apart; closing one leaves the other, and closing the last stops the program.
  const build = (sample, stem) => {
    const out = path.join(root, '.cache', stem);
    execFileSync('wac', ['run', '--allow-read', '--allow-write', '--allow-run', 'build.wac', `samples/${sample}`, path.relative(root, out)], { cwd: root, stdio: 'pipe' });
    fs.copyFileSync(path.join(out, 'page.wasm'), path.join(tmp, `${stem}.wasm`));
  };
  const openDropped = async (name) => {
    await drop(path.join(tmp, name), 1300, 700);
    await until(() => landed(name), 30000);
    if ((await texts('.dicon .dname')).includes(name)) {
      await p.$eval(`.dicon[title="${name}"]`, (e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    } else {
      await row(name).dblclick();
    }
  };
  build('two.wac', 'two');
  await openDropped('two.wasm');
  await p.waitForFunction(() => [...document.querySelectorAll('.program-body')].some((b) => b.shadowRoot?.querySelector('.second')), null, { timeout: 15000 }).catch(() => {});
  const titles = async () => (await texts('.win .tt')).filter((t) => t === 'Two' || t === 'Second').sort().join();
  check((await titles()) === 'Second,Two', 'a program opens a second window of its own', await texts('.win .tt'));
  const firstHas = await p.$$eval('.win', (ws) => ws.filter((w) => w.querySelector('.tt')?.textContent === 'Two').map((w) => w.querySelector('.program-body')?.shadowRoot?.textContent).join());
  check(firstHas === 'the first window', 'and each window shows only what was drawn in it', firstHas);
  const closeTitled = (t) => p.$$eval('.win', (ws, t) => { const w = ws.find((w) => w.querySelector('.tt')?.textContent === t); w?.querySelector('.wbtn[title=Close]')?.click(); }, t);
  await closeTitled('Second'); await until(async () => (await titles()) === 'Two');
  check((await titles()) === 'Two', 'closing one of its windows leaves the other', await texts('.win .tt'));
  await closeTitled('Two'); await until(async () => (await titles()) === '');
  check((await titles()) === '', 'and closing the last ends it', await texts('.win .tt'));

  // **A program with nothing to show opens no window**: samples/hello.wac writes a line, and the desktop says it.
  execFileSync('wac', ['build', 'samples/hello.wac', '-o', path.join(tmp, 'hello')], { cwd: root, stdio: 'pipe' });
  const windowsBefore = (await texts('.win .tt')).length;
  await openDropped('hello.wasm');
  await p.waitForFunction(() => (document.querySelector('.toast')?.textContent ?? '').includes('hello from'), null, { timeout: 15000 }).catch(() => {});
  check((await p.$eval('.toast', (e) => e.textContent).catch(() => '')).includes('hello.wasm: hello from a program with no window'),
        'a program with nothing to show opens no window, and its words are the desktop\'s note', await p.$eval('.toast', (e) => e.textContent).catch(() => ''));
  check((await texts('.win .tt')).length === windowsBefore, 'and no window opened for it', await texts('.win .tt'));

  // **More than it is handed is asked for once** (samples/reader.wac): the person allows it to read the desktop, and
  // started again it holds that already — no question.
  build('reader.wac', 'reader');
  await openDropped('reader.wasm');
  await p.waitForSelector('.consent', { timeout: 15000 }).catch(() => {});
  const question = await p.$eval('.consent .phead', (e) => e.textContent).catch(() => '');
  check(question === 'Reader asks to read Desktop', 'a program asking for more is asked about, naming what', question);
  await p.locator('.consent .btn.primary').click();
  const listedIn = () => p.$eval('.win.focus .program-body .listed', (e) => e.textContent).catch(() => '');
  await p.waitForFunction(() => { const e = __deep('.win.focus .program-body >>> .listed'); return e !== null && e.textContent !== '…'; }, null, { timeout: 10000 }).catch(() => {});
  check((await listedIn()).split(',').includes('Welcome.md'), 'and once allowed, it reads what it asked for', await listedIn());
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Reader')));
  if ((await texts('.dicon .dname')).includes('reader.wasm')) {
    await p.$eval('.dicon[title="reader.wasm"]', (e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  } else {
    await row('reader.wasm').dblclick();
  }
  await p.waitForFunction(() => { const e = __deep('.win.focus .program-body >>> .listed'); return e !== null && e.textContent !== '…'; }, null, { timeout: 10000 }).catch(() => {});
  check((await p.$$('.consent')).length === 0 && (await listedIn()).split(',').includes('Welcome.md'),
        'started again, it is not asked again', { asked: (await p.$$('.consent')).length, listed: await listedIn() });
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Reader')));

  // **And what was allowed can be taken back**: the Permissions window lists it, Take back forgets it, and the
  // program started again is asked again — and refused, cannot read.
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'Permissions' }).click();
  await until(async () => (await texts('.win.focus .arow')).some((g) => g.startsWith('reader.wasmmay read Desktop')));
  const grants = await texts('.win.focus .arow');
  check(grants.some((g) => g.startsWith('reader.wasmmay read Desktop')), 'Permissions lists what a program was allowed', grants);
  await p.locator('.win.focus .arow', { hasText: 'reader.wasm' }).locator('.btn').click();
  await until(async () => !(await texts('.win.focus .arow')).some((g) => g.startsWith('reader.wasm')));
  check(!(await texts('.win.focus .arow')).some((g) => g.startsWith('reader.wasm')), 'and Take back forgets it', await texts('.win.focus .arow'));
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Permissions')));
  if ((await texts('.dicon .dname')).includes('reader.wasm')) {
    await p.$eval('.dicon[title="reader.wasm"]', (e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  } else {
    await row('reader.wasm').dblclick();
  }
  await p.waitForSelector('.consent', { timeout: 15000 }).catch(() => {});
  check((await p.$$('.consent')).length === 1, 'started again, it is asked again', null);
  await p.locator('.consent .btn', { hasText: "Don't allow" }).click();
  await p.waitForFunction(() => { const e = __deep('.win.focus .program-body >>> .listed'); return e !== null && e.textContent !== '…'; }, null, { timeout: 10000 }).catch(() => {});
  check((await listedIn()).startsWith('refused'), 'and refused, it cannot read', await listedIn());
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Reader')));

  const before = await texts('.win .tt');
  const sameWindows = (l) => JSON.stringify([...l].sort()) === JSON.stringify([...before].sort());
  // The layout is saved a second after it changes, and a reload brings back what was saved: waited for until the
  // saved layout has these windows, the snapped one snapped.
  await until(async () => { const w = await savedWindows(); return sameWindows(w.map((x) => x.title)) && w.some((x) => x.snap !== 0); });
  await p.reload();
  await p.waitForSelector('.dicons', { timeout: 20000 });
  const icons = async () => (await texts('.dicon .dname')).filter((n) => !['notes.wasm', 'two.wasm', 'hello.wasm', 'reader.wasm'].includes(n)).join();
  await until(async () => sameWindows(await texts('.win .tt')) && (await icons()) === 'Home,Trash,Welcome.md,counter.wasm,demo,demo.zip,dropped.txt'
                          && (await p.$eval('.win textarea', (e) => e.value)) === '# edited\nall: wordcount\n' && !!(await p.$('.win.snapl')), 20000);
  check(JSON.stringify((await texts('.win .tt')).sort()) === JSON.stringify(before.sort()), 'a reload brings the windows back', [before, await texts('.win .tt')]);
  // notes.wasm is here only if it was dropped with nothing in front that takes files.
  check((await texts('.dicon .dname')).filter((n) => !['notes.wasm', 'two.wasm', 'hello.wasm', 'reader.wasm'].includes(n)).join() === 'Home,Trash,Welcome.md,counter.wasm,demo,demo.zip,dropped.txt', 'and the files', await texts('.dicon .dname'));
  check((await p.$eval('.win textarea', (e) => e.value).catch(() => '')) === '# edited\nall: wordcount\n', 'and the edit', null);
  check(!!(await p.$('.win.snapl')), 'and the snapped window, snapped', null);
  await shot('4-reloaded');

  // Moving files by dragging them, the Trash, cut and paste. First, every window away.
  for (let i = 0; i < 12; i++) {
    if (await p.$('.win.focus')) {
      const n = (await p.$$('.win')).length;
      await p.locator('.win.focus .wbtn[title=Close]').click({ delay: 120 }); await until(async () => (await p.$$('.win')).length < n);
      continue;
    }
    if (await p.$('.tbwin')) { await p.locator('.tbwin').first().click(); await until(async () => !!(await p.$('.win.focus'))); continue; }
    break;
  }
  const icon = (name) => p.locator('.dicon', { has: p.locator('.dname', { hasText: new RegExp(`^${name.replace(/[.]/g, '\\.')}$`) }) }).first();
  const crumb = (name) => p.locator('.win.focus .crumb', { has: p.locator('.t', { hasText: new RegExp(`^${name}$`) }) }).first();
  const toast = () => read('.toast');
  // `onto` is what the drag says it will do, beside the pointer (`.fghost .fto`): it is let go once it says so. The
  // desktop hears where the pointer is over only once it has drawn the drag, so a last move made before that is told
  // again, a pixel along.
  const dragOnto = async (from, to, onto, ctrl = false) => {
    const a = await from.boundingBox();
    const b = to.x !== undefined ? to : await to.boundingBox();
    const x = b.x + Math.min(40, b.width / 2), y = b.y + b.height / 2;
    await p.mouse.move(a.x + Math.min(40, a.width / 2), a.y + a.height / 2); await p.mouse.down();
    await p.mouse.move(a.x + 60, a.y + a.height / 2 + 24, { steps: 4 });
    if (ctrl) await p.keyboard.down('Control');
    await p.mouse.move(x, y, { steps: 12 });
    for (let k = 1; k <= 40 && !(await until(async () => (await read('.fghost .fto')) === onto, 500)); k++) await p.mouse.move(x + (k % 2), y);
    await p.mouse.up();
    if (ctrl) await p.keyboard.up('Control');
  };
  await dragOnto(icon('dropped.txt'), icon('demo'), '→ demo');
  await until(async () => (await toast()).includes('Moved dropped.txt to demo') && !(await texts('.dicon .dname')).includes('dropped.txt'));
  check((await toast()).includes('Moved dropped.txt to demo') && !(await texts('.dicon .dname')).includes('dropped.txt'), 'a desktop icon dragged onto a folder icon moves into it', [await toast(), await texts('.dicon .dname')]);
  await icon('demo').dblclick(); await until(async () => (await texts('.win.focus .row .t')).includes('dropped.txt'));
  check((await texts('.win.focus .row .t')).includes('dropped.txt'), 'and Files finds it there', await texts('.win.focus .row .t'));
  await row('wordcount').dblclick();
  await until(async () => (await crumbs()).pop() === 'wordcount' && (await texts('.win.focus .row .t')).includes('shell.txt') && (await texts('.win.focus .row .t')).includes('src'));
  await dragOnto(row('shell.txt'), row('src'), '→ src');
  await until(async () => !(await texts('.win.focus .row .t')).includes('shell.txt') && (await toast()).includes('Moved shell.txt to src'));
  check(!(await texts('.win.focus .row .t')).includes('shell.txt') && (await toast()).includes('Moved shell.txt to src'), 'a row dragged onto a folder row moves into it', [await toast(), await texts('.win.focus .row .t')]);
  await dragOnto(row('into-files.txt'), crumb('demo'), '+ copy to demo', true);
  await until(async () => (await texts('.win.focus .row .t')).includes('into-files.txt') && (await toast()).includes('Copied into-files.txt to demo'));
  check((await texts('.win.focus .row .t')).includes('into-files.txt') && (await toast()).includes('Copied into-files.txt to demo'), 'with Ctrl held, onto a breadcrumb, it is copied instead', [await toast(), await texts('.win.focus .row .t')]);
  await dragOnto(row('Makefile'), { x: 20, y: 740, width: 80, height: 40 }, '→ the desktop');
  await until(async () => (await texts('.dicon .dname')).includes('Makefile') && !(await texts('.win.focus .row .t')).includes('Makefile'));
  check((await texts('.dicon .dname')).includes('Makefile') && !(await texts('.win.focus .row .t')).includes('Makefile'), 'a row dragged onto the desktop lands on it', [await toast(), await texts('.dicon .dname')]);

  const chosen = () => texts('.win.focus .row.sel .t');
  await row('README.md').click(); await until(async () => (await chosen()).join() === 'README.md');
  await row('into-files.txt').click({ modifiers: ['Control'] }); await until(async () => (await read('.win.focus .preview .nm')) === '2 items selected');
  check((await read('.win.focus .preview .nm')) === '2 items selected', 'Ctrl-click selects a second file', await read('.win.focus .preview .nm'));
  await p.keyboard.press('Delete');
  await until(async () => (await toast()).includes('Moved 2 items to the Trash') && !(await texts('.win.focus .row .t')).includes('README.md') && !!(await p.$('.dtile.c-trash.full')));
  check((await toast()).includes('Moved 2 items to the Trash') && !(await texts('.win.focus .row .t')).includes('README.md'), 'Delete moves both to the Trash', [await toast(), await texts('.win.focus .row .t')]);
  check(!!(await p.$('.dtile.c-trash.full')), 'and the Trash says it has something in it', null);
  await p.locator('.toast .tundo').click();
  await until(async () => (await texts('.win.focus .row .t')).includes('README.md') && (await texts('.win.focus .row .t')).includes('into-files.txt'));
  check((await texts('.win.focus .row .t')).includes('README.md') && (await texts('.win.focus .row .t')).includes('into-files.txt'), 'Undo puts them back', await texts('.win.focus .row .t'));
  await row('README.md').click(); await until(async () => (await chosen()).join() === 'README.md');
  await p.locator('.win.focus .pactions button', { hasText: 'Delete' }).click(); await until(async () => !(await texts('.win.focus .row .t')).includes('README.md'));
  await icon('Trash').dblclick();
  await until(async () => (await front()) === 'Trash' && (await texts('.win.focus .row .t')).join() === 'README.md' && (await texts('.win.focus .row .r.dim'))[1] === 'Desktop/demo/wordcount');
  check((await p.textContent('.win.focus .tt')) === 'Trash' && (await texts('.win.focus .row .t')).join() === 'README.md', 'the Trash window lists what was deleted', await texts('.win.focus .row .t'));
  check((await texts('.win.focus .row .r.dim'))[1] === 'Desktop/demo/wordcount', 'and where it came from', await texts('.win.focus .row .r.dim'));
  await row('README.md').click(); await until(async () => (await chosen()).join() === 'README.md');
  await p.locator('.win.focus .pactions button', { hasText: 'Restore' }).click();
  await until(async () => (await texts('.win.focus .empty')).join().includes('The Trash is empty') && (await toast()).includes('Restored README.md'));
  check((await texts('.win.focus .empty')).join().includes('The Trash is empty') && (await toast()).includes('Restored README.md'), 'Restore takes it out of the Trash', [await toast(), await texts('.win.focus .empty')]);
  await dragOnto(icon('Makefile'), icon('Trash'), '→ the Trash');
  await until(async () => (await texts('.win.focus .row .t')).join() === 'Makefile' && !(await texts('.dicon .dname')).includes('Makefile'));
  check((await texts('.win.focus .row .t')).join() === 'Makefile' && !(await texts('.dicon .dname')).includes('Makefile'), 'an icon dragged onto the Trash goes in it', [await texts('.win.focus .row .t'), await texts('.dicon .dname')]);
  // The first press asks, and the button that answers is what the second press waits for.
  await p.locator('.win.focus .ftop button', { hasText: 'Empty Trash' }).click();
  await p.locator('.win.focus .ftop button', { hasText: 'Empty for good?' }).click();
  await until(async () => (await texts('.win.focus .empty')).join().includes('The Trash is empty') && !(await p.$('.dtile.c-trash.full')));
  check((await texts('.win.focus .empty')).join().includes('The Trash is empty') && !(await p.$('.dtile.c-trash.full')), 'Empty Trash, asked twice, empties it', await texts('.win.focus .empty'));

  await p.locator('.tbwin', { hasText: 'wordcount' }).click();
  await until(async () => (await front()) === 'wordcount' && (await texts('.win.focus .row .t')).includes('README.md'));
  check((await texts('.win.focus .row .t')).includes('README.md'), 'and the restored file is back where it was', await texts('.win.focus .row .t'));
  await row('src').click(); await until(async () => (await chosen()).join() === 'src');
  await p.locator('.win.focus .pactions button', { hasText: 'Cut' }).click(); await until(async () => (await toast()).includes('Cut src'));
  await crumb('demo').click(); await until(async () => (await crumbs()).pop() === 'demo' && (await texts('.win.focus .row .t')).includes('wordcount'));
  await p.locator('.win.focus .ftop button', { hasText: 'Paste' }).click();
  await until(async () => (await texts('.win.focus .row .t')).includes('src') && (await toast()).includes('Moved src to demo'));
  check((await texts('.win.focus .row .t')).includes('src') && (await toast()).includes('Moved src to demo'), 'Cut and Paste move a folder', [await toast(), await texts('.win.focus .row .t')]);
  await row('src').dblclick(); await until(async () => (await crumbs()).pop() === 'src' && (await texts('.win.focus .row .t')).includes('shell.txt'));
  check((await texts('.win.focus .row .t')).includes('shell.txt'), 'with everything in it', await texts('.win.focus .row .t'));
  await shot('5-moved');

  // The Calculator: clicked, and typed. Its keys go to its worker in the order they are pressed, so only what they add
  // up to is waited for.
  const cmain = () => read('.win.focus .cmain'), csub = () => read('.win.focus .csub');
  const kept = () => texts('.win.focus .chrow .cha');
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'Calculator' }).click();
  await until(async () => (await front()) === 'Calculator' && !!(await p.$('.win.focus .ck')), 30000);
  for (const k of ['7', '×', '6', '=']) await p.locator('.win.focus .ck').filter({ hasText: new RegExp(`^${k}$`) }).click();
  await until(async () => (await cmain()) === '42');
  check((await p.textContent('.win.focus .cmain')) === '42', 'the Calculator works out 7 × 6 from its keys', await p.textContent('.win.focus .cmain'));
  await p.keyboard.type('(1+2)*3'); await until(async () => (await csub()) === '= 9');
  check((await p.textContent('.win.focus .csub')) === '= 9', 'and shows the answer as a sum is typed', await p.textContent('.win.focus .csub'));
  await p.keyboard.press('Enter'); await until(async () => (await kept()).join() === '42,9');
  await p.keyboard.type('200+10%');
  // Read once the program has drawn it: its window draws a moment after the keys, later on a loaded machine.
  await p.waitForFunction(() => __deep('.win.focus .program-body >>> .csub')?.textContent === '= 220', null, { timeout: 3000 }).catch(() => {});
  check((await p.textContent('.win.focus .csub')) === '= 220', 'a percentage added is a percentage of what it is added to', await p.textContent('.win.focus .csub'));
  await p.keyboard.press('Escape'); await p.keyboard.type('0.1+0.2'); await p.keyboard.press('Enter'); await until(async () => (await cmain()) === '0.3');
  check((await p.textContent('.win.focus .cmain')) === '0.3', '0.1 + 0.2 is 0.3', await p.textContent('.win.focus .cmain'));
  await p.keyboard.type('1/0'); await p.keyboard.press('Enter'); await until(async () => (await csub()) === "Can't divide by zero");
  check((await p.textContent('.win.focus .csub')) === "Can't divide by zero", 'and dividing by zero says so', await p.textContent('.win.focus .csub'));
  check((await texts('.win.focus .chrow .cha')).join() === '42,9,0.3', 'the sums worked out are kept above', await texts('.win.focus .chrow .cha'));
  await shot('6-calculator');

  // It keeps its sum in its own folder: closed and started again, the sum is still there. Closed once it is written.
  await p.keyboard.press('Escape'); await p.keyboard.type('5+5');
  await until(async () => (await csub()) === '= 10' && (await stored('.apps/calc/sum')) === '5+5');
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Calculator')));
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'Calculator' }).click();
  await p.waitForFunction(() => { const e = __deep('.win.focus .program-body >>> .csub'); return e !== null && e.textContent === '= 10'; }, null, { timeout: 15000 }).catch(() => {});
  check((await p.textContent('.win.focus .csub').catch(() => '')) === '= 10', 'started again, the Calculator has the sum it had', await read('.win.focus .csub'));
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Calculator')));

  // A new file from the Editor is saved where the desktop says: on the Desktop, under the name typed.
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'Text editor' }).click();
  await p.waitForSelector('.win.focus .ename', { timeout: 15000 }).catch(() => {});
  await p.locator('.win.focus .ename').fill('fresh.txt');
  await p.locator('.win.focus textarea').fill('written in a new file\n');
  await p.locator('.win.focus .editor button', { hasText: 'Save' }).click();
  await p.waitForFunction(() => [...document.querySelectorAll('.dicon .dname')].some((e) => e.textContent === 'fresh.txt'), null, { timeout: 10000 }).catch(() => {});
  check((await texts('.dicon .dname')).includes('fresh.txt') && (await p.textContent('.win.focus .estate')) === 'Saved' && (await p.textContent('.win.focus .tt')) === 'fresh.txt',
        'a new file from the Editor lands on the Desktop', [await texts('.dicon .dname'), await read('.win.focus .estate'), await read('.win.focus .tt')]);
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('fresh.txt')));

  // `exit` ends the Terminal, and its window closes.
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'Terminal' }).click();
  await p.waitForSelector('.win.focus .tcmd', { timeout: 15000 }).catch(() => {});
  const terms = (await texts('.win .tt')).filter((t) => t === 'Terminal').length;
  const termsNow = async () => (await texts('.win .tt')).filter((t) => t === 'Terminal').length;
  await p.locator('.win.focus .tcmd').fill('exit'); await p.locator('.win.focus .tcmd').press('Enter'); await until(async () => (await termsNow()) === terms - 1);
  check((await texts('.win .tt')).filter((t) => t === 'Terminal').length === terms - 1, '`exit` ends the Terminal and closes its window', await texts('.win .tt'));

  // **The launcher**: a search by what an entry is for, groups that fold and stay folded, and a list that scrolls
  // when the window is short. Typed into once its search field has the keyboard.
  const searching = () => p.evaluate(() => { let e = document.activeElement; while (e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement; return !!e?.classList.contains('lq'); });
  const offers = () => texts('.launcher .litem .lt');
  // A resize reaches the page's program as an event the next frame, after which what is sent to it comes after it.
  const frames = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.locator('.tblaunch').click(); await until(searching);
  await p.keyboard.type('shell'); await until(async () => (await offers()).join() === 'Terminal');
  check((await texts('.launcher .litem .lt')).join() === 'Terminal', 'searching the launcher for "shell" finds the Terminal', await texts('.launcher .litem .lt'));
  await p.keyboard.press('Enter');
  await p.waitForSelector('.win.focus .tcmd', { timeout: 15000 }).catch(() => {});
  check((await p.textContent('.win.focus .tt').catch(() => '')) === 'Terminal', 'and Enter opens it', await texts('.win .tt'));
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => (await termsNow()) === terms - 1);
  await p.locator('.tblaunch').click();
  // An open launcher does not redraw a group it folds or unfolds, so there is nothing to wait for there: the click
  // reaches the desktop before the Escape after it does, and the launcher opened again shows what it did.
  await p.locator('.lgroup', { hasText: 'Tools' }).click();
  await p.keyboard.press('Escape'); await until(async () => !(await p.$('.launcher')));
  await p.locator('.tblaunch').click(); await until(async () => { const l = await offers(); return !l.includes('Calculator') && l.includes('Terminal'); });
  const shown = await texts('.launcher .litem .lt');
  check(!shown.includes('Calculator') && shown.includes('Terminal'), 'a folded group stays folded', shown);
  await p.locator('.lgroup', { hasText: 'Tools' }).click();
  const fits = () => p.$eval('.launcher', (l) => { const r = l.getBoundingClientRect(); const list = l.querySelector('.llist'); return { top: r.top, scrolls: list.scrollHeight > list.clientHeight }; });
  await p.setViewportSize({ width: 1440, height: 420 }); await frames(); await until(async () => { const f = await fits(); return f.top >= 0 && f.scrolls; });
  const fit = await fits();
  check(fit.top >= 0 && fit.scrolls, 'on a short screen the launcher fits, and its list scrolls', fit);
  await p.setViewportSize({ width: 1440, height: 900 }); await frames();
  await p.keyboard.press('Escape'); await until(async () => !(await p.$('.launcher')));

  // **The wac IDE is a program on the site**, its projects a folder of the desktop's disk: a new project checks in
  // the IDE's own checker process, and Build writes the module beside its source, where Files shows it.
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'wac IDE' }).click();
  await p.waitForSelector('.win.focus .home .btn.primary', { timeout: 30000 }).catch(() => {});
  await p.locator('.win.focus .home .btn.primary').click();
  // Checked once the status is neither Checking nor Not checked and the bar says how the check went: a project just
  // opened shows the last one's status until its own check starts, but its bar starts empty.
  const ideChecked = async () => {
    await until(async () => {
      const s = await read('.win.focus .status');
      return s !== '' && !s.includes('Checking') && !s.includes('Not checked') && /files checked in|could not check/.test(await read('.win.focus .program-body .bar'));
    }, 90000);
    return read('.win.focus .status');
  };
  check((await ideChecked()) === 'No problems', 'the wac IDE makes a project and checks it', await read('.win.focus .status'));
  await p.locator('.win.focus .btn', { hasText: 'Build' }).click();
  await p.waitForFunction(() => { const e = __deep('.win.focus .program-body >>> .toast'); return e !== null && /Built|could not|did not/.test(e.textContent); }, null, { timeout: 90000 }).catch(() => {});
  check((await read('.win.focus .toast')).includes('Built main.wasm —'), 'and Build writes the module beside its source', await read('.win.focus .toast'));
  await shot('8-ide');

  // **A page program run from the IDE draws in a window of its own**, titled as it titles itself; a click there
  // reaches it, and closing the window stops it. The projects screen's buttons are waited for by the clicks on them.
  await p.locator('.win.focus .proj').click();
  await p.locator('.win.focus .home .newpage').click();
  check((await ideChecked()) === 'No problems', 'a page project checks in the IDE, web from its own cache', await read('.win.focus .status'));
  await p.locator('.win.focus .top .btn', { hasText: 'Run' }).click();
  await p.waitForFunction(() => [...document.querySelectorAll('.win .tt')].some((e) => e.textContent === 'Counter'), null, { timeout: 90000 }).catch(() => {});
  const counter = p.locator('.win', { has: p.locator('.tt', { hasText: /^Counter$/ }) });
  await counter.locator('.count').waitFor({ timeout: 15000 }).catch(() => {});
  check((await counter.locator('.count').textContent().catch(() => '')) === '0', 'Run shows a page program in a window of its own', await texts('.win .tt'));
  await counter.locator('.up').click(); await until(async () => (await inWin('Counter', '.count')) === '1');
  check((await counter.locator('.count').textContent().catch(() => '')) === '1', 'and a click in it reaches the program', await inWin('Counter', '.count'));
  await shot('8a-page');
  await counter.locator('.wbtn[title=Close]').click(); await until(async () => (await inWin('page', '.output')).includes('— stopped'));
  const ide = p.locator('.win', { has: p.locator('.tt', { hasText: /^page$/ }) });
  check((await ide.locator('.output').textContent().catch(() => '')).includes('— stopped'), 'closing its window stops it', await inWin('page', '.output'));
  if ((await front()) !== 'page') { await p.locator('.tbwin', { has: p.locator('.t', { hasText: /^page$/ }) }).click(); await until(async () => (await front()) === 'page'); }

  // **One IDE, a window per project.** A second project in this window, the first in a window of its own: both
  // are the one program, and a reload brings both back.
  // A window brought forward by its taskbar button, as a person would, unless it is in front already; then closed.
  const closeWin = async (title) => {
    const exact = new RegExp(`^${title}$`);
    if ((await front()) !== title) {
      await p.locator('.tbwin', { has: p.locator('.t', { hasText: exact }) }).click(); await until(async () => (await front()) === title);
    }
    await p.locator('.win.focus .wbtn[title=Close]').click();
  };
  const ideWindows = async () => (await texts('.win .tt')).filter((t) => t === 'hello' || t === 'hello 2').sort().join();
  // What a reload of the IDE brings back: the desktop's layout starts the IDE again, which opens the windows its own
  // state lists. Those are waited for, not the layout's titles, which can lag: a click on Close is a press on the title
  // bar, and the layout is not saved while a press the desktop has not seen end is open.
  const ideSaved = async (want) => {
    const projects = ((await stored('.apps/ide/ide/state')) ?? '').split('\n').filter((l) => l.startsWith('window\t')).map((l) => l.split('\t')[1]).sort().join();
    return projects === want && (await savedWindows()).some((x) => x.app === 'start:ide');
  };
  await p.locator('.win.focus .proj').click();
  await p.locator('.win.focus .home .btn.primary').click();
  check((await ideChecked()) === 'No problems', 'a second project opens in the same window', await read('.win.focus .tt'));
  await p.locator('.win.focus .proj').click();
  await p.locator('.win.focus .pcard', { has: p.locator('.nm', { hasText: /^hello$/ }) }).locator('.btn[title="Open in a window of its own"]').click();
  await p.waitForFunction(() => [...document.querySelectorAll('.win .tt')].some((e) => e.textContent === 'hello'), null, { timeout: 30000 }).catch(() => {});
  // Until the new window has drawn its project, and the one it left is back on the projects screen.
  await until(async () => (await inWin('hello', '.status')) !== '' && (await titled('wac IDE')), 30000);
  // The first window goes back to the second project.
  const firstIde = p.locator('.win', { has: p.locator('.tt', { hasText: /^wac IDE$/ }) });
  await p.locator('.tbwin', { hasText: 'wac IDE' }).click(); await until(async () => (await front()) === 'wac IDE');
  await firstIde.locator('.pcard', { has: p.locator('.nm', { hasText: /^hello 2$/ }) }).click();
  await until(async () => (await ideWindows()) === 'hello,hello 2' && (await texts('.tbwin')).filter((t) => t.startsWith('hello')).length === 2);
  check(await ideWindows() === 'hello,hello 2', 'a project opens in a window of its own, beside the other', await texts('.win .tt'));
  check((await texts('.tbwin')).filter((t) => t.startsWith('hello')).length === 2, 'each with its own button on the taskbar', await texts('.tbwin'));
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'wac IDE' }).click(); await until(async () => !(await p.$('.launcher')));
  // A second IDE would be a window that appears: there is nothing to wait for but time, so a second goes by first.
  await settle(1000);
  check(await ideWindows() === 'hello,hello 2' && !(await texts('.win .tt')).includes('wac IDE'), 'the launcher brings the IDE forward, not a second IDE', await texts('.win .tt'));
  await until(() => ideSaved('hello,hello 2'));
  await p.reload();
  await p.waitForSelector('.dicons', { timeout: 20000 });
  await p.waitForFunction(() => [...document.querySelectorAll('.win .tt')].filter((e) => e.textContent === 'hello' || e.textContent === 'hello 2').length === 2, null, { timeout: 60000 }).catch(() => {});
  check(await ideWindows() === 'hello,hello 2', 'a reload brings both project windows back', await texts('.win .tt'));
  // Closed, a window is forgotten; the other goes on, and a reload brings back only it.
  await closeWin('hello'); await until(async () => (await ideWindows()) === 'hello 2');
  check(await ideWindows() === 'hello 2', 'closing one project window leaves the other', await texts('.win .tt'));
  await until(() => ideSaved('hello 2'));
  await p.reload();
  await p.waitForSelector('.dicons', { timeout: 20000 });
  await p.waitForFunction(() => [...document.querySelectorAll('.win .tt')].some((e) => e.textContent === 'hello 2'), null, { timeout: 60000 }).catch(() => {});
  // For something not to happen — the closed window coming back — there is only time to wait. The IDE opens the
  // windows it brings back together, so a second after the one is plenty for the other.
  await settle(1000);
  check(await ideWindows() === 'hello 2', 'and after a reload it stays closed', await texts('.win .tt'));
  await closeWin('hello 2'); await until(async () => (await ideWindows()) === '');
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'Files' }).first().click();
  await row('Projects').dblclick(); await until(async () => (await crumbs()).pop() === 'Projects');
  await row('hello').dblclick();
  await until(async () => { const l = await texts('.win.focus .row .t'); return (await crumbs()).pop() === 'hello' && l.includes('main.wac') && l.includes('main.wasm'); });
  const projectRows = await texts('.win.focus .row .t');
  check(projectRows.includes('main.wac') && projectRows.includes('main.wasm'),
        'the project is a folder Files shows, the module beside its source', projectRows);
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('hello')));

  // **The desktop's own site**, over http: read-only at /site, and the Archive Explorer started from it, a
  // program like any other.
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'Terminal' }).click();
  const siteOut = await run('ls /site/apps; wc -c /site/apps/explorer.wasm; echo x > /site/x');
  const wasmSize = fs.statSync(path.join(root, 'dist', 'apps', 'explorer.wasm')).size;
  check(siteOut.includes('explorer.wasm') && siteOut.includes(String(wasmSize)), 'over http, the site is at /site', siteOut.slice(-200));
  check(/read-only/i.test(siteOut), 'and cannot be written', siteOut.slice(-200));
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Terminal')));
  await p.locator('.tblaunch').click(); await p.locator('.litem', { hasText: 'Archive Explorer' }).click();
  await p.waitForFunction(() => { const e = document.querySelector('.win.focus .program-body'); return e !== null && (e.shadowRoot ?? e).textContent.includes('Drop a file or folder'); }, null, { timeout: 15000 }).catch(() => {});
  check((await p.$eval('.win.focus .program-body', (e) => (e.shadowRoot ?? e).textContent).catch(() => '')).includes('Drop a file or folder'), 'the Archive Explorer starts from the site, in a window', await read('.win.focus'));
  check((await read('.win.focus .tt')) === 'Archive Explorer', 'titled as it titles itself', await read('.win.focus .tt'));
  await shot('7-explorer');
  await p.locator('.win.focus .wbtn[title=Close]').click(); await until(async () => !(await titled('Archive Explorer')));

  // From a file: no storage. It must say so, and still work.
  const q = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  q.on('pageerror', (e) => errors.push('file:// ' + e.message));
  const qTitles = () => q.$$eval('.win .tt', (l) => l.map((x) => x.textContent));
  await q.goto('file://' + html);
  await q.waitForSelector('.dicons', { timeout: 20000 });
  await until(async () => (await read('.pill', q)).includes('Not saved') && (await q.$$eval('.dicon .dname', (l) => l.map((x) => x.textContent))).join() === 'Home,Trash,Welcome.md,demo.zip'
                          && (await qTitles()).join() === 'Desktop');
  check((await q.textContent('.pill')).includes('Not saved'), 'from file:// it says nothing is kept', await q.textContent('.pill'));
  check((await q.$$eval('.dicon .dname', (l) => l.map((x) => x.textContent))).join() === 'Home,Trash,Welcome.md,demo.zip', 'and still starts with something to open', null);
  // **The desktop's own apps are on its site, and from a file there is none** (the owner's choice): Welcome.md opens
  // its folder in Files, where the preview shows it, and the launcher offers only what is the desktop's itself,
  // Settings among it.
  check((await q.$$eval('.win .tt', (l) => l.map((x) => x.textContent))).join() === 'Desktop', 'from file://, Welcome.md opens its folder in Files', await q.$$eval('.win .tt', (l) => l.map((x) => x.textContent)));
  await q.locator('.tblaunch').click();
  await q.waitForSelector('.litem', { timeout: 5000 }).catch(() => {});
  const offered = await q.$$eval('.litem .lt', (l) => l.map((x) => x.textContent));
  check(offered.join() === 'Files,Desktop,Trash,Permissions,Settings,Welcome', 'and the launcher offers no app from a site', offered);
  await q.locator('.tblaunch').click(); await until(async () => !(await q.$('.launcher')));
  if (shots) { await q.screenshot({ path: path.join(shots, 'desk-8-file.png') }); }
  await q.locator('.dicon', { hasText: 'demo.zip' }).dblclick();
  await until(async () => (await q.$$eval('.win.focus .crumb .t', (l) => l.map((x) => x.textContent))).includes('demo.zip'));
  check((await q.$$eval('.win.focus .crumb .t', (l) => l.map((x) => x.textContent))).includes('demo.zip'), 'and demo.zip still opens', null);

  // Its taskbar button brings it forward, unless it is in front already — where a click would put it away.
  if ((await front(q)) !== 'demo.zip') { await q.locator('.tbwin', { hasText: 'demo.zip' }).click(); await until(async () => (await front(q)) === 'demo.zip'); }
  await q.locator('.win.focus .wbtn[title=Close]').click({ delay: 150 }); await until(async () => !(await qTitles()).includes('demo.zip'));
  check(!(await q.$$eval('.win .tt', (l) => l.map((x) => x.textContent))).includes('demo.zip'), 'a slow press on Close closes', null);

  check(errors.length === 0, 'no page errors', errors);
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `${failed} failed` : 'the desktop behaved');
  process.exit(failed ? 1 : 0);
})();
