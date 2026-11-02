# Notes for whoever works on this next

README.md says what this is, how it is laid out and how it is built; read it first. This file is the
part a README does not say: how the work has gone, what the owner wants, and what trips you up.

## What it is, and is not

A desktop in a browser tab, written in [wac](https://github.com/voltrevo/wac), drawing with the DOM. It
is a **tactical experiment** beside a more ambitious desktop inside the wac repository itself, and it
consumes wac strictly from outside, as any project would. When it needs something wac does not have,
the answer has been to ask wac for it — `docs/wac-proposal.md` is that list, kept current — and a
good deal of it has landed upstream.

## Working agreements

- **Pushing.** Since 2026-10-28 this repository lives beside wac as a bare repo on the shared machine
  (`~/bare-repos/wac-desktop.git`), and pushing finished work there is the agent's call, as it is for wac
  itself. Nothing goes to GitHub unless the owner says so.
- **Ask before a big direction change.** Features have been chosen together, from short lists of
  options with a recommendation.
- **Icons are SVG `data:` URLs used as CSS masks** (`src/style.wac`), by the owner's choice.
- **No vendored code, but one file**: Paint's font, `src/apps/paint/font16.wac`, copied from wac's `packages/raster`
  because `from "wac"` does not reach it (`docs/wac-proposal.md`, item 11). When wac exports it, import it and delete
  the copy.
- Comments explain *why*, in full sentences, as the existing ones do. Match the surrounding style.

## Building and testing here

wac is pinned to one commit, `84955c78c`, `web` (wac-web) to `e746b49` and the wac IDE (`ide`) to `872601e`, in `wac.json5` and `wac.lock`; the `wac` command
should be built from the wac commit (see README). Change a pin's refs and the lock together.

    sh tools/fill-cache.sh && wac task build && wac task test && wac task test:desk && wac task test:stackfall && wac task test:stackfall-audio && wac task test:mandelbrot && wac task test:paint && wac task test:pip && wac task test:settings && wac task test:drops

- **Pins name GitHub** (`https://github.com/voltrevo/`), where the owner syncs the same commits. During development
  they are on git.voltrevo.com first: **run `sh tools/use-mirror.sh` once per machine**, so `git` fetches GitHub's
  URLs from there. `wac update`'s own fetcher does not follow it, so **`tools/fill-cache.sh`, not `wac update`**.
- `test:desk`, `test:stackfall`, `test:stackfall-audio`, `test:mandelbrot`, `test:paint`, `test:pip`, `test:settings` and `test:drops` drive Chromium with Playwright against `dist/`, so **build first**.
  All of them pass at the latest commit (120 unit tests, 112 desktop checks, 18 drop cases, 12 Paint steps). The build makes the
  desktop, each of its apps (`src/apps/`, and the Archive Explorer) and the `wac` command for the site
  (`tools/wacbin.py`), then `site.wac`; `test:desk` serves `dist/` as a site, builds the programs in `samples/` and
  runs them, so it needs `wac` on `PATH`.
- `sh tools/ci-build.sh` is the from-nothing build GitHub Actions runs, from GitHub; with the mirror set, it runs
  here from git.voltrevo.com the same way. Sync wac, wac-web and wac-ide to GitHub before this repository, or its
  run finds a pinned commit missing.
- Run unit tests with `wac task test`, which grants what they need; `wac test --allow-read test/one_test.wac`
  runs one file. A test file importing a namespace member from `"wac"` (`fs.ProcTable`) needs a wac from
  `3792c730d` on: before it, its tests taking a `Sys` were silently skipped.

## wac things that have bitten

- **The terminal's `wac` is the page's own work, not a special case.** A program the shell finds on
  `$WACPATH` is spawned as a module in a worker (`web`'s `tools/build.wac`, `moduleSide` — the desktop's own page
  is run that way too, since `web` d0ad98a), so a bug in how
  `wac` runs there is usually in that driver or in a `.wait()` the command makes — a page cannot wait, and
  aborts a program that asks it to. `wac run` was one such; `packages/wac` awaits it now.
- **The page's program runs in a worker**, so the DOM updates a moment after an event. A browser test
  must wait (`settle()`) before reading what changed.
- **A trap cannot be caught.** The decoders now return errors, but this project's own parsing can still
  trap on a lying header; the `trying` field plus a timer (the "watchdog") reports that instead of
  hanging.
- `f64` has `floor`, `ceil`, `round`, `trunc`, and — since wac `9ccf257c7`, which the pin includes — `sqrt`, `abs`,
  `min`, `max` and `copySign`, one instruction each; `log`, `exp`, `pow` and the rest are `import { math } from "core"`.
  The apps use them; `src/apps/maths.wac` is only decimals now. String escapes are the usual few — `"\1"` is an error. A string has few methods:
  `len`, `slice`, `indexOf`, `toBytes` — no `trim`, `split` or case changes.
- `import { json.parse } from "wac"` binds `parse`, not `json.parse`.
- A component re-renders only when its attributes change. Window contents are components handed
  `fsRev`, `rev` and, for Files, `drop` and `clipN`, so that dragging a window does not redraw what is
  in it. Something a window must react to has to arrive as one of those. A skipped component is redrawn before an event
  is handed to it, so a text field must not be drawn with the text as typed so far: it is set back a key behind, and
  loses what was typed between (`src/apps/mdedit.wac` draws it with the text as loaded; Paint's text, hex and
  dialog fields with what they held when they opened).
- **Colours are `light-dark()` tokens on `:root` only** (`src/style.wac`): a program's window is a shadow root that
  inherits them and the `color-scheme` from the desktop, which is how Settings' light, dark and accent reach it.
  Declaring them on `:host` again would cut a window off from Settings. The same holds inside an app: Paint hands each
  part the revision (`rev={tick.get()}`) beside the painter itself, which is always the same struct — without it, a
  colour well showed the colour before the last one chosen.
- `prevent` names keys whose default is prevented, and may include modifiers: `"Ctrl+s Meta+s"`.

## Open threads

- `docs/wac-proposal.md`: what is still wanted from wac — the reader's time zone, reproducible names, and
  the box gaps. Everything the desktop asked of design/system/0015 is built, `file://` included.
- **`wac` in the terminal** runs programs that import `std` and `core`. One importing a git dependency
  needs that dependency in a package cache on the page's disk, which nothing provides yet.
- **Apps as separate modules: done for the built-in apps.** The handover in `https://git.voltrevo.com/notes.git` (2026-10-29) is the
  agreed direction: the desktop is a program's host, a program asks for capabilities by name, and a window is a
  page's program answered by `PageServer` (`src/desk/program.wac`). A program's files are what it was granted
  (`grants.wac`): its own folder, what it picked in the desktop's picker, what was dropped on its window; and
  `wac.desktop` (`services.wac`) is the picker, open, note, the clipboard and windows: a program starts with none
  and opens its own, each a slice of `wac.page`. More than it is handed it asks for (`Desktop.askFor`): the person
  is asked once and an "Allow" is remembered (`remember.wac`), as are picks. Permissions (`allowed.wac`) lists what
  was allowed and takes it back. The Viewer, Editor, Terminal, Calculator and Archive Explorer are programs on the
  desktop's site (`builtin.wac`, `src/apps/`), served over http only — the owner's choice: from a file there are
  none. The wac IDE is one of them too, pinned as `ide`. Each program's page is a shadow root of its window
  (`program.wac`, web's `Element.shadow`), so stylesheets do not cross between programs and the desktop; a browser
  test reads inside one through Playwright's selectors, or `__deep` (`tools/desk_test.js`). Next there: a program
  describing itself — name, icon, file types, what it will ask for — so the question
  can come before it runs.
- Ideas suggested and not yet chosen: writing archives (Compress, download a folder as a zip, back up
  and restore the whole disk), search across the disk, Editor find/replace, terminal
  scrollback that survives a reload, quarter snapping.
- Known gaps: Paint zooms about the picture's top left, not the middle of what is shown — a page cannot set where
  an element is scrolled to; `ps` does not list the terminal's own shell; box's `ls -l` is not implemented; the clock
  says UTC because a page is not told the time zone.
