#!/usr/bin/env node
// Pip and the Lost Lanterns as a desktop program, in Chromium against dist/: found in the launcher, started from its
// title, played with the keys, heard — every sound the page starts and stops is counted by a script added before the
// desktop's own — measured in its latency corner, paused, muted, and silenced when its window closes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.join(__dirname, '..', 'dist');
const shots = process.env.SHOTS || '';

const WATCH = `
  window.__played = []; window.__stopped = 0;
  const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (...a) { window.__played.push([this.buffer.length, this.loop, a[0] ?? 0, Math.round((a[1] ?? 0) * 1e6)]); return start.apply(this, a); };
  window.__ramps = [];
  const ramp = AudioParam.prototype.linearRampToValueAtTime;
  AudioParam.prototype.linearRampToValueAtTime = function (v, t) { window.__ramps.push(Math.round(v * 100) / 100); return ramp.call(this, v, t); };
  AudioBufferSourceNode.prototype.stop = function (...a) { window.__stopped++; return stop.apply(this, a); };
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await context.newPage();
    await p.addInitScript(WATCH);
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`http://localhost:${server.address().port}/`);
    await p.waitForSelector('.dicons');
    const ok = (what) => console.log('ok   ' + what);
    const settle = (ms = 300) => p.waitForTimeout(ms);

    await p.locator('.tblaunch').click();
    await p.locator('.lq').fill('platformer');
    await p.keyboard.press('Enter');
    const card = p.locator('.pcard h1');
    await card.waitFor({ timeout: 60000 });
    assert.equal(await card.textContent(), 'Pip and the Lost Lanterns');
    assert.equal(await p.locator('.plevel').count(), 19, 'nineteen levels on the title');
    ok('found by "platformer"; its title lists nineteen levels');
    if (shots) await p.screenshot({ path: path.join(shots, 'pip-1.png') });

    await p.keyboard.press('Enter');
    await p.locator('.pcard').waitFor({ state: 'detached' });
    const hud = p.locator('.phud');
    await settle();
    assert.match(await hud.textContent(), /^First Light · Lanterns 0\/4 · 0:0/, await hud.textContent());
    // The title's song, then the fields': each seven layers, every one looping, all started for the same moment.
    await p.waitForFunction(() => window.__played.filter(([n, loop]) => loop).length === 14, null, { timeout: 10000 });
    // Together: the same moment, from the same way in — a moment already gone when they arrive starts them now, each
    // as far in as it would have got.
    const layers = await p.evaluate('window.__played.filter(([n, loop]) => loop).slice(7).map(([n, l, when, from]) => when + "/" + from)');
    assert.equal(new Set(layers).size, 1, `the layers start together: ${layers}`);
    ok(`Enter starts First Light, and its song's seven layers together: ${await hud.textContent()}`);

    const sounds = await p.evaluate('window.__played.length');
    await p.keyboard.down('ArrowRight');
    await settle(700);
    await p.keyboard.press('Space');
    await settle(500);
    await p.keyboard.up('ArrowRight');
    await p.waitForFunction((n) => window.__played.length > n, sounds, { timeout: 5000 });
    ok('a jump is heard');
    if (shots) await p.screenshot({ path: path.join(shots, 'pip-2.png') });

    const lat = await p.locator('.plat').textContent();
    assert.match(lat, /key → program\d+ ms/, lat);
    assert.match(lat, /key → on screen, by\d+ ms/, lat);
    assert.match(lat, /key → jump sound sent\d+ ms/, lat);
    ok('the latency corner: ' + lat.replace(/\s+/g, ' '));

    await p.evaluate('window.__ramps = []');
    await p.keyboard.press('p');
    await p.locator('.pcard h1', { hasText: 'Paused' }).waitFor();
    await p.waitForFunction(() => window.__ramps.includes(0.28), null, { timeout: 5000 });
    const paused = await hud.textContent();
    await settle(600);
    assert.equal(await hud.textContent(), paused, 'the clock stops while paused');
    await p.keyboard.press('Enter');
    await p.locator('.pcard').waitFor({ state: 'detached' });
    await p.waitForFunction(() => window.__ramps.includes(0.8), null, { timeout: 5000 });
    ok('P pauses, the clock stops, and the music ducks and comes back');

    // Enter pauses too; the pause card lists the levels, the one being played marked, and Enter goes on with it.
    await p.keyboard.press('Enter');
    await p.locator('.pcard h1', { hasText: 'Paused' }).waitFor();
    assert.equal(await p.locator('.pcard .plevel').count(), 19, 'the levels, on the pause card');
    assert.equal(await p.locator('.pcard .plevel.here.on').textContent().then((t) => t.includes('First Light')), true);
    // Only the first level is reached on a new disk: the arrows have nowhere else to go, and a locked one is no choice.
    await p.keyboard.press('ArrowRight');
    assert.equal(await p.locator('.pcard .plevel.on').count(), 1);
    assert.equal(await p.locator('.pcard .plevel.here.on').count(), 1, 'nothing past the furthest reached');
    const pausedAt = await hud.textContent();
    await p.waitForTimeout(400);
    assert.equal(await hud.textContent(), pausedAt, 'the clock stops');
    await p.keyboard.press('Enter');
    await p.locator('.pcard').waitFor({ state: 'detached' });
    ok('Enter pauses; the pause card lists the levels; Enter goes on');
    // A click on the level being played goes on with it, too.
    await p.keyboard.press('Enter');
    await p.locator('.pcard h1', { hasText: 'Paused' }).waitFor();
    await p.waitForFunction(() => window.__ramps.includes(0.28), null, { timeout: 5000 });
    await p.evaluate('window.__ramps = []');
    await p.locator('.pcard .plevel.here').click();
    await p.locator('.pcard').waitFor({ state: 'detached' });
    assert.match(await hud.textContent(), /^First Light/);
    // The music back up before going on, so what M does is all that is heard next.
    await p.waitForFunction(() => window.__ramps.includes(0.8), null, { timeout: 5000 });
    ok('a click on the level being played goes on with it');

    await p.evaluate('window.__ramps = []');
    await p.keyboard.press('m');
    await p.waitForFunction(() => window.__ramps.includes(0) && !window.__ramps.includes(0.8), null, { timeout: 5000 });
    assert.match(await hud.textContent(), /Muted/);
    await p.keyboard.press('m');
    await p.waitForFunction(() => window.__ramps.includes(0.8), null, { timeout: 5000 });
    ok('M fades the music out, and back in');

    const before = await p.evaluate('window.__stopped');
    await p.locator('.win', { has: p.locator('.pip') }).locator('.wbtn.close, .tbtn.close, [title="Close"]').first().click();
    await p.waitForFunction((n) => window.__stopped > n, before, { timeout: 5000 });
    ok('closing the window silences it');

    // Further on: seven levels reached, written where Pip keeps them from the Terminal, and Pip started again.
    await p.locator('.tblaunch').click();
    await p.locator('.lq').fill('shell');
    await p.keyboard.press('Enter');
    const cmd = p.locator('.win.focus .tcmd');
    await cmd.waitFor({ timeout: 60000 });
    await cmd.fill('mkdir -p /.apps/pip && echo 6 > /.apps/pip/best && cat /.apps/pip/best');
    await cmd.press('Enter');
    await p.locator('.win.focus .tout', { hasText: /\n6\n/ }).waitFor({ timeout: 10000 });
    await p.locator('.win.focus .wbtn.close').click();
    await p.locator('.tblaunch').click();
    await p.locator('.lq').fill('platformer');
    await p.keyboard.press('Enter');
    await card.waitFor({ timeout: 60000 });
    await p.keyboard.press('Enter');
    await p.locator('.pcard').waitFor({ state: 'detached' });
    const seventh = (await hud.textContent()).split(' · ')[0];
    await p.keyboard.press('Enter');
    await p.locator('.pcard h1', { hasText: 'Paused' }).waitFor();
    assert.equal(await p.locator('.pcard .plevel:not(.locked)').count(), 7, 'seven to choose from');
    await p.keyboard.press('ArrowLeft');
    const chosen = p.locator('.pcard .plevel.on:not(.here)');
    await chosen.waitFor({ timeout: 5000 });
    const sixth = (await chosen.textContent()).replace(/^\d+\s*/, '');
    assert.ok(!sixth.startsWith(seventh), 'the arrow chose another');
    assert.match(await p.locator('.pgo').textContent(), /Press Enter to play/);
    if (shots) await p.screenshot({ path: path.join(shots, 'pip-pause.png') });
    await p.keyboard.press('Enter');
    await p.locator('.pcard').waitFor({ state: 'detached' });
    const now = (await hud.textContent()).split(' · ')[0];
    assert.ok(sixth.startsWith(now), `playing the level chosen: ${now}, chosen ${sixth}`);
    ok(`from ${seventh}, the pause card chose ${now}, and Enter played it`);
    await p.keyboard.press('Escape');
    await p.locator('.pcard h1', { hasText: 'Paused' }).waitFor();
    await p.keyboard.press('1');
    await p.locator('.pcard').waitFor({ state: 'detached' });
    assert.match(await hud.textContent(), /^First Light · Lanterns 0\//);
    ok('and 1, paused, plays the first');

    assert.deepEqual(errors, [], 'no page errors');
    ok('no page errors');
    console.log('Pip behaved');
  } catch (e) {
    console.error('FAIL ' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
