#!/usr/bin/env node
// The desktop on a phone, in Chromium against dist/ as an iPhone 13 — touch, its size, its pixel ratio: a home screen
// of apps where a tap starts one; each app the whole screen; the phone's Back leaving an app for what was in front
// before, and Forward returning; what is open listed, to go to or close; a folder in Files opened with a tap; the same
// phone on its side still a phone; and a desktop's screen still a desktop, its address untouched.
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.join(__dirname, '..', 'dist');
const shots = process.env.SHOTS || '';

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
    const ok = (what) => console.log('ok   ' + what);
    const url = `http://localhost:${server.address().port}/`;
    const p = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const hash = () => p.evaluate('location.hash');
    // What is in front: a window's title, or the home screen — waited for, since Back is heard a moment after.
    const front = () => p.evaluate(() => {
      const w = [...document.querySelectorAll('.win')].filter((x) => !x.classList.contains('min'));
      const f = document.querySelector('.win.focus:not(.min) .tt');
      return w.length === 0 ? 'home' : (f ? f.textContent : '?');
    });
    const until = async (want, why) => {
      for (let i = 0; i < 100; i++) { if (await front() === want) return; await p.waitForTimeout(50); }
      assert.equal(await front(), want, why);
    };

    await p.goto(url);
    await p.waitForSelector('.desk.phone', { timeout: 30000 });
    // The first time, the welcome note opens — over the home screen, which Back returns to.
    await p.locator('.win.focus .md h1').first().waitFor({ timeout: 60000 });
    assert.match(await hash(), /^#w\d+$/);
    assert.equal(await p.locator('.win.focus .wbtn:visible').count(), 1, 'only Close on a phone');
    const box = await p.locator('.win.focus').boundingBox();
    assert.equal(Math.round(box.width), 390, 'the whole width');
    ok('a phone: the welcome note opens the whole width, with only Close, and is a place in the history');

    await p.goBack();
    await p.locator('.phome').waitFor();
    await until('home', 'Back: home');
    assert.equal(await hash(), '');
    const apps = await p.locator('.ptile .ptname').allTextContents();
    for (const a of ['Files', 'Settings', 'Calculator', 'Terminal', 'Pip and the Lost Lanterns', 'Welcome.md']) assert.ok(apps.includes(a), `${a} on the home screen: ${apps}`);
    if (shots) await p.screenshot({ path: path.join(shots, 'phone-home.png') });
    ok('Back: the home screen, its apps and the Desktop\'s files');

    await p.locator('.ptile', { hasText: 'Calculator' }).tap();
    await p.locator('.win.focus .calc').waitFor({ timeout: 60000 });
    const calc = await hash();
    await p.locator('.pbbtn[title="Home"]').tap();
    await p.locator('.ptile', { hasText: 'Files' }).first().tap();
    await p.locator('.win.focus .files').waitFor();
    await p.locator('.win.focus .row', { hasText: 'Desktop' }).tap();
    await p.locator('.win.focus .row', { hasText: 'demo.zip' }).waitFor();
    ok('a tap starts an app, and a tap opens a folder');

    await p.goBack();
    await until('home', 'Back from Files: home, where it was opened from');
    await p.goBack();
    await until('Calculator', 'and Back again: the Calculator');
    assert.equal(await hash(), calc);
    await p.goForward();
    await until('home', 'Forward: home');
    await p.goForward();
    await until('Desktop', 'Forward again: Files');
    ok('Back and Forward step through what was in front');

    await p.locator('.pbbtn[title="What is open"]').tap();
    await p.locator('.rcard').first().waitFor();
    const cards = await p.locator('.rcard .rt').allTextContents();
    assert.deepEqual(cards, ['Desktop', 'Calculator', 'Welcome.md'], 'what is open, the front first');
    assert.equal(await p.locator('.pbcount').textContent(), '3');
    if (shots) await p.screenshot({ path: path.join(shots, 'phone-open.png') });
    await p.locator('.rcard', { hasText: 'Calculator' }).locator('.rclose').tap();
    await p.waitForFunction(() => document.querySelectorAll('.rcard').length === 2);
    await p.locator('.rcard', { hasText: 'Welcome.md' }).locator('.rgo').tap();
    await until('Welcome.md', 'gone back to');
    ok('what is open: listed, one closed, one gone back to');

    // On its side the phone is wider than a desktop's narrowest, but too short for windows: still a phone.
    await p.setViewportSize({ width: 844, height: 390 });
    await p.waitForTimeout(500);
    assert.equal(await p.locator('.desk.phone').count(), 1, 'on its side, still a phone');
    ok('on its side, still a phone');

    // A desktop's screen: the desktop, and its address never touched.
    const q = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    q.on('pageerror', (e) => errors.push(e.message));
    await q.goto(url);
    await q.waitForSelector('.dicons');
    await q.locator('.win.focus .md h1').first().waitFor({ timeout: 60000 });
    assert.equal(await q.locator('.desk.phone').count(), 0);
    assert.equal(await q.evaluate('location.hash'), '');
    ok('a desktop is a desktop, its address untouched');

    assert.deepEqual(errors, [], 'no page errors');
    ok('no page errors');
    console.log('the phone behaved');
  } catch (e) {
    console.error('FAIL ' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
