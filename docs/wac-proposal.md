# What the desktop needs from wac

The desktop is a tactical, DOM-only experiment, built in wac as an outside consumer of the wac
repository. It is a page with windows, Files, a Viewer, an Editor, and a Terminal running box's
`Session`. This note lists what it needs from wac, most important first. Items 1 and 2 are already
written, as commits on a local branch.

The base is wac `a66fe9d51`. The branch is `wac-desktop` (5 commits, not pushed). It is carried in
this project as `wac-patches/wac-desktop.git.bundle` and `wac-patches/000*.patch`.

## 1. Merge the folder-drop commits to `web` (written)

A page should receive the files of a dropped or picked folder, each named by its path inside the
folder. Today a dropped folder arrives as one unreadable item.

| Commit | Change |
|---|---|
| `704c0908` | Walk a dropped folder, and name every file from a folder (dropped, or picked with `<input webkitdirectory>`) by its path. A lone file is still just its name. |
| `f7ff0795` | Read a dropped folder through a `FileSystemHandle` where the browser has one. On a `file://` page the entry API fails with `EncodingError`. |
| `71bdb1fd` | If the browser refuses the handle, fall back to the entry API. If both fail, report "a dropped folder could not be listed", so the page can offer a picker. |
| `0597a1e5` | Read a dropped *file* as a file, and walk only folders. Without this, single-file drops break in browsers that have no handle API, such as Brave. |

The change is +59 −7 lines in three files: `tools/build.wac`, the `Picked` documentation in
`src/page.wac`, and the package README. Real drops were tested in Chromium on `file://` and `http://`,
with the handle API present, missing and refusing (18 cases).

## 2. Merge the growable generic-instantiation table in `wacc` (written)

**Commit:** `d9ff81c8`, in `packages/wacc/src/emit.wac`, `Env.instantiate`.

**Problem:** the emitter keeps a fixed-size table of generic instantiations. When a module names
more than it has room for, the build fails with *"the emitter ran out of room for generic
instantiations"*. The desktop reached the limit once it carried the shell, because the module is
large, not because anything in it is wrong.

**Change:** the table now doubles when full, like the lambda capture tables. The compiler still
reaches a fixed point under `./bootstrap.sh`. The 3.4 MB desktop page builds with it.

Because the fix is inside the compiler, the project's CI bootstraps `wac` from the pinned commit
instead of using an installed one. That is part of why CI takes about two minutes.

## 3. `import { … } from "wac"` (already under way)

The project vendors 176 files (40,361 lines) from 19 packages, using `tools/vendor_wac.py`. The roots
it needs are:

- `box` (`Session`, `boxApplet`, `boxNames`)
- `fs` (`Fs`, `mountSystem`)
- `json`
- `gzip` (inflate, CRC-32)
- `zstd`
- `crypto` (SHA-256)

Once the wac root exports its packages, the vendored copy goes away and these become ordinary
imports. A note for that work: `box/src/shrun.wac` and `box/src/lib/session.wac` are what an
embedder actually imports, so they deserve a stable, exported name.

## 4. Let the web host run a wasm module it is given

This is what a `wac` command, or any compiled program, needs to run inside the terminal. At the moment:

- **`cli.spawn` ignores its bytes.** It starts another copy of the page
  (`packages/web/tools/build.wac`, `spawn`: `new Worker(self.location.href)`). The page can therefore
  run only the programs compiled into it. A `.wasm` on the disk found through `$WACPATH` cannot run,
  although it runs on the other three hosts.
- **`cli.load` always refuses** (`packages/web/src/system.wac:425`, `LoadedModule.of(-2, NOT_HERE)`).

**Proposal:** add a generic child worker that instantiates the module it is handed and connects it
to the same system half that a spawned page copy gets: arguments, streams, the filesystem relay and
grants. `spawn` would choose between the page copy and the generic worker by what it is given. Then:

- the desktop shell runs `$WACPATH` programs like the other hosts do;
- an in-page `wac` can `run` and `test` what it compiles;
- the page gets the same capability set as the other hosts.

This probably overlaps with the more ambitious desktop in the wac repository, so it belongs in wac
rather than in this project's patches.

## 5. Spawn from the page, so `file://` gets processes

A page opened from a file has an opaque origin. A worker there may not start workers of its own:
*"Failed to construct 'Worker': Script at 'blob:null/…' cannot be accessed from origin 'null'"*.
The top-level page can still start workers.

The desktop works around this by setting `sh.externalSpawnable = false` when running from a file.
Box's programs then run inside the shell's worker. They work, but `^C` cannot stop one that loops.

**Proposal:** route a worker's `spawn` request to the page's main thread and have it start the
child there, as a sibling of the requesting worker. Streams relay through the page. This keeps
processes, and `^C`, on `file://`.

## 6. Smaller things a page needs

- **Keys with modifiers in `prevent`.** `prevent` matches by key name only. A page cannot take Ctrl+S
  (the Editor's save) or Ctrl+L (the terminal's clear) without also blocking plain `s` and `l`.
  Something like `prevent="Ctrl+s Ctrl+l"` would cover it.
- **The reader's time zone.** A page is told the time but not the offset, so the taskbar clock says
  UTC. One number, the offset in minutes, would be enough.
- **Recoverable decode errors.** The gzip and zstd decoders `trap` on bad input, and a trap cannot be
  caught. The desktop detects a dead decode with a watchdog: work marks itself in progress, and a
  timer that still sees the mark reports the failure. Result-returning entry points (`inflate` →
  `Result<u8[], string>`, and the same for zstd frames) would remove that workaround.
- **Reproducible builds.** The module's debug names include the absolute path of the package cache
  (`…root__wac_cache_git_…`). The same source built under a different `$WAC_HOME` therefore gives
  different bytes, with the builder's home path inside. Names relative to the cache would fix it.
- **`wac update` on the Node host** failed with *"network access not granted to this
  application"* in the container this was built in. The project works around it by filling the cache
  with `tools/use-local-wac.sh`. It may be the container's network rather than wac; worth checking
  whether the fetch path asks for the network grant.
- **Box gaps seen from the terminal:** `ls -l` reports "not implemented", and `ps` does not list the
  shell that a `Session` started.
- **A LICENSE file.** The repository has none, and the project vendors and publishes wac code.

## 7. Later: `wac` inside the terminal

`packages/wac/src/wac.wac` is an ordinary `main(Sys)` program, and the compiler does no I/O, so a page
can carry the command as one more applet. With items 3 and 4 in place:

- `wac check`, `compile` and `build` work on the desktop's disk;
- `run` and `test` work too.

Two things are needed for it:

- **The `wac` command importable from outside the repository.** This falls under item 3. For example,
  the root could export `wac`'s `main` under a name.
- **A way to give an in-page `wac` its packages without a network.** For example, `$WAC_HOME`
  could be a folder on the page's disk that the page seeds.

The expected cost is the page growing from 3.4 MB to about 6–7 MB. That has not been measured.

## Summary

| # | What | Where | State |
|---|---|---|---|
| 1 | Folder drops | `web` | 4 commits, ready |
| 2 | Growable instantiation table | `wacc` | 1 commit, ready |
| 3 | `from "wac"` | repo root | under way upstream |
| 4 | Run a given module (`spawn` bytes, `load`) | `web` host | proposal |
| 5 | Spawn via the page on `file://` | `web` host | proposal |
| 6 | Modifier keys, time zone, decode results, reproducible names, `wac update`, box gaps, LICENSE | various | requests |
| 7 | `wac` as an applet | `wac`, `web` | depends on 3 and 4 |
