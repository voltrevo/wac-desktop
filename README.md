# Archive Explorer

Drop a file or a folder on the page and look inside it. zip, tar, gzip and zstd archives open as
folders, and so does any archive inside one, as deep as they go. Files preview as text, hex or images, and can be saved
one at a time. Everything happens in the browser tab: the page has no network access, and nothing is
kept once it closes.

It is written in [wac](https://github.com/voltrevo/wac) and builds to a single `dist/index.html`.

    wac update          # fetch the `web` package, once
    wac task build      # src/app.wac -> dist/index.html
    wac task serve      # http://localhost:8080
    wac task test       # the formats, and the page driven without a browser
    wac task test:drops # real drops in Chromium: files and folders, file:// and http:// (needs Playwright)

## Layout

| | |
|---|---|
| `src/app.wac` | the page: landing, top bar, listing, keyboard, the loop that receives files |
| `src/preview.wac` | the right-hand pane: text, hex, image, info, and a nested archive's card |
| `src/markdown.wac` | Markdown rendered: CommonMark blocks, GFM tables and task lists, images and links resolved inside the archive |
| `src/jsonview.wac` | JSON as a folding tree |
| `src/table.wac` | CSV and TSV, delimiter detected |
| `src/highlight.wac` | syntax highlighting: one tokenizer, a profile per family of languages |
| `src/model.wac` | the state and every change to it; levels for nested archives |
| `src/archive.wac` | zip (incl. zip64, CP437 names, self-extracting stubs), tar (GNU and pax names), gzip, zstd |
| `src/tree.wac` | folders built from flat paths |
| `src/sniff.wac` | what a file is, from its bytes |
| `src/style.wac` | the stylesheet, light and dark, and the icons as SVG `data:` URLs |
| `vendor/` | inflate, CRC-32, zstd, SHA-256, JSON and number formatting, copied from wac's `packages/` at `a66fe9d51` |
| `tools/fixtures.py`, `tools/demo.py` | the test archives, and `samples/demo.zip` |

## How it behaves

- **Previews follow the file.** Markdown renders — with its images and links resolved inside the
  archive, so a README shows its own logo and `[guide](docs/guide.md)` goes there — JSON is a folding
  tree, CSV and TSV are tables, and code is highlighted. Text, Hex and Info stay a tab away. Big files
  are capped (the first 4,000 tree rows, 2,000 table rows, 128 KB of colour) so the page stays quick.

- **Folders** — dropped, or chosen with "Choose a folder" — open like an archive, and archives inside
  them open as nested levels. Things dropped together open together: a folder and a loose file, or
  several archives, become one "Dropped items" folder. Their files arrive one at a time with nothing marking the last, so the
  page gathers them until 600 ms pass with no more. This needs the `web` package's host to walk dropped
  directories and pass each file's path, which `wac.lock` pins to a local wac commit (`0597a1e5`, on
  branch `web-folder-drops`) that is not on GitHub yet: `wac update` cannot fetch it from elsewhere.

- **Listing is cheap and reading is lazy.** Opening a zip reads only its central directory, and an
  entry is decompressed the first time somebody looks at it. A 4,400-entry, 13 MB zip opens in about
  150 ms.
- **Keyboard:** arrows move (and preview), Enter opens a folder or an archive, Backspace goes up,
  Home/End/PageUp/PageDown jump; Escape clears the filter.
- **The filter searches everything below the current folder**, and shows where each match lives.
- **Damaged archives:** the vendored decompressors `trap` on bad data, and wac cannot catch a trap. The
  page runs on one thread, so a timer that finds work still marked in progress knows it died; it shows
  an error and records the entry as damaged. The loop that receives files never opens anything itself,
  so a trap cannot take it down.

## Not yet

Encrypted zip entries, and deflate64, bzip2, lzma or xz zip entries, are listed with an explanation
rather than opened. Files larger than about 32 MB are not hashed.
