# Desktop (and the Archive Explorer)

A desktop that runs in a browser tab: windows you can move, resize, snap and minimise, a taskbar, and a
disk of its own that survives a reload. Its apps are **Files** — which browses the disk and opens any zip,
tar, gzip or zstd archive in place, with **Extract here** to unpack one — a **Viewer** and a text
**Editor**. Nothing is uploaded: the page has no network access, and its files live in the browser.

It is written in [wac](https://github.com/voltrevo/wac), uses the DOM for everything it draws, and builds
to single HTML files. The standalone **Archive Explorer** it grew from is built alongside it.

    wac update           # fetch the `web` package, once
    wac task build       # src/desktop.wac -> dist/index.html, src/app.wac -> dist/explorer/index.html
    wac task serve       # http://localhost:8080 — over http the desktop gets its storage
    wac task test        # formats, previews, the disk and the window manager, without a browser
    wac task test:desk   # the desktop in Chromium, as a person uses it (needs Playwright)
    wac task test:drops  # real drops on the Archive Explorer: files and folders, file:// and http://
    wac task pages       # dist/ onto the gh-pages branch, ready to push

## Where it runs

**Served over http** — `wac task serve`, GitHub Pages, any static host — the desktop keeps its files in
the browser's Origin Private File System, and the taskbar says *Saved in this browser*. Files and the
window layout come back after a reload.

**Opened from a file** (`file://`), the browser refuses it that storage outright, so the same desktop runs
on memory and says *Not saved*: everything works, and nothing outlives the tab.

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
- **Dropping files or folders** puts them in the folder of the Files window in front, or on the desktop.
- **Windows** move by the title bar and resize from any edge or corner. Dragged to the top they maximise,
  to the left or right edge they fill that half; double-click a title bar to maximise. The taskbar brings
  a window forward, or puts away the one in front. On a phone, windows fill the screen.
- **The Editor** saves with its Save button: Ctrl+S cannot be caught, because a page can only prevent a key
  by name, without its modifiers, and preventing `s` would stop it being typed.
- **The clock says UTC**: a page is told the time, but not its reader's time zone.

## Layout

| | |
|---|---|
| `src/desktop.wac` | the desktop's page |
| `src/desk/shell.wac` | the desktop: startup, icons, window frames, taskbar and launcher, files arriving, saving the layout |
| `src/desk/wm.wac` | windows as records: focus and stacking, minimise and maximise, the drag and resize arithmetic, snapping, the layout as JSON |
| `src/desk/vfs.wac` | the disk: the browser's storage, or memory; copying, free names |
| `src/desk/files.wac`, `src/desk/apps.wac` | Files; the Viewer and the Editor |
| `src/desk/style.wac`, `src/desk/seed.wac` | the desktop's look; what a new desktop starts with (from `tools/seed.py`) |
| `src/app.wac`, `src/browse.wac` | the Archive Explorer's page; its listing, breadcrumbs and keys, shared with Files |
| `src/preview.wac`, `src/markdown.wac`, `src/jsonview.wac`, `src/table.wac`, `src/highlight.wac` | previews |
| `src/model.wac`, `src/archive.wac`, `src/tree.wac`, `src/sniff.wac` | archives: levels, formats (zip incl. zip64, CP437 names and self-extracting stubs; tar with GNU and pax names; gzip; zstd), folders from paths, what a file is |
| `src/style.wac`, `src/bytes.wac` | the shared stylesheet and icons; byte and number helpers |
| `vendor/` | inflate, CRC-32, zstd, SHA-256, JSON and number formatting, copied from wac's `packages/` at `a66fe9d51` |
| `tools/` | test archives, the demo and seed generators, the browser tests, `pages.sh` |

## How it is put together

- **What renders when.** The desktop draws window frames; each window's contents are a component handed
  the window record and two numbers — its revision, and the disk's. A drag changes neither, so dragging
  a Files window over a 4,000-row listing redraws frames and nothing in them; a save bumps the disk's, so
  every window showing the disk looks again.
- **Stacking is a z-index**, not document order: raising a window must not move its element, or an
  editor's caret and a listing's scroll would go with it.
- **The browser's own events do the edges.** A page cannot ask how wide it is, so the right-edge snap is
  a thin strip that is only there during a drag and says when the pointer reaches it.
- **Damaged archives:** the vendored decompressors `trap` on bad data, and wac cannot catch a trap. Work
  marks itself in progress; a page runs on one thread, so a timer that finds the mark still there knows
  the work died, and says so. The loops that receive files never open anything themselves.
- **Folders arriving** come a file at a time with nothing marking the last, so they are gathered until
  600 ms pass with no more. This needs the `web` package's host to walk dropped directories and pass each
  file's path, which `wac.lock` pins to a local wac commit (`0597a1e5`, on branch `web-folder-drops`) that
  is not on GitHub yet: `wac update` cannot fetch it from elsewhere, and a hosted build cannot make it.

## Not yet

A terminal (the next milestone), zip writing, dragging files between windows, multiple desktops,
keyboard window switching, settings. In archives: encrypted entries and deflate64, bzip2, lzma or xz zip
entries are listed but not opened; files over about 32 MB are not hashed. Markdown opened from the disk
shows its images' alt text rather than the images.
