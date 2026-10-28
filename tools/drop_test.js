#!/usr/bin/env node
// Real drops on the built page, in Chromium, the way a person makes them: a file, a folder, and both
// at once — on a page opened from file:// and one served over http://, and with the browser's folder
// API present, missing (as in Brave, Firefox, Safari) and refusing (as in a sandboxed frame).
//
//     node tools/drop_test.js            after `wac task build`; needs Playwright
//
// Drops go through the DevTools protocol (Input.dispatchDragEvent), so the browser builds the
// DataTransfer itself — real entries, real handles — which no synthetic event can.

const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const root = path.join(__dirname, '..');
const html = path.join(root, 'dist', 'explorer', 'index.html');
const zip = path.join(root, 'samples', 'demo.zip');
// A folder to drop: demo.zip's own contents, unpacked.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drop-'));
require('child_process').execFileSync('unzip', ['-q', zip, '-d', dir]);
const folder = path.join(dir, 'wordcount');
const loose = path.join(dir, 'loose.txt');
fs.writeFileSync(loose, 'loose\n');

const setups = {
  'folder API': () => {},
  'no folder API': () => { delete DataTransferItem.prototype.getAsFileSystemHandle; },
  'folder API refuses': () => { DataTransferItem.prototype.getAsFileSystemHandle = () => Promise.reject(new DOMException('no', 'SecurityError')); },
};
// What each drop should show: a breadcrumb, or (for a folder a file:// page cannot read) the advice.
const cases = [
  ['a file', [zip], () => 'demo.zip'],
  ['a folder', [folder], (origin, setup) => origin === 'file' && setup !== 'folder API' ? 'ADVICE' : 'wordcount'],
  ['a folder and a file', [folder, loose], (origin, setup) => origin === 'file' && setup !== 'folder API' ? 'ADVICE' : 'Dropped items'],
];

(async () => {
  const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(html)); }).listen(0);
  const url = { file: 'file://' + html, http: `http://localhost:${server.address().port}/` };
  const browser = await chromium.launch();
  let failed = 0;
  for (const origin of ['file', 'http']) for (const [setup, init] of Object.entries(setups)) for (const [what, files, want] of cases) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(init);
    await page.goto(url[origin]);
    await page.waitForSelector('.landing');
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await cdp.send('Input.dispatchDragEvent', { type, x: 300, y: 300, data: { items: [], files, dragOperationsMask: 1 } });
    }
    await page.waitForSelector('.shell, .error', { timeout: 10000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 10000 }).catch(() => {});
    const crumb = await page.$eval('.crumb .t', (e) => e.textContent).catch(() => null);
    const error = await page.$eval('.error', (e) => e.textContent).catch(() => null);
    const expected = want(origin, setup);
    const ok = expected === 'ADVICE' ? (error ?? '').includes('Choose a folder') : crumb === expected && error === null;
    if (!ok || errors.length) failed++;
    console.log(`${ok && !errors.length ? 'ok  ' : 'FAIL'} ${origin.padEnd(4)} ${setup.padEnd(18)} ${what.padEnd(20)} → ${error ?? crumb}${errors.length ? ' ' + errors : ''}`);
    await page.close();
  }
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed ? `${failed} failed` : 'all drops behaved');
  process.exit(failed ? 1 : 0);
})();
