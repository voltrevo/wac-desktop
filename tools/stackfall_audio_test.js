#!/usr/bin/env node
// Observe actual Web Audio sources, not mocked game cues: the desktop must carry every start and stop.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.join(__dirname, '..', 'dist');
const WATCH = `
  window.__sfPlayed = []; window.__sfSources = [];
  const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const entry = { seconds:this.buffer.duration, loop:this.loop, stopped:false, ended:false };
    this.__sfEntry = entry; window.__sfPlayed.push(entry); window.__sfSources.push(this);
    this.addEventListener('ended', () => entry.ended = true);
    return start.apply(this, args);
  };
  AudioBufferSourceNode.prototype.stop = function (...args) {
    if (this.__sfEntry) this.__sfEntry.stopped = true;
    return stop.apply(this, args);
  };
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
    browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
    const context = await browser.newContext({ viewport:{width:1440,height:1000} });
    const p = await context.newPage(); await p.addInitScript(WATCH);
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    const settle = (ms=300) => p.waitForTimeout(ms);
    const played = () => p.evaluate(() => window.__sfPlayed.length);
    const loops = () => p.evaluate(() => window.__sfPlayed.filter(v => v.loop && !v.stopped && !v.ended).length);
    const silent = async () => { await p.waitForFunction(() => window.__sfPlayed.every(v => v.stopped || v.ended)); };
    const launch = async () => {
      await p.locator('.tblaunch').click();
      await p.locator('.lq').fill('Stackfall'); await p.keyboard.press('Enter');
      await p.locator('.sf').waitFor({timeout:60000}); await settle();
    };
    const game = p.locator('.sf');
    const win = p.locator('.win', {has:game});
    const startGame = async () => { await game.locator('.sf-primary').click(); await settle(); };
    const close = async () => { await win.locator('[title="Close"]').click(); await game.waitFor({state:'detached'}); await settle(); };
    // Set up deliberate, valid checkpoints using the same versioned save format as the game.
    const fixture = async kind => {
      await close();
      await p.evaluate(async kind => {
        const root = await navigator.storage.getDirectory();
        const apps = await root.getDirectoryHandle('.apps');
        const dir = await apps.getDirectoryHandle('stackfall');
        const file = await dir.getFileHandle('game.json');
        const g = JSON.parse(await (await file.getFile()).text());
        Object.assign(g,{board:Array(220).fill(0),piece:1,rotation:0,x:3,y:20,next:1,held:-1,heldOnce:false,score:0,lines:0,over:false,fallMs:0,lockMs:0,resets:0});
        if (kind === 'single') for (let x=0;x<10;x++) if (x!==4 && x!==5) g.board[210+x]=3;
        if (kind === 'level') {
          Object.assign(g,{piece:0,rotation:1,x:2,y:18,lines:9});
          for (let y=18;y<22;y++) for (let x=0;x<10;x++) if (x!==4) g.board[y*10+x]=3;
        }
        if (kind === 'over') g.board[14]=7;
        if (kind === 'turn') Object.assign(g,{piece:0,rotation:0,x:3,y:16});
        const w=await file.createWritable(); await w.write(JSON.stringify(g)); await w.close();
      }, kind);
      await launch(); await startGame();
    };
    const expectCue = async (since, duration) => {
      await p.waitForFunction(({since,duration}) => window.__sfPlayed.slice(since).some(v => !v.loop && Math.abs(v.seconds-duration)<0.002), {since,duration});
    };
    await p.goto(`http://localhost:${server.address().port}/`); await p.waitForSelector('.dicons'); await launch();
    assert.equal(await played(),0,'no autoplay on launch');
    await startGame(); assert.equal(await loops(),1,'one music loop after Play');
    assert(await p.evaluate(() => window.__sfSources.some(s => s.context.state === 'running')),'AudioContext runs after a real user gesture');
    let n=await played(); await p.keyboard.press('ArrowLeft'); await expectCue(n,0.025);
    n=await played(); await p.keyboard.press('c'); await expectCue(n,0.15);
    n=await played(); await p.keyboard.press('c'); await settle(80); assert.equal(await played(),n,'rejected hold is silent');
    n=await played(); await p.keyboard.press('Space'); await expectCue(n,0.16);
    await p.keyboard.press('p'); await silent(); assert.equal(await loops(),0,'pause stops music');
    await p.keyboard.press('m'); await settle(); assert.match(await game.locator('.sf-sound').textContent(),/off/);
    n=await played(); await startGame(); await p.keyboard.press('Space'); await settle(); assert.equal(await played(),n,'mute suppresses music and effects');
    await p.keyboard.press('p'); await settle(); await p.reload(); await game.waitFor({timeout:60000}); await settle();
    assert.match(await game.locator('.sf-sound').textContent(),/off/,'mute survives reload'); assert.equal(await played(),0);
    await p.keyboard.press('m'); await settle(); assert.equal(await played(),0,'unmuting while paused stays silent');
    await startGame(); assert.equal(await loops(),1);
    await game.locator('.sf-music').click(); await settle(); assert.equal(await loops(),0,'music can be disabled independently');
    n=await played(); await p.keyboard.press('Space'); await expectCue(n,0.16);
    await p.keyboard.press('p'); await settle(); await p.reload(); await game.waitFor({timeout:60000}); await settle();
    assert.match(await game.locator('.sf-music').textContent(),/off/,'music preference survives reload');
    await startGame(); assert.equal(await loops(),0);
    await game.locator('.sf-music').click(); await settle(); assert.equal(await loops(),1);
    await p.locator('.tblaunch').click(); await settle(); await silent();
    assert.equal(await game.locator('.sf-overlay').count(),1,'leaving window pauses and silences');
    await p.keyboard.press('Escape'); await game.locator('.sf-well').click();
    await fixture('single'); n=await played(); await p.keyboard.press('Space'); await expectCue(n,0.335);
    assert.equal(await game.locator('.sf-pair .sf-stat').nth(1).locator('b').textContent(),'1');
    await fixture('turn'); n=await played(); await p.keyboard.press('ArrowUp'); await expectCue(n,0.065);
    await fixture('level'); n=await played(); await p.keyboard.press('Space'); await expectCue(n,0.72);
    assert.equal(await game.locator('.sf-pair .sf-stat').first().locator('b').textContent(),'2');
    await fixture('lock'); n=await played(); await expectCue(n,0.065);
    await fixture('over'); n=await played(); await p.keyboard.press('Space'); await expectCue(n,0.9);
    assert.equal(await loops(),0,'game over stops the music');
    assert.match(await game.locator('.sf-eyebrow').textContent(),/GAME OVER/);
    await game.locator('button',{hasText:/^New game$/}).click(); await settle(); assert.equal(await loops(),1);
    await close(); await silent(); assert.deepEqual(errors,[]);
    console.log('ok   Stackfall audio: user gesture, movement, hold, drop, row clear, level, gravity lock, game over, mute, preferences, focus and close');
  } finally { await browser?.close(); server.close(); }
})().catch(e => {console.error(e); process.exitCode=1;});
