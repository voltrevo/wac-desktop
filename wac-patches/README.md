# Changes to wac this project needs

Five commits on top of wac `a66fe9d51`, on a branch called `wac-desktop`, proposed upstream but not
merged — so `wac.lock` pins a commit GitHub does not have, and `wac update` cannot fetch it:

- four to the `web` package: a page can receive the files of a dropped or picked folder, named by their
  paths (and dropping a single file keeps working in every browser);
- one to the compiler: the emitter's table of generic instantiations grows as it fills, instead of
  declining a module that names more than it has room for — which the desktop, carrying wac's shell,
  does.

- `wac-desktop.git.bundle` — the commits, with their exact hashes; `tools/use-local-wac.sh` adds them
  to a clone of wac and puts the pinned commit in wac's package cache, and `tools/ci-build.sh` does all of
  it from nothing, which is how GitHub Actions builds the site.
- `000*.patch` — the same commits as patches, for reading or `git am`.

The desktop also builds with `wac` made from this branch: the compiler fix is inside the command, so
`tools/ci-build.sh` bootstraps it from the pinned commit rather than using a released `wac`.

When the commits are merged or pushed somewhere public, point `wac.lock` at that commit and delete this
folder and those two scripts.
