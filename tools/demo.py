#!/usr/bin/env python3
"""Writes samples/demo.zip: a small project-shaped archive to explore, with a nested .tar.gz inside."""
import gzip, io, json, math, os, random, struct, tarfile, zipfile, zlib

here = os.path.dirname(os.path.abspath(__file__))
repo = os.path.join(here, "..")

def png(w, h):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            t = x / w; u = y / h
            d = math.hypot(x - w * .68, y - h * .32) / w
            r = int(91 + 120 * t * (1 - d)); g = int(85 + 40 * u); b = int(230 - 60 * u + 20 * math.sin(d * 9))
            a = 255
            raw += bytes((max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), a))
    def chunk(k, d): return struct.pack(">I", len(d)) + k + d + struct.pack(">I", zlib.crc32(k + d))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + \
        chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")

def targz():
    b = io.BytesIO()
    with tarfile.open(fileobj=b, mode="w") as t:
        def add(name, data, mtime=1717000000):
            i = tarfile.TarInfo(name); i.size = len(data); i.mtime = mtime
            t.addfile(i, io.BytesIO(data))
        add("libfoo-1.2/README", b"libfoo 1.2\n\nA tiny library, vendored.\n")
        add("libfoo-1.2/foo.h", b"#pragma once\nint foo(int x);\n")
        add("libfoo-1.2/foo.c", b'#include "foo.h"\n\nint foo(int x) {\n  return x * 2 + 1;\n}\n' * 3)
        add("libfoo-1.2/LICENSE", b"MIT License\n\nPermission is hereby granted, free of charge...\n" * 4)
    return gzip.compress(b.getvalue(), mtime=1717000000)

C = r'''#include <stdio.h>
#include "util/strings.h"

/* Count the words on standard input, and say how many there were. */
int main(int argc, char **argv) {
    char line[4096];
    long words = 0, lines = 0;
    while (fgets(line, sizeof line, stdin)) {
        words += count_words(line);
        lines++;
    }
    printf("%ld words on %ld lines\n", words, lines);
    return 0;
}
'''
STR = r'''#include <ctype.h>
#include "strings.h"

int count_words(const char *s) {
    int n = 0, in_word = 0;
    for (; *s; s++) {
        if (isspace((unsigned char)*s)) { in_word = 0; }
        else if (!in_word) { in_word = 1; n++; }
    }
    return n;
}
'''
README = """<p align="center"><img src="assets/logo.png" alt="wordcount logo" width="240"></p>

# wordcount

A small program that counts words, packed up to show off **Archive Explorer** — every file here
was opened in your browser tab, by a page written in [wac](https://github.com/voltrevo/wac).

## What's inside

| Folder | What it holds | Files |
|:-------|:--------------|------:|
| `src/` | the C sources | 3 |
| `assets/` | a logo and a banner | 2 |
| `vendor/` | a library, as the `.tar.gz` it shipped in | 1 |
| `data/` | a table, a config and some bytes | 3 |

## Building

```sh
make            # builds ./wordcount
./wordcount < README.md
```

The whole program is one loop — see [`src/main.c`](src/main.c):

```c
while (fgets(line, sizeof line, stdin)) {
    words += count_words(line);   /* src/util/strings.c */
    lines++;
}
```

## Roadmap

- [x] count words
- [x] count lines
- [ ] count *characters*, including ~~bytes~~ multi-byte ones
  - and maybe graphemes

> **Note:** the [guide](docs/guide.md) has more, and `data/cities.csv` is there to try the table view.

---

Made with care. Questions? https://example.invalid/wordcount
"""

def entry(z, name, data, when, method=zipfile.ZIP_DEFLATED):
    i = zipfile.ZipInfo(name, when); i.compress_type = method
    z.writestr(i, data)

random.seed(7)
out = os.path.join(repo, "samples", "demo.zip")
with zipfile.ZipFile(out, "w") as z:
    entry(z, "wordcount/README.md", README, (2026, 10, 2, 9, 12, 0))
    entry(z, "wordcount/Makefile", "CFLAGS = -O2 -Wall\n\nwordcount: src/main.c src/util/strings.c\n\t$(CC) $(CFLAGS) -o $@ $^\n", (2026, 9, 28, 17, 40, 0))
    entry(z, "wordcount/src/main.c", C, (2026, 10, 1, 22, 3, 0))
    entry(z, "wordcount/src/util/strings.c", STR, (2026, 9, 30, 11, 47, 0))
    entry(z, "wordcount/src/util/strings.h", "#pragma once\n\nint count_words(const char *s);\n", (2026, 9, 30, 11, 45, 0))
    entry(z, "wordcount/assets/logo.png", png(320, 200), (2026, 9, 21, 14, 0, 0), zipfile.ZIP_STORED)
    entry(z, "wordcount/assets/banner.svg", open(os.path.join("/home/user/wac/site/public/banner.svg"), "rb").read(), (2026, 9, 21, 14, 2, 0))
    entry(z, "wordcount/data/cities.csv", "city,country,population\n" + "".join(
        "%s,%s,%d\n" % (c, k, p) for c, k, p in [("Tokyo", "JP", 37400068), ("Delhi", "IN", 28514000), ("Shanghai", "CN", 25582000),
        ("São Paulo", "BR", 21650000), ("Mexico City", "MX", 21581000), ("Cairo", "EG", 20076000), ("Mumbai", "IN", 19980000),
        ("Beijing", "CN", 19618000), ("Dhaka", "BD", 19578000), ("Osaka", "JP", 19281000)]), (2026, 8, 14, 8, 0, 0))
    entry(z, "wordcount/package.json", json.dumps({"name": "wordcount", "version": "1.4.0", "private": True,
        "description": "Counts words, lines and (soon) characters", "scripts": {"build": "make", "test": "make test"},
        "keywords": ["text", "cli", "wac"], "engines": {"node": ">=22"}, "files": ["src", "assets"],
        "dependencies": {"libfoo": "1.2.0"}, "repository": {"type": "git", "url": "https://example.invalid/wordcount.git"}}, indent=2) + "\n", (2026, 10, 2, 9, 20, 0))
    entry(z, "wordcount/data/config.json", json.dumps({"locale": "en-GB", "delimiters": [" ", "\t", "\n"],
        "limits": {"maxLine": 4096, "maxWords": None, "strict": False},
        "outputs": [{"format": "text", "pretty": True}, {"format": "json", "fields": ["words", "lines", "bytes"]}],
        "history": [{"version": "1.%d.0" % k, "words": 1000 * k + 7} for k in range(12)]}, indent=2), (2026, 8, 14, 8, 5, 0))
    entry(z, "wordcount/data/sample.bin", bytes(random.getrandbits(8) for _ in range(3000)), (2026, 8, 14, 8, 1, 0))
    entry(z, "wordcount/vendor/libfoo-1.2.tar.gz", targz(), (2026, 6, 1, 12, 0, 0), zipfile.ZIP_STORED)
    entry(z, "wordcount/docs/guide.md", "# Guide\n\nBack to the [README](../README.md).\n\n## Usage\n\nRun `make`, then pipe text into `./wordcount`:\n\n```sh\ncat *.md | ./wordcount\n```\n\n1. Build it\n2. Run it\n3. Count things\n", (2026, 10, 2, 9, 30, 0))
print(out, os.path.getsize(out))
