# Desktop (and the Archive Explorer)

A desktop that runs in a browser tab: windows you can move, resize, snap and minimise, a taskbar, and a
disk of its own that survives a reload. Its apps are **Files** — which browses the disk and opens any zip,
tar, gzip or zstd archive in place, with **Extract here** to unpack one — a **Viewer**, a text
**Editor**, a **Terminal**, which is wac's own shell on the desktop's disk, and a **Calculator** — each a program of
its own on the site the desktop is served from, started in windows it opens itself. Deleting moves things to a
**Trash**. Nothing is uploaded: the page has no network access, and its files live in the browser.

It is written in [wac](https://github.com/voltrevo/wac), uses the DOM for everything it draws, and builds
to single HTML files. The standalone **Archive Explorer** it grew from is built alongside it.

## Building it

**Everything is pinned in `wac.lock`**: wac at `955dbf698` — the `wac` command should be built from that commit, and
its packages are `import { json.parse } from "wac"` — and `web`, the page and its builder, at `6ff6b30`. Both are
repositories on `git.voltrevo.com`, `web` its own since 2026-10-29. `wac.json5` names each commit as the `ref` of
its dependencies (`wac`, `web`, `webbuild`), and `wac.lock` agrees. To move one, change its refs and the lock
together — and rebuild `wac` when it is wac that moved; `tools/ci-build.sh` and `tools/wacbin.py` read the commits
from `wac.lock`.

Getting that `wac`, on a machine with git and Node 22+:

```bash
git clone https://git.voltrevo.com/wac.git ~/src/wac
```

```bash
git -C ~/src/wac checkout 955dbf6986bfaf084db65b742b2e07a23351bd82
```

```bash
cd ~/src/wac && ./bootstrap.sh --host nodejs
```

That installs `wac` in `~/.wac/bin` (`. ~/.wac/env` puts it on `PATH`). Then, in this repository:

    sh tools/fill-cache.sh   # the pinned wac and web, into wac's package cache, once
    wac task build       # src/desktop.wac -> dist/index.html, src/app.wac -> dist/explorer/index.html and
                         # dist/apps/explorer.wasm, then dist/index.json (site.wac)
    wac task serve       # http://localhost:8080 — over http the desktop gets its storage
    wac task test        # formats, previews, the disk and the window manager, without a browser
    wac task test:desk   # the desktop in Chromium, as a person uses it (needs Playwright)
    wac task test:drops  # real drops on the Archive Explorer: files and folders, file:// and http://

**`tools/fill-cache.sh` rather than `wac update`**, because `git.voltrevo.com` answers wac's own fetcher 401:
`git` has the credentials, so the script fetches each commit `wac.lock` pins with `git` and puts it where `wac`
looks. Where the host is reachable without them, `wac update` does the same.

`sh tools/ci-build.sh` does all of this from nothing — clone, check out the pinned commit, bootstrap,
fill the cache, test, build — and is what publishing runs.

**Publishing:** `.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages on every
push to the default branch — set the repository's Pages source to "GitHub Actions". It runs
`tools/ci-build.sh`, caching the bootstrapped `wac` between runs, keyed on `wac.lock`. **It needs
`git.voltrevo.com` reachable from GitHub's runners, with credentials**, since wac and `web` live there now; the
repository itself lives there too, and goes to GitHub only when the owner says so.

## Where it runs

**Served over http** — `wac task serve`, GitHub Pages, any static host — the desktop keeps its files in
the browser's Origin Private File System, and the taskbar says *Saved in this browser*. Files and the
window layout come back after a reload.

**Opened from a file** (`file://`), the browser refuses it that storage outright, so the same desktop runs
on memory and says *Not saved*, and nothing outlives the tab. It has no site either, so none of the apps that live
there: Files, the Trash and Permissions work, a document opens its folder in Files, whose preview shows it, and
programs from the disk still run — a page from a file may not start workers from its workers, but wac's page has
its own thread start every one.

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
  a click on one carries its answer on. Answers have twelve significant digits, so `0.1 + 0.2` is 0.3. It
  keeps the sum in its own folder, so started again it is still there.
- **Dropping files or folders** puts them in the folder of the Files window in front, or on the desktop.
- **Windows** move by the title bar and resize from any edge or corner. Dragged to the top they maximise,
  to the left or right edge they fill that half; double-click a title bar to maximise. The taskbar brings
  a window forward, or puts away the one in front. On a phone, windows fill the screen.
- **The Terminal** (launcher, or the Terminal button in Files, which starts it in that folder) is the shell
  from wac's `box` — `sh` with about sixty programs (`ls`, `cat`, `grep`, `find`, `sed`, `sort`,
  `sha256sum`, `ps`, …; `help` lists them), pipes, redirects, `/bin`, `/proc` and `/dev`. It runs on the
  same disk Files shows: `echo hi > /Desktop/hi.txt` puts an icon on the desktop, and a file saved in the
  Editor is there for `cat`. Tab completes paths, ↑/↓ recall history, Ctrl+C stops a command, Ctrl+L clears the screen, and what is
  typed while one runs waits its turn. `open <path>` shows a file or folder in a window, and `exit` closes it. It is
  handed the whole disk — it is a shell, and what it runs is the person's — and comes back after a reload in the
  folder it was started in; its scrollback does not.
- **`wac` is in the terminal too**, in `/site/bin`: `wac check`, `build`, `run` and `test` work on the desktop's
  disk, and a program `wac build` writes runs by its path (`./hello.wasm`). It is the `wac` command itself,
  built from the commit the project pins, read from the site — the browser caches it — and run as any program on
  the disk would be, in a worker of its own.
- **A program from the disk runs, and opens its own windows.** Open a `.wasm` and it starts as a process of its
  own, with no window. A page's module, as the `web` package's builder makes it (`page.wasm`), opens its first
  window by opening its page, and any program opens more with `Desktop.openWindow`; each window's body is all of a
  page it can reach, its title names the window, closing the last stops the program, and when it ends its windows
  close. A program with nothing to show opens none, and the desktop's note says what it wrote. `samples/counter.wac`,
  `two.wac` and `hello.wac` are the ones the browser test runs.
- **A program reaches only what it is handed.** Its files are its own folder, `.apps/<name>`, where its relative
  paths go, and what the person hands it: a file chosen in the desktop's picker when the program asks (`Desktop.pick`
  in `web`), or files dropped on its window, which are the program's and are not written to the disk. Through
  `wac.desktop` it can also show a file it holds in the desktop's app for it, say something in the desktop's note,
  and use the desktop's text clipboard. `samples/notes.wac` does each of these.
- **More than it is handed, a program asks for once.** `Desktop.askFor(path, write)` shows the person who asks, for
  what and whether it would change it; "Allow" is remembered for that program in `.desktop/grants.json`, as is a
  file chosen for it in the picker, so started again it holds them and is not asked again. The desktop's own
  `.desktop` and another program's folder are never given. `samples/reader.wac` asks to read the desktop.
  **Permissions**, in the launcher, lists what each program was allowed, and Take back forgets it — from a running
  program at once, and from the next start.
- **The desktop's own apps are programs on its site.** Served over http, the site the desktop came from is `/site`,
  read-only (`wac.site` in `web`): a read is a GET, the browser's cache doing the caching, and a listing or a size
  comes from the `index.json` the build writes. The Viewer, the Editor, the Terminal, the Calculator and the Archive
  Explorer are there, in `site/apps/`, and start as any program does (`src/desk/builtin.wac`), handed what they are
  opened on and no more — the Viewer its file to read, the Editor its file to change, the Terminal the disk — at
  the size their windows suit. A session keeps their windows as the app and what it showed, and a reload starts
  them again. Each is also a page on its own, in `dist/apps/<name>/`. Files and Permissions stay the desktop's own:
  one is how it shows its disk, and the other governs what programs may reach.
- **The Editor** saves with Ctrl+S or its Save button. A new file is saved on the Desktop, under the name typed or
  the first free one like it (`Desktop.newFile`); the Viewer's Edit opens its file in the Editor (`Desktop.edit`).
- **The clock says UTC**: a page is told the time, but not its reader's time zone.

## Layout

| | |
|---|---|
| `src/desktop.wac` | the desktop's page |
| `src/desk/shell.wac` | the desktop: startup, icons, window frames, taskbar and launcher, files arriving, saving the layout |
| `src/desk/wm.wac` | windows as records: focus and stacking, minimise and maximise, the drag and resize arithmetic, snapping, the layout as JSON |
| `src/desk/vfs.wac` | the disk: std's `Files` on the browser's storage, or in memory, as the apps use it; copying, free names |
| `src/desk/files.wac` | Files |
| `src/desk/builtin.wac` | the desktop's own apps, as programs on its site: what each is handed, its window, starting one again |
| `src/apps/viewer.wac`, `src/apps/editor.wac`, `src/apps/calc.wac`, `src/apps/terminal.wac`, `src/apps/style.wac` | the Viewer, the Editor, the Calculator and the Terminal — box's `Session` with a screen, prompt, completion, type-ahead and `open` — each a program, with its look |
| `src/desk/program.wac` | a program from the disk: started with no window, each window it opens a slice of `wac.page` answered by `web`'s `PageServer` |
| `src/desk/grants.wac`, `src/desk/services.wac`, `src/desk/remember.wac`, `src/desk/allowed.wac` | what a program may reach of the disk; `wac.desktop` answered — the picker, asking, windows, open, note, the clipboard; what each program was allowed, remembered, and the Permissions window to take it back |
| `src/desk/trash.wac` | the Trash and its note of where things came from |
| `src/desk/style.wac`, `src/desk/seed.wac` | the desktop's look; what a new desktop starts with (from `tools/seed.py`) |
| `src/app.wac`, `src/browse.wac` | the Archive Explorer's page; its listing, breadcrumbs and keys, shared with Files |
| `site.wac` | the build's last step: each app's module copied to `dist/apps/<name>.wasm`, and the site's `index.json` |
| `src/preview.wac`, `src/markdown.wac`, `src/jsonview.wac`, `src/table.wac`, `src/highlight.wac` | previews |
| `src/model.wac`, `src/archive.wac`, `src/tree.wac`, `src/sniff.wac` | archives: levels, formats (zip incl. zip64, CP437 names and self-extracting stubs; tar with GNU and pax names; gzip; zstd), folders from paths, what a file is |
| `src/style.wac`, `src/bytes.wac` | the shared stylesheet and icons; byte and number helpers |
| `samples/` | `demo.zip`'s source; `counter.wac`, `notes.wac`, `two.wac`, `hello.wac` and `reader.wac`, programs the browser test runs |
| `tools/` | test archives, the demo and seed generators, the browser tests; `ci-build.sh` and `fill-cache.sh` |
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
- **One disk.** The desktop makes one std `Files` at startup — on the browser's storage, or in memory — with the
  site mounted at `/site`, and Files reads and writes it through `vfs.wac`. Every program sees it through its
  grants (`grants.wac`), and a change one makes outside its own folder bumps the disk's revision a moment later, so
  every Files window looks again. Each Terminal is `Session.startOn` its files with wac's system over them (`/bin`,
  `/proc`, `/dev`) as box does, and a process table of its own; box's programs are the Terminal's module started
  again, built with `--spawn applet`.
- **`wac` on the site.** `tools/wacbin.py`, run by `wac task build`, compiles the pinned commit's `wac` command
  (2.5 MB) into `dist/bin/wac`. Every terminal has `WACPATH=/site/bin`, so the shell finds `wac` and spawns it as it
  would any program, handed the shell's files, which is why it works on the desktop's disk.
- **Size.** The desktop is about 0.9 MB of module at wac `955dbf698` — 2.6 MB while it carried the Terminal and
  `wac`, 3.5 MB at `b0d60f33`, and 5.4 MB at `563d8828`. On the site beside it: the Terminal 1.1 MB, the Archive
  Explorer 0.3 MB, the Viewer 0.3 MB, the Editor and the Calculator 0.15 MB each, and `wac` 2.5 MB, each fetched
  when it is first started. It also needs a
  `wac` whose compiler lets its table of generic instantiations grow, which wac has had since
  `63edaad6b` — so a `wac` older than that cannot build the desktop.
- **Folders arriving** come a file at a time with nothing marking the last, so they are gathered until
  600 ms pass with no more. The `web` package's host walks dropped directories and passes each file's
  path.
- **A program in a window** is `Procs.spawnProviding` with one capability, `wac.page`, answered by `web`'s
  `PageServer` into the window's body: the child's handle 0 is that element, every element it makes is made under it
  through the desktop's own handles, and a request the child should not make — a `<script>`, an `on…` attribute, a
  handle it does not hold — is refused and noted rather than trapped on. Its changes arrive as one batch a turn,
  and its request for its next event stays open across the parent's other answers, which needs a wac whose parent
  answers a provided capability's requests as each settles (`25d20719e` has it).

## Not yet

Zip writing, dragging files between windows, multiple desktops,
keyboard window switching, settings. In archives: encrypted entries and deflate64, bzip2, lzma or xz zip
entries are listed but not opened; files over about 32 MB are not hashed. Markdown opened from the disk
shows its images' alt text rather than the images. In the terminal: `ps` does not list the shell itself,
and there are no full-screen programs.
