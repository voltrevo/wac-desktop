# Changes to wac this project needs

Four commits to wac's `web` package, on top of wac `a66fe9d51`: a page can receive the files of a dropped
or picked folder, named by their paths. They are proposed upstream but not merged, so `wac.lock` pins a
commit GitHub does not have, and `wac update` cannot fetch it.

- `web-folder-drops.git.bundle` — the commits, with their exact hashes; `tools/use-local-wac.sh` adds them
  to a clone of wac and puts the pinned commit in wac's package cache, and `tools/ci-build.sh` does all of
  it from nothing, which is how GitHub Actions builds the site.
- `000*.patch` — the same commits as patches, for reading or `git am`.

When the commits are merged or pushed somewhere public, point `wac.lock` at that commit and delete this
folder and those two scripts.
