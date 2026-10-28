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
- Comments explain *why*, in full sentences, as the existing ones do. Match the surrounding style.

## Building and testing here

wac is pinned to one commit, `001db0fc`, everywhere: the three refs in `wac.json5`, `wac.lock`, and the
`wac` command itself (bootstrapped from that commit — see README). Change them together.

    wac task build && wac task test && wac task test:desk && wac task test:drops

- `test:desk` and `test:drops` drive Chromium with Playwright against `dist/`, so **build first**.
  All of them pass at the latest commit (36 unit tests, 67 desktop checks, 18 drop cases). The build also
  compiles the `wac` command for `/usr/bin` (`tools/wacbin.py`), which is most of its time.
- `wac update` could not reach GitHub from the container this was made in ("network access not
  granted"). `sh tools/use-local-wac.sh <wac clone>` fills the package cache from a clone instead.
- `sh tools/ci-build.sh` is the from-nothing build GitHub Actions runs (about 2.5 minutes, mostly
  bootstrapping `wac`); run it on a copy of the tree with a fresh `HOME`/`WAC_HOME` to check CI.
- Run unit tests with `wac task test`. `wac test test/one_test.wac` on its own fails to parse the
  `html.*` imports, because it loses the project's context.

## wac things that have bitten

- **The terminal's `wac` is the page's own work, not a special case.** A program the shell finds on
  `$WACPATH` is spawned as a module in a worker (wac's `packages/web`, `moduleSide`), so a bug in how
  `wac` runs there is usually in that driver or in a `.wait()` the command makes — a page cannot wait, and
  aborts a program that asks it to. `wac run` was one such; `packages/wac` awaits it now.
- **The page's program runs in a worker**, so the DOM updates a moment after an event. A browser test
  must wait (`settle()`) before reading what changed.
- **A trap cannot be caught.** The decoders now return errors, but this project's own parsing can still
  trap on a lying header; the `trying` field plus a timer (the "watchdog") reports that instead of
  hanging.
- `f64` has `floor`, `ceil`, `round` and `trunc` and nothing else: no `sqrt` or `abs` (the Calculator
  writes its own). String escapes are the usual few — `"\1"` is an error.
- `import { json.parse } from "wac"` binds `parse`, not `json.parse`.
- A component re-renders only when its attributes change. Window contents are components handed
  `fsRev`, `rev` and, for Files, `drop` and `clipN`, so that dragging a window does not redraw what is
  in it. Something a window must react to has to arrive as one of those.
- `prevent` names keys whose default is prevented, and may include modifiers: `"Ctrl+s Meta+s"`.

## Open threads

- `docs/wac-proposal.md`: what is still wanted from wac — chiefly spawning on `file://` (upstream
  design/system/0015 decision 3, agreed and not built). Until then neither box's programs as processes
  nor `wac` run from a page opened as a file.
- **`wac` in the terminal** runs programs that import `std` and `core`. One importing a git dependency
  needs that dependency in a package cache on the page's disk, which nothing provides yet.
- **Shelved by the owner:** building apps as separate modules. The direction discussed was a process
  per app holding a connection to the desktop, asking it for *surfaces* with roles (window, dialog,
  popup, notification, status item, drag image), each surface an `Element` grant, passable between
  processes. It needs wac to run a given module and to hand an `Element` to another worker.
- Ideas suggested and not yet chosen: writing archives (Compress, download a folder as a zip, back up
  and restore the whole disk), search across the disk, Editor find/replace and Markdown preview, terminal
  scrollback that survives a reload, settings (wallpaper, theme), quarter snapping.
- Known gaps: `ps` does not list the terminal's own shell; box's `ls -l` is not implemented; the clock
  says UTC because a page is not told the time zone.
