# Desktop (and the Archive Explorer)

A desktop that runs in a browser tab: windows you can move, resize, snap and minimise, a taskbar, and a
disk of its own that survives a reload. Its apps are **Files** — which browses the disk and opens any zip,
tar, gzip or zstd archive in place, with **Extract here** to unpack one — a **Viewer**, a text
**Editor**, a **Terminal**, which is wac's own shell on the desktop's disk, and a **Calculator**. Deleting
moves things to a **Trash**. Nothing is uploaded: the page has no network access, and its files live in the browser.

It is written in [wac](https://github.com/voltrevo/wac), uses the DOM for everything it draws, and builds
to single HTML files. The standalone **Archive Explorer** it grew from is built alongside it.

## Building it

**Everything is pinned to one wac commit,
[`1afa908e`](https://github.com/voltrevo/wac/commit/1afa908ef255fc585c444447b18ed2b50ad6568d).** The `wac`
command should be built from that commit, and `wac.json5` names it as the `ref` of every wac dependency —
`wac` itself (its packages, as `import { json.parse } from "wac"`), `web` and `webbuild` — with `wac.lock`
agreeing. To change it, change all three refs and the lock together, and rebuild `wac` from the new
commit; `tools/ci-build.sh` reads the commit from `wac.lock`.

Getting that `wac`, on a machine with git and Node 22+:

```bash
git clone https://github.com/voltrevo/wac ~/src/wac
```

```bash
git -C ~/src/wac checkout 1afa908ef255fc585c444447b18ed2b50ad6568d
```

```bash
cd ~/src/wac && ./bootstrap.sh --host nodejs
```

That installs `wac` in `~/.wac/bin` (`. ~/.wac/env` puts it on `PATH`). Then, in this repository:

    wac update           # fetch the pinned wac packages, once
    wac task build       # src/desktop.wac -> dist/index.html, src/app.wac -> dist/explorer/index.html
    wac task serve       # http://localhost:8080 — over http the desktop gets its storage
    wac task test        # formats, previews, the disk and the window manager, without a browser
    wac task test:desk   # the desktop in Chromium, as a person uses it (needs Playwright)
    wac task test:drops  # real drops on the Archive Explorer: files and folders, file:// and http://

Where `wac update` cannot reach GitHub, `sh tools/use-local-wac.sh ~/src/wac` fills the package cache
from the clone instead.

`sh tools/ci-build.sh` does all of this from nothing — clone, check out the pinned commit, bootstrap,
fill the cache, test, build — and is what publishing runs.

**Publishing:** `.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages on every
push to the default branch — set the repository's Pages source to "GitHub Actions". It runs
`tools/ci-build.sh`, caching the bootstrapped `wac` between runs, keyed on `wac.lock`.

## Where it runs

**Served over http** — `wac task serve`, GitHub Pages, any static host — the desktop keeps its files in
the browser's Origin Private File System, and the taskbar says *Saved in this browser*. Files and the
window layout come back after a reload.

**Opened from a file** (`file://`), the browser refuses it that storage outright, so the same desktop runs
on memory and says *Not saved*: everything works, and nothing outlives the tab. One difference: a page
from a file may not start workers from its workers, so the terminal runs programs inside the shell's own
worker rather than as processes of their own — they run the same, but `^C` cannot stop one that loops.

On GitHub Pages, storage belongs to the origin — `you.github.io` — which every project site of that account
shares, so their pages can see each other's files.

## Using it

- **First launch** puts `Welcome.md` and `demo.zip` on the desktop and opens the welcome note.
- **Files** lists the disk. Double-click a folder to go in, an archive to browse it in place, anything
  else to open it — text and code in the Editor, the rest in a Viewer. Beside the listing, the selected
  file is previewed (rendered Markdown, a JSON tree, a CSV table, highlighted code, images, hex, checksums)
  with Open, Edit, Rename (F2) and Delete (it asks twice). New folder, and Add files from your computer.
- **Inside an archive**, Files is the Archive Explorer — its listing, filter and previews — with the
  breadcrumbs carrying on from the disk's, and **Extract here** writing every file to a folder beside it.
- **Moving files:** drag rows or desktop icons onto a folder row, a breadcrumb, a Files window, a desktop
  folder, Home, the desktop or the Trash; hold Ctrl as you let go to copy instead. Ctrl-click and
  Shift-click select several, Ctrl+A all of a folder. Cut, Copy and Paste are buttons beside the selection, and Ctrl+X, Ctrl+C and
  Ctrl+V in a listing. A window showing something that moves follows it.
- **The Trash:** Delete (the key or the button) moves things to the Trash, with an Undo beside the note
  that says so. The Trash — on the desktop and in the launcher — shows where each item came from and
  when; Restore puts it back there, making its folder again if it has gone, and "Delete for good" and
  Empty Trash ask twice. A terminal's `rm` is still a shell's, and does not use the Trash.
- **The Calculator** takes keys or typing: brackets, `√`, `x²`, and percentages the way pocket
  calculators do them (`200 + 10%` is 220). The answer shows as you type; finished sums stay above, and
  a click on one carries its answer on. Answers have twelve significant digits, so `0.1 + 0.2` is 0.3.
- **Dropping files or folders** puts them in the folder of the Files window in front, or on the desktop.
- **Windows** move by the title bar and resize from any edge or corner. Dragged to the top they maximise,
  to the left or right edge they fill that half; double-click a title bar to maximise. The taskbar brings
  a window forward, or puts away the one in front. On a phone, windows fill the screen.
- **The Terminal** (launcher, or the Terminal button in Files, which opens it in that folder) is the shell
  from wac's `box` — `sh` with about sixty programs (`ls`, `cat`, `grep`, `find`, `sed`, `sort`,
  `sha256sum`, `ps`, …; `help` lists them), pipes, redirects, `/bin`, `/proc` and `/dev`. It runs on the
  same disk Files shows: `echo hi > /Desktop/hi.txt` puts an icon on the desktop, and a file saved in the
  Editor is there for `cat`. Tab completes paths, ↑/↓ recall history, Ctrl+C stops a command, Ctrl+L clears the screen, and what is
  typed while one runs waits its turn. `open <path>` shows a file or folder in a window. A terminal comes
  back in the folder it was in after a reload; its scrollback does not.
- **The Editor** saves with Ctrl+S or its Save button.
- **The clock says UTC**: a page is told the time, but not its reader's time zone.

## Layout

| | |
|---|---|
| `src/desktop.wac` | the desktop's page |
| `src/desk/shell.wac` | the desktop: startup, icons, window frames, taskbar and launcher, files arriving, saving the layout |
| `src/desk/wm.wac` | windows as records: focus and stacking, minimise and maximise, the drag and resize arithmetic, snapping, the layout as JSON |
| `src/desk/vfs.wac` | the disk: std's `Files` on the browser's storage, or in memory, as the apps use it; copying, free names |
| `src/desk/files.wac`, `src/desk/apps.wac` | Files; the Viewer and the Editor |
| `src/desk/trash.wac`, `src/desk/calc.wac` | the Trash and its note of where things came from; the Calculator |
| `src/desk/terminal.wac` | the Terminal: a window onto box's `Session` — screen, prompt, completion, type-ahead, `open` |
| `src/desk/style.wac`, `src/desk/seed.wac` | the desktop's look; what a new desktop starts with (from `tools/seed.py`) |
| `src/app.wac`, `src/browse.wac` | the Archive Explorer's page; its listing, breadcrumbs and keys, shared with Files |
| `src/preview.wac`, `src/markdown.wac`, `src/jsonview.wac`, `src/table.wac`, `src/highlight.wac` | previews |
| `src/model.wac`, `src/archive.wac`, `src/tree.wac`, `src/sniff.wac` | archives: levels, formats (zip incl. zip64, CP437 names and self-extracting stubs; tar with GNU and pax names; gzip; zstd), folders from paths, what a file is |
| `src/style.wac`, `src/bytes.wac` | the shared stylesheet and icons; byte and number helpers |
| `tools/` | test archives, the demo and seed generators, the browser tests; `ci-build.sh` and `use-local-wac.sh` |
| `.github/workflows/pages.yml` | build and deploy to GitHub Pages |

## How it is put together

- **Dragging files** uses pointer events, not the browser's drag and drop, since a page cannot ask which
  element is under a point. While a drag is on, every place that takes a drop listens for the pointer
  moving over it; the innermost — a folder row, before its listing, before its window, before the
  desktop — claims the move, and the desktop, last to hear of it, clears the claim for the next.
- **What renders when.** The desktop draws window frames; each window's contents are a component handed
  the window record and two numbers — its revision, and the disk's. A drag changes neither, so dragging
  a Files window over a 4,000-row listing redraws frames and nothing in them; a save bumps the disk's, so
  every window showing the disk looks again.
- **Stacking is a z-index**, not document order: raising a window must not move its element, or an
  editor's caret and a listing's scroll would go with it.
- **The browser's own events do the edges.** A page cannot ask how wide it is, so the right-edge snap is
  a thin strip that is only there during a drag and says when the pointer reaches it.
- **Damaged archives:** wac's decompressors answer bad data with an error, which is shown as the
  reason. As a backstop for this project's own parsing — a trap cannot be caught — work marks itself in
  progress; a page runs on one thread, so a timer that finds the mark still there knows the work died,
  and says so. The loops that receive files never open anything themselves.
- **One disk, many shells.** The desktop makes one std `Files` at startup — on the browser's storage, or
  in memory — and mounts wac's system over it (`/bin`, `/proc`, `/dev`) as box does, with one process
  table. Files, the Viewer and the Editor read and write it through `vfs.wac`; every terminal is
  `Session.startOn` those same files and that table. A
  command that finishes bumps the disk's revision, so every Files window looks again. Programs run as
  box applets in workers: the page is built with `--spawn applet`, and `src/desktop.wac` exports one.
- **Size.** Carrying the shell takes the page from 1.8 MB to about 3.6 MB of module. It also needs a
  `wac` whose compiler lets its table of generic instantiations grow, which wac has had since
  `63edaad6b` — so a `wac` older than that cannot build the desktop.
- **Folders arriving** come a file at a time with nothing marking the last, so they are gathered until
  600 ms pass with no more. The `web` package's host walks dropped directories and passes each file's
  path.

## Not yet

Zip writing, dragging files between windows, multiple desktops,
keyboard window switching, settings. In archives: encrypted entries and deflate64, bzip2, lzma or xz zip
entries are listed but not opened; files over about 32 MB are not hashed. Markdown opened from the disk
shows its images' alt text rather than the images. In the terminal: `ps` does not list the shell itself,
and there are no full-screen programs.
