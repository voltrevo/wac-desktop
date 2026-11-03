# Desktop (and the Archive Explorer)

A desktop that runs in a browser tab: windows you can move, resize, snap and minimise, a taskbar, and a
disk of its own that survives a reload. Its apps are **Files** — which browses the disk and opens any zip,
tar, gzip or zstd archive in place, with **Extract here** to unpack one — a **Viewer**, a text
**Editor**, a **Markdown editor**, **Paint**, a **Terminal**, which is wac's own shell on the desktop's disk, a **Calculator**, **Mandelbrot**, **Pip and the Lost Lanterns**, **Stackfall**, and the **wac IDE** —
each a program of its own on the site the desktop is served from, started in windows it opens itself — and
**Settings**. Deleting moves things to a **Trash**. Nothing is uploaded: the page has no network access, and its files live in the browser.

It is written in [wac](https://github.com/voltrevo/wac), uses the DOM for everything it draws, and builds
to single HTML files. The standalone **Archive Explorer** it grew from is built alongside it.

## Building it

**Everything is pinned in `wac.lock`**: wac at `6f3ee4093` — the `wac` command should be built from that commit, and
its packages are `import { json.parse } from "wac"` — and `web`, the page and its builder (the wac-web repository), at
`d63440e` — and the wac IDE at `2811561`. All are public repositories at `https://github.com/voltrevo/`. `wac.json5` names each commit as the `ref` of
its dependencies (`wac`, `web`, `webbuild`), and `wac.lock` agrees. To move one, change its refs and the lock
together — and rebuild `wac` when it is wac that moved; `tools/ci-build.sh` and `tools/wacbin.py` read the commits
from `wac.lock`.

Getting that `wac`, on a machine with git and Node 22+:

```bash
git clone https://github.com/voltrevo/wac.git ~/src/wac
```

```bash
git -C ~/src/wac checkout 6f3ee40931c09aed8cdd66950cbb51b4954924b7
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
    wac task test:pip       # Pip played, heard, measured, paused, another level chosen, muted and silenced, in Chromium
    wac task test:settings  # Settings reaching every window and a game's sound; the Markdown editor, in Chromium
    wac task test:phone     # the desktop on a phone: its home screen, Back, what is open, Files by tap — as an iPhone
    wac task test:full      # full screen given only after a tap, and left whatever a hostile program does; Pip's
    wac task test:mandelbrot # Mandelbrot drawn, dragged, zoomed, recoloured, saved and kept, in Chromium
    wac task test:paint  # Paint drawn in, filled, undone, saved, reopened, dropped on, coloured, selected, pasted and typed in
    wac task test:stackfall-audio # Audio cues, mute, music, focus and saved preferences in Chromium
    wac task test:stackfall # Stackfall controls, focus, saves and restart in Chromium (needs Playwright)
    wac task test:desk   # the desktop in Chromium, as a person uses it (needs Playwright)
    wac task test:drops  # real drops on the Archive Explorer: files and folders, file:// and http://

**`tools/fill-cache.sh` fetches with `git`** each commit `wac.lock` pins and puts it where `wac` looks — what
`wac update` does too, except through a mirror. **During development the commits are on git.voltrevo.com first**,
and reach GitHub when the owner syncs them; `sh tools/use-mirror.sh`, once per machine, has `git` fetch GitHub's
URLs from there (one `insteadOf` setting), which `wac update`'s own fetcher does not follow.

`sh tools/ci-build.sh` does all of this from nothing — clone, check out the pinned commit, bootstrap,
fill the cache, test, build — and is what publishing runs.

**Publishing:** `.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages on every
push to the default branch — set the repository's Pages source to "GitHub Actions". It runs
`tools/ci-build.sh`, caching the bootstrapped `wac` between runs, keyed on `wac.lock`. Everything it fetches is
public on GitHub, so it needs nothing else — **as long as the commits this repository pins are on GitHub before it
is**: sync wac, wac-web and wac-ide first, then this.

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
  else to open it — text and code in the Editor, Markdown and data in the Viewer (or wherever Settings says), the
  rest in a Viewer. Beside the listing, the selected
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
- **Paint** draws, and opens, changes and saves PNGs. Its tools are a pencil with hard edges, a soft brush, an eraser
  (to transparent), lines, rectangles and ellipses — Shift keeps a line to 45° and a shape square — a fill with a
  tolerance, text, a selection, and a picker that takes a colour from the picture; lines, ellipses and the eraser can
  be smooth or hard. Alt draws with the second colour. **The colour picker** — a click on either colour — has a square
  of saturation and value, hue and opacity strips, the colour as hex (`#rrggbbaa` with opacity), the colour before,
  and the colours lately chosen; every colour can be part transparent. **A selection** is dragged out, moved by
  dragging inside it (with Alt, a copy), nudged with the arrows, and put down with Enter, as one step to undo; Ctrl+C,
  Ctrl+X and Ctrl+V copy, cut and paste, through `clipboard.png` in Paint's folder, so every Paint window pastes what
  another copied; Delete clears to transparent, and Crop keeps only what is selected. **Text** is typed where the
  picture is clicked, drawn as it is typed in unscii-16, wac's bitmap font, 16 to 128 pixels high, bold or not,
  and can be dragged before Enter puts it down. A stroke can leave the picture and come back. Undo and redo (Ctrl+Z, Ctrl+Y) go
  back through strokes and through flips, quarter turns, new canvas sizes and scaling, up to 100 steps or 100 MB.
  Zoom from 6% to 3200%, with the pixels square from 200%; transparency shows as a checkerboard. It reads every kind of
  PNG — palettes, greyscale, sixteen bits, interlaced — and writes eight-bit RGBA. **Edit** on a PNG, in Files or the
  Viewer, opens it in Paint; Open asks the desktop's picker; a PNG dropped on its window opens there; a new picture is
  saved on the Desktop under the name typed. Its tool, sizes and colours are kept in its folder; `?` lists its keys.
- **Mandelbrot** is a rewrite in wac of github.com/voltrevo/mandelbrot: the same values and the same palette, drawn
  from the middle out a block at a time. A drag or the wheel moves the picture at once by the canvas's transform and
  draws it once still; what was worked out is kept, so a drag works out only what came into view and new colours work
  out nothing. The view is kept in its folder, and *Save picture* writes a PNG to the desktop.
- **Pip and the Lost Lanterns** is a little platformer in nineteen levels — five short, long ones of 120 to 210 tiles,
  towers 45 to 73 high climbed by wall-jumping up chimneys, and two in the dark, lit only by the lanterns Pip lights
  and Pip's own glow — all but the first five built by `tools/pip_levels.py`. Light every lantern, then reach the
  door. There are springs, updrafts, wind, lifts, planks, crumbling blocks and sliding planks; beetles, frogs, bats
  that swoop, ghosts that creep up while Pip looks away, and crawlers that walk round walls and ceilings. The rules
  run sixty steps a second whatever the screen's rate, and nothing in them is random, so a run is its keys: the best
  run of each level comes back as a **ghost** to race (`G` hides it), and each level has a par for **gold, silver and
  bronze**. Enter, P or Esc pauses, and the pause card lists the levels reached: the arrows, a number or a click
  plays another. **On a touch screen it has controls of its own**: a pad for the left thumb — touch anywhere in it and
  slide, turning without lifting; **the further it slides the faster Pip runs**, past a small dead zone, full at its
  reach — and a Jump button for the right, held for higher; each keeps its finger until it
  lifts (web's `prevent="capture"` and the event's `pointer`), so both thumbs work at once and a thumb slid off still
  lets go. How hard the run is pushed is part of each step's keys in a run, so a run made with a thumb plays back,
  and races as a ghost, the same; every run made before reads as full speed. Upright, the picture is at the top and the controls below it; on its side they lie over the picture. The
  cards have buttons to tap, and Options says when the controls show and which side Jump is on. **For speedrunning, all opt-in** (**O**, Options, from the title or the pause card, kept in its
  folder): a **full run** (**F**) plays every level in order on one clock — R starts a level again and the time spent
  stays spent — with the whole run's time along the top and how far ahead or behind the best full run it was at the
  last level finished, splits beside it, and the sum of the best of every level; the ghost in a full run is the best
  full run's, or each level's best, or none. **Keys held** can be shown, step by step, in the corner. **Replays**
  (**V**) plays back any best run — paused, faster or slower, five seconds or a step at a time — saves one as a file
  on the Desktop, and takes one from a file to watch and race. A run is its keys (`pip/runs.wac`): every run kept or
  brought in is played again first, and only one that reaches the door, and stops there, is taken.
  `tools/pip_route.wac` finds a route across a level by trying keys, for the tests. Its music is its first tune, kept as it sounds — a plucked pulse lead over a triangle
  bass and ticks of noise — played for each kind of place: slower for the title and the dark, up a tone and faster in
  the towers, in the major in the wind and for the finale (`pip/music.wac`, written down as a tracker would). Each
  song is layers started for one moment: lanterns gently bring in a second voice, high plucks and a quicker tick as
  they are lit, the open door adds an arpeggio, and a racing tick plays while Pip is ahead of its ghost. `wac task pip:music` renders the songs
  as WAV files. **It is
  made to feel latency by**: a corner (`L`) shows how long a key took to reach the program, to be on screen, and to
  send its jump's sound, measured from the browser's own stamp on the key, and the frames a second. **Full screen**
  is its button on the title and pause cards and beside Pause on a touch screen, or Shift+F — or, chosen in Options,
  each level as it starts. Its picture is
  drawn in its own worker (web's surfaces), not passed through the desktop's, so in a window it keeps the frame rate
  it has on a page of its own. Best times and runs are kept in its folder.
  Its artwork is drawn directly on a 320 × 180 pixel grid: a 16 × 20 teal-hooded courier, moss-edged earth and weathered
  stone, brass lanterns, and moonlit fir trees at two parallax depths. `wac run --allow-read --allow-write
  tools/pip_art.wac /tmp/pip-art` renders five fixed-frame scenes as PPM images for art review.
  Pip has eighteen whole-body animation frames (`sprites.wac`): breathing and blinking, a six-frame run, rising
  and tucked jumps, an apex, two falling poses, landing squash and recovery, wall sliding and recoil when hurt.
  Pose selection follows simulation time; landing animation is cosmetic and never delays a jump.
  The five enemy types have their own 16 × 16 artwork and palettes (`enemies.wac`), with 23 frames covering
  walking, a frog's crouch and hop, bat roosting and wing strokes, a ghost freezing or pursuing, and a spiny
  crawler whose picture turns to match its floor, wall or ceiling. The original 12 × 12 enemy rule boxes remain.

- **Stackfall** is an endless falling-block game in the launcher. Every piece is an independent, equally likely
  choice from seven shapes, with replacement: repeats and long gaps are part of play. Enter starts or resumes;
  ←/→ move, ↑/X rotate clockwise, Z anticlockwise, ↓ soft-drops, Space hard-drops, and C/Shift holds once per
  piece. P/Esc pauses. It has a next-piece preview, a landing shadow, a 500 ms lock delay (at most fifteen movement
  resets), and its own key repeat. Each ten rows raises the level and speeds up gravity; one to four rows score
  100/300/500/800 times the current level, soft drop scores one per cell and hard drop two. Clicking another
  window pauses it. Its board, hold, next piece, random stream and best score live in its private `game.json`;
  a reload always returns paused. New game asks for confirmation during a scored game and keeps the best score.
  A delayed timer after a background tab or suspended computer pauses rather than catching up. The standalone
  page has the same game; saving needs a host that grants writable files. Its original, softly synthesised music
  and movement, rotation, hold, drop, lock, row-clear, level-up and game-over effects use the same audio capability
  as Pip. M toggles all sound; the Music switch controls just the background loop. Both preferences are kept in
  `audio.json`. Audio starts only when play starts, and pauses or closes with the game.
- **Full screen is the desktop's to give, and its way out is the desktop's own** (`src/desk/full.wac`). A program asks
  (web's `Element.fullScreen`); the desktop gives it only just after a tap or a key in that program's window, and not
  again after the person has left it without another, so a program cannot take the screen on its own or keep taking it
  back. Given, its window fills the screen with no title bar or taskbar, and the browser's own full screen hides the
  browser's bars where there is one — an iPhone's browser has none, and there the window fills the page. **The way
  out cannot be blocked**: a handle at the top of the screen, which no program can draw over — what it draws stays in
  its window's body — nor hear a tap on, opens a bar to leave full screen, go home or close the program; Escape, or the
  phone's Back, which leaves for the home screen; and anything that puts the window away. A program that has stopped
  answering is no obstacle, since it runs in a worker of its own. As full screen begins, the person is told how to
  leave it. `samples/hostile.wac` tries everything a program could, and `test:full` checks the way out against it.
- **On a phone** — narrower than 700 pixels, or a phone on its side, under 500 high and 1000 wide — the desktop is a phone's: a
  home screen of every app in its groups and what is on the Desktop, a tap starting or opening one; each app the whole
  screen, with only Close; and a taskbar of the apps, home, and what is open — listed over everything, to go back to
  or close. **The phone's Back works**: each app brought to the front is a place in the browser's history (web's
  `Page.go`), so Back leaves it for what was in front before, and Forward returns. In Files a tap goes into a folder,
  and a file tapped is shown below with Open, and a finger on the list scrolls it rather than dragging. The page is
  drawn to the screen's edges (`--edge`) and keeps clear of the notch and home bar itself; an on-screen keyboard
  makes it smaller rather than covering it, and buttons are a thumb's size.
- **Share** (in the launcher) shows the desktop's address as a QR code to point another phone's camera at, and as
  text, and saves the code as a picture. The code is made here (`src/qr.wac`: byte mode, error correction level M,
  versions 1 to 10, every mask tried and the standard's best kept), and its test holds one code whole as an
  independent reader read it back.
- **It installs as an app** — Install in a computer's browser, Add to Home Screen on a phone — and opens standing
  alone, with its own icon (`assets/icon.png`, drawn by `wac task icon`), and **with no network**: the desktop is
  built with web's `--app`, whose service worker answers from the network first and keeps a copy of everything the
  site sends, so the desktop, and every app it has opened before, open offline.
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
  them again — every window of one, each put back where it was: the first by its slot, the rest by their titles,
  which an app reopening its windows gives them again. A closed window's page hears so (web's `Page.closed`). Each is also a page on its own, in `dist/apps/<name>/`. Files and Permissions stay the desktop's own:
  one is how it shows its disk, and the other governs what programs may reach.
- **The wac IDE** (https://github.com/voltrevo/wac-ide, pinned as `ide` and built by `src/apps/ide.wac`) is one of
  them: wac's compiler checking as you type, in a process of its own, and the name at the caret explained. Its
  projects are the folders in `Projects` on the desktop's disk, which it is handed — so Files and the Terminal see
  them, a dropped folder or archive becomes one, Run and Test run what is in front in the IDE's Output panel — a page
  program in a window of its own, titled as it titles itself, which closing stops — and
  Build writes the module beside its source, where a double-click runs it. It is one program with a window per
  project (`Desktop.openWindow`): the launcher brings it forward rather than starting a second.
- **A program's page is a shadow root of its window**, so its stylesheet applies in its window and nowhere else:
  no program can restyle the desktop — its consent dialog included — or another program, and the desktop's rules do
  not reach in. The window's body contains its layout and paint, so `position: fixed` stays in the window too.
- **The Editor** saves with Ctrl+S or its Save button. A new file is saved on the Desktop, under the name typed or
  the first free one like it (`Desktop.newFile`); the Viewer's Edit opens its file in the Editor (`Desktop.edit`) —
  or, for Markdown, in the Markdown editor.
- **The Markdown editor** shows what is written beside it as it is typed — Write, Both or Read — with a toolbar
  (and Ctrl+B, Ctrl+I, Ctrl+K) that wraps what is selected or starts the line, a count of words and minutes to read,
  and saving as the Editor saves. The text field is never redrawn as it is typed into, so the caret is the browser's.
- **Settings** (in the launcher) sets light, dark or as the system is, an accent and a wallpaper; a volume and Mute for
  every program; and which app opens Markdown, JSON and CSV, and other text. Each choice takes effect as it is made
  and is kept in `.desktop/settings.json`. **The look reaches every window**: each colour is a `light-dark()` pair
  chosen by the `color-scheme`, which a program's window — a shadow root that declares no colours of its own —
  inherits from the desktop, accent and all. **The volume reaches every sound**: the desktop's `PageServer` for each
  window scales what that program plays (web's `PageServer.louder`), and fades what is playing already.
- **The clock says UTC**: a page is told the time, but not its reader's time zone.

## Layout

| | |
|---|---|
| `src/desktop.wac` | the desktop's page |
| `src/desk/shell.wac` | the desktop: startup, icons, window frames, taskbar and launcher, files arriving, saving the layout |
| `src/desk/full.wac` | full screen: given only after a tap in the window, and left by the desktop's handle, Escape or Back |
| `src/desk/wm.wac` | windows as records: focus and stacking, minimise and maximise, the drag and resize arithmetic, snapping, the layout as JSON |
| `src/desk/vfs.wac` | the disk: std's `Files` on the browser's storage, or in memory, as the apps use it; copying, free names |
| `src/desk/files.wac` | Files |
| `src/desk/builtin.wac` | the desktop's own apps, as programs on its site: what each is handed, its window, starting one again |
| `src/apps/viewer.wac`, `src/apps/editor.wac`, `src/apps/mdedit.wac`, `src/apps/calc.wac`, `src/apps/terminal.wac`, `src/apps/style.wac` | the Viewer, the Editor, the Markdown editor, the Calculator and the Terminal — box's `Session` with a screen, prompt, completion, type-ahead and `open` — each a program, with its look |
| `src/desk/prefs.wac`, `src/desk/settings.wac` | what Settings keeps — the look as classes and their rules, the volume, what opens what — and its window |
| `src/apps/paint.wac`, `src/apps/paint/` | Paint: its page; the picture, strokes, shapes, fills, selections, text and history (`image.wac`); colours, and hue, saturation and value (`colour.wac`); the font (`font16.wac`, copied from wac — `docs/wac-proposal.md` item 11); its stylesheet |
| `src/png.wac` | PNG written (Mandelbrot and Paint) and read, every kind |
| `src/apps/mandelbrot.wac`, `src/apps/maths.wac` | Mandelbrot, on core's `math`; and decimals read and written as people write them |
| `src/apps/pip.wac`, `src/apps/pip/` | Pip: its page, its rules (`world.wac`), levels, pictures (`art.wac`), sounds (`chip.wac`) and stylesheet |
| `src/apps/stackfall.wac`, `src/apps/stackfall/` | Stackfall: its page, independent game rules, versioned saves and stylesheet |
| `src/apps/ide.wac` | the wac IDE, from the pinned `ide` package, with its checker as `--spawn checker` |
| `src/desk/program.wac` | a program from the disk: started with no window, each window it opens a slice of `wac.page` answered by `web`'s `PageServer` |
| `src/desk/grants.wac`, `src/desk/services.wac`, `src/desk/remember.wac`, `src/desk/allowed.wac` | what a program may reach of the disk; `wac.desktop` answered — the picker, asking, windows, open, note, the clipboard; what each program was allowed, remembered, and the Permissions window to take it back |
| `src/desk/trash.wac` | the Trash and its note of where things came from |
| `src/desk/style.wac`, `src/desk/seed.wac` | the desktop's look; what a new desktop starts with (from `tools/seed.py`) |
| `src/app.wac`, `src/browse.wac` | the Archive Explorer's page; its listing, breadcrumbs and keys, shared with Files |
| `site.wac` | the build's last step: each app's module copied to `dist/apps/<name>.wasm`, and the site's `index.json` |
| `src/preview.wac`, `src/markdown.wac`, `src/jsonview.wac`, `src/table.wac`, `src/highlight.wac` | previews |
| `src/model.wac`, `src/archive.wac`, `src/tree.wac`, `src/sniff.wac` | archives: levels, formats (zip incl. zip64, CP437 names and self-extracting stubs; tar with GNU and pax names; gzip; zstd), folders from paths, what a file is |
| `src/style.wac`, `src/bytes.wac` | the shared stylesheet and icons; byte and number helpers |
| `test/png_fixtures.wac` | PNGs of every kind, and what each reads as (from `tools/png_fixtures.py`, which Pillow runs) |
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
- **Size.** The desktop is about 0.9 MB of module at wac `6f3ee4093` — 2.6 MB while it carried the Terminal and
  `wac`, 3.5 MB at `b0d60f33`, and 5.4 MB at `563d8828`. On the site beside it: the Terminal 1.1 MB, the Archive
  Explorer 0.3 MB, the Viewer 0.3 MB, the Editor and the Calculator 0.15 MB each, Paint 0.4 MB (a quarter of it the font), the IDE 1.7 MB, and `wac` 2.5 MB, each fetched
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
