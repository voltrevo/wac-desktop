// Opening the launcher from a browser test, which is not one click.
//
// **Clicked until it opens.** The desktop's page draws `.dicons` and the taskbar before its worker has attached
// the handlers, so on a loaded machine a test's first click on `.tblaunch` can land on a button that does not
// answer yet: `mandelbrot_test`, `stackfall_test` and `paint_test` each timed out that way with the browser tests
// run side by side (`wac task test:browser`). A click it does answer opens `.lq`, and a second would close it
// again, so this clicks only while the launcher is shut — and gives each click long enough to be answered: on a
// loaded machine an answered click can take more than a second to open it, and clicking again then closed it
// (`.lq` "detached from the DOM", a 30s timeout in `mandelbrot_test` at 1.5s a try). A click that was lost costs
// one wait; one that was slow is not doubled.
async function openLauncher(p) {
  for (let k = 0; k < 6 && !(await p.locator('.lq').isVisible()); k++) {
    await p.locator('.tblaunch').click();
    await p.locator('.lq').waitFor({ timeout: 8000 }).catch(() => {});
  }
}

module.exports = { openLauncher };
