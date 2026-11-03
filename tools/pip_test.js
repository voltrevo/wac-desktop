#!/usr/bin/env node
// Pip and the Lost Lanterns as a desktop program, in Chromium against dist/: found in the launcher, started from its
// title, played with the keys, heard — every sound the page starts and stops is counted by a script added before the
// desktop's own — measured in its latency corner, paused, muted, and silenced when its window closes.
const { chromium, devices } = require('playwright');
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

    // ── Speedrunning, all opt-in ──
    const pip = p.locator('.win', { has: p.locator('.pip') });
    const screenAt = (x, y) => p.locator('canvas.pscreen').evaluate((c, [x, y]) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)), [x, y]);
    // The options: keys held shown, and splits — off until chosen, and the choice kept.
    await p.keyboard.press('Escape');
    await p.locator('.pcard h1', { hasText: 'Paused' }).waitFor();
    await p.keyboard.press('o');
    await p.locator('.pcard h1', { hasText: 'Options' }).waitFor();
    assert.equal(await p.locator('.popt', { hasText: 'Keys held' }).locator('.pc.on').textContent(), 'Off', 'opt-in');
    await p.locator('.popt', { hasText: 'Keys held' }).locator('.pc', { hasText: 'On' }).click();
    await p.locator('.popt', { hasText: 'Splits' }).locator('.pc', { hasText: 'On' }).click();
    await p.locator('.popt', { hasText: 'Splits' }).locator('.pc.on', { hasText: 'On' }).waitFor();
    await p.keyboard.press('Escape');
    await p.locator('.pcard h1', { hasText: 'Paused' }).waitFor();
    ok('the Options card turns on the keys held and the splits');

    // A full run: the whole run's time at the top, the splits beside it, and a restart that keeps the time spent.
    await p.keyboard.press('f');
    await p.locator('.pcard').waitFor({ state: 'detached' });
    await p.waitForFunction(() => true);
    assert.match(await hud.textContent(), /^Full run 0:0\d\.\d .*First Light/, await hud.textContent());
    assert.match(await p.locator('.psplits').textContent(), /1 First Light.*No full run yet.*sum of best/, await p.locator('.psplits').textContent());
    await p.keyboard.down('ArrowRight');
    await p.waitForFunction(() => true);
    await p.waitForTimeout(300);
    // Bottom left, the right key's light: lit while it is held.
    assert.deepEqual(await screenAt(8, 163), [0x7f, 0xe0, 0x8a], 'the keys held, shown');
    await p.waitForTimeout(900);
    await p.keyboard.up('ArrowRight');
    await p.waitForTimeout(200);
    const spent = (await hud.textContent()).match(/^Full run (\S+)/)[1];
    await p.keyboard.press('r');
    await p.waitForTimeout(300);
    const after = (await hud.textContent()).match(/^Full run (\S+)/)[1];
    assert.ok(after >= spent && after !== '0:00.0', `a restart keeps the run's time: ${spent} then ${after}`);
    if (shots) await p.screenshot({ path: path.join(shots, 'pip-full.png') });
    ok(`a full run: its time along the top (${after} after a restart), its splits beside, the keys held below`);

    // A run brought in: added to the Desktop, chosen from the Replays card through the desktop's picker, and watched.
    await p.keyboard.press('Escape');
    await p.keyboard.press('t');
    await card.waitFor();
    await p.locator('.tblaunch').click();
    await p.locator('.lq').fill('desktop files');
    await p.keyboard.press('Enter');
    const files = p.locator('.win.focus .files');
    await files.waitFor();
    await files.locator('input[type=file]').setInputFiles(path.join(__dirname, 'first-light.piprun'));
    await p.locator('.toast', { hasText: 'Added 1 file' }).waitFor({ timeout: 10000 });
    await pip.locator('.tbar').click();
    await pip.locator('.pip').focus();
    await p.keyboard.press('v');
    await p.locator('.pcard h1', { hasText: 'Replays' }).waitFor();
    await p.locator('.pcard .plevel', { hasText: 'A run from a file' }).click();
    await p.locator('.pick .prow', { hasText: 'first-light.piprun' }).click();
    await p.locator('.pick .btn.primary').click();
    await p.locator('.phud', { hasText: 'Replay · First Light' }).waitFor({ timeout: 10000 });
    await p.waitForTimeout(1200);
    assert.match(await hud.textContent(), /^Replay · First Light · 0:01\.\d \/ 0:28\.0/, await hud.textContent());
    ok('a run brought in is checked, and watched: ' + await hud.textContent());
    await pip.locator('.pip').focus();
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press(' ');
    await p.locator('.phud', { hasText: '×2 · Paused' }).waitFor();
    const held = await hud.textContent();
    await p.keyboard.press('ArrowRight');
    await p.waitForFunction(() => true);
    await p.waitForTimeout(200);
    const seeked = await hud.textContent();
    assert.notEqual(seeked, held, 'five seconds on');
    assert.match(seeked, /· 0:0[6-9]\.\d \/ 0:28\.0/, seeked);
    if (shots) await p.screenshot({ path: path.join(shots, 'pip-replay.png') });
    ok('twice as fast, paused, and five seconds on: ' + seeked);
    // Saved again as a file — on the Desktop — and raced.
    await p.keyboard.press('x');
    await p.locator('.phud', { hasText: 'Saved on the Desktop as Pip level 1 0m28.0s.piprun' }).waitFor({ timeout: 10000 });
    await p.locator('.dicon', { hasText: 'Pip level 1 0m28.0s.piprun' }).waitFor({ timeout: 10000 });
    await p.keyboard.press('r');
    await p.locator('.phud', { hasText: 'racing a run brought in' }).waitFor();
    ok('saved on the Desktop as a file, and raced as the ghost');

    // ── On a phone: the controls on screen, played with two thumbs ──
    const ph = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
    ph.on('pageerror', (e) => errors.push(e.message));
    await ph.goto(`http://localhost:${server.address().port}/`);
    await ph.waitForSelector('.desk.phone', { timeout: 30000 });
    await ph.locator('.win.focus .md h1').first().waitFor({ timeout: 60000 });
    await ph.locator('.pbbtn[title="Home"]').tap();
    await ph.locator('.ptile', { hasText: 'Pip' }).tap();
    await ph.locator('.pcard h1').waitFor({ timeout: 60000 });
    // The title fits a phone: no keys to read, the levels two to a row, nothing cut off.
    assert.equal(await ph.locator('.pkeys').isVisible(), false, 'the keys are no use to a thumb');
    const fits = await ph.locator('.pcard').evaluate((c) => c.scrollWidth <= c.clientWidth + 1);
    assert.ok(fits, 'the title card fits the phone');
    // The keys held, shown — through the Options card's buttons.
    await ph.locator('.pbtn', { hasText: 'Options' }).tap();
    await ph.locator('.popt', { hasText: 'Keys held' }).locator('.pc', { hasText: 'On' }).tap();
    await ph.locator('.pbtn', { hasText: 'Back' }).tap();
    await ph.locator('.pbtn.go', { hasText: 'Play' }).tap();
    await ph.locator('.ppad').waitFor();
    const canvas = await ph.locator('canvas.pscreen').boundingBox();
    const padBox = await ph.locator('.ppad').boundingBox();
    const jumpBox = await ph.locator('.pjump').boundingBox();
    assert.ok(padBox.y >= canvas.y + canvas.height - 1 && jumpBox.y >= canvas.y + canvas.height - 1, 'upright, the controls are below the picture');
    ok('on a phone: the title fits, and upright the controls are below the picture');

    const cdp = await ph.context().newCDPSession(ph);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
    const light = (x, y) => ph.locator('canvas.pscreen').evaluate((c, [x, y]) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)), [x, y]);
    const RIGHT = [0x7f, 0xe0, 0x8a], JUMP = [0xff, 0xd4, 0x5c], OFF = [0x2a, 0x2e, 0x50];
    const lit = async (x, y, want, why) => {
      for (let i = 0; i < 60; i++) { if (JSON.stringify(await light(x, y)) === JSON.stringify(want)) return; await ph.waitForTimeout(50); }
      assert.deepEqual(await light(x, y), want, why);
    };
    const px = padBox.x + padBox.width * 0.3, py = padBox.y + padBox.height / 2;
    const jx = jumpBox.x + jumpBox.width / 2, jy = jumpBox.y + jumpBox.height / 2;
    await touch('touchStart', [[px, py, 1]]);
    await touch('touchMove', [[px + 30, py, 1]]);
    await lit(8, 163, RIGHT, 'the pad slid right runs right');
    await touch('touchStart', [[px + 30, py, 1], [jx, jy, 2]]);
    await lit(8, 170, JUMP, 'and Jump, with the other thumb, at the same time');
    await lit(8, 163, RIGHT, 'still running');
    await touch('touchEnd', [[jx, jy, 2]]);
    await lit(8, 170, OFF, 'Jump let go');
    // Slid off the pad, up over the picture, and lifted there: the pad still hears it, and lets go.
    await touch('touchMove', [[px + 30, canvas.y + 40, 1]]);
    await lit(8, 163, RIGHT, 'slid off the pad, still running');
    await touch('touchEnd', [[px + 30, canvas.y + 40, 1]]);
    await lit(8, 163, OFF, 'lifted off the pad, let go');
    assert.notEqual((await ph.locator('.plat').textContent()).match(/jump sound sent(\S+)/)[1], '–', 'the jump was heard, its latency measured');
    ok('two thumbs: the pad runs, Jump jumps, both at once, and a thumb slid off still lets go');

    await ph.locator('.ptbtn[title="Pause"]').tap();
    await ph.locator('.pcard h1', { hasText: 'Paused' }).waitFor();
    await ph.locator('.pbtn.go', { hasText: 'Go on' }).tap();
    await ph.locator('.pcard').waitFor({ state: 'detached' });
    await ph.setViewportSize({ width: 844, height: 390 });
    await ph.waitForTimeout(500);
    const wide = await ph.locator('canvas.pscreen').boundingBox();
    const jumpWide = await ph.locator('.pjump').boundingBox();
    assert.ok(jumpWide.y < wide.y + wide.height, 'on its side, the controls lie over the picture');
    if (shots) await ph.screenshot({ path: path.join(shots, 'pip-touch.png') });
    ok('the pause button and Go on; on its side, the controls over the picture');

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
