// A canvas a program draws, read by the browser tests wherever its pixels are.
//
// **Once a program draws a canvas, the canvas is drawn in the program's own worker** (wac-web's surfaces): the page's
// element only shows it, marked `data-wac-surface` with the document's number for it, and has no pixels to read — its
// `getContext` throws. The worker holds the canvas itself as an `OffscreenCanvas`, in `self.wacSurfaceById`. So a
// read is run in the page while the canvas is still there, and otherwise in whichever worker has it.

/** A function's source, run in the page: the first element matching `selector`, shadow roots searched too. */
const deep = (selector) => `() => {
  const find = (n) => { const m = n.querySelector(${JSON.stringify(selector)}); if (m) return m;
    for (const e of n.querySelectorAll('*')) if (e.shadowRoot) { const f = find(e.shadowRoot); if (f) return f; }
    return null; };
  return find(document); }`;

/**
 * `read` — a function's source, `(canvas, arg) => result` — run on the canvas `find` finds (a function's source, run
 * in the page), with `arg`; null when there is no canvas. The canvas is an `HTMLCanvasElement` or an
 * `OffscreenCanvas`: `read` uses what both have, its size and its `2d` context.
 */
async function onCanvas(page, find, read, arg) {
  const a = JSON.stringify(arg ?? null);
  for (let tries = 0; tries < 40; tries++) {
    const where = await page.evaluate(`(() => { const c = (${find})(); if (!c) return null;
      const s = c.getAttribute('data-wac-surface');
      return s === null ? { here: (${read})(c, ${a}) } : { surface: Number(s) }; })()`);
    if (where === null) return null;
    if ('here' in where) return where.here;
    for (const w of page.workers()) {
      const got = await w.evaluate(`(() => { const c = self.wacSurfaceById && self.wacSurfaceById.get(${where.surface});
        return c ? { got: (${read})(c, ${a}) } : null; })()`).catch(() => null);
      if (got) return got.got;
    }
    // Handed over but not arrived yet: the worker has it a message later.
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('a canvas drawn in a worker that no worker has');
}

/** The colour at `x`, `y`, as `[r, g, b, a]`. */
const PIXEL = `(c, [x, y]) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data)`;

module.exports = { deep, onCanvas, PIXEL };
