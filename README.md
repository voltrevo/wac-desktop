# Archive Explorer

Drop a file on the page and look inside it. zip, tar, gzip and zstd archives open as folders, and so
does any archive inside one, as deep as they go. Files preview as text, hex or images, and can be saved
one at a time. Everything happens in the browser tab: the page has no network access, and nothing is
kept once it closes.

It is written in [wac](https://github.com/voltrevo/wac) and builds to a single `dist/index.html`.

    wac update          # fetch the `web` package, once
    wac task build      # src/app.wac -> dist/index.html
    wac task serve      # http://localhost:8080
    wac task test       # the formats, and the page driven without a browser

## Layout

| | |
|---|---|
| `src/app.wac` | the page: landing, top bar, listing, keyboard, the loop that receives files |
| `src/preview.wac` | the right-hand pane: text, hex, image, info, and a nested archive's card |
| `src/model.wac` | the state and every change to it; levels for nested archives |
| `src/archive.wac` | zip (incl. zip64, CP437 names, self-extracting stubs), tar (GNU and pax names), gzip, zstd |
| `src/tree.wac` | folders built from flat paths |
| `src/sniff.wac` | what a file is, from its bytes |
| `src/style.wac` | the stylesheet, light and dark, and the icons as SVG `data:` URLs |
| `vendor/` | inflate, CRC-32, zstd and SHA-256, copied from wac's `packages/` at `a66fe9d51` |
| `tools/fixtures.py`, `tools/demo.py` | the test archives, and `samples/demo.zip` |

## How it behaves

- **Listing is cheap and reading is lazy.** Opening a zip reads only its central directory, and an
  entry is decompressed the first time somebody looks at it. A 4,400-entry, 13 MB zip opens in about
  150 ms.
- **Keyboard:** arrows move (and preview), Enter opens a folder or an archive, Backspace goes up,
  Home/End/PageUp/PageDown jump; Escape clears the filter.
- **The filter searches everything below the current folder**, and shows where each match lives.
- **Damaged archives:** the vendored decompressors `trap` on bad data, and wac cannot catch a trap. The
  page runs on one thread, so a timer that finds work still marked in progress knows it died; it shows
  an error, records the entry as damaged, and restarts the file loop if that was what trapped.

## Not yet

Encrypted zip entries, and deflate64, bzip2, lzma or xz zip entries, are listed with an explanation
rather than opened. Files larger than about 32 MB are not hashed.
