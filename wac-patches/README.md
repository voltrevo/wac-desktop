# Changes to wac this project needs

One commit on top of wac's master (`638b4fc6a`), on a branch called `wac-desktop`, proposed upstream
but not merged — so `wac.lock` pins a commit GitHub does not have (`2a6ca392`), and `wac update`
cannot fetch it:

- **the compiler:** the emitter's table of generic instantiations grows as it fills, instead of
  declining a module that names more than it has room for — which the desktop, carrying wac's shell,
  does. Master without it fails the desktop's build with *"the emitter ran out of room for generic
  instantiations"*.

The four `web` commits for dropped folders that used to be here are in master now.

- `wac-desktop.git.bundle` — the commit, with its exact hash; it needs a clone that has wac's master.
  `tools/use-local-wac.sh` adds it to a clone and puts the pinned commit in wac's package cache, and
  `tools/ci-build.sh` does all of it from nothing, which is how GitHub Actions builds the site.
- `0001-*.patch` — the same commit as a patch, for reading or `git am`.

The desktop builds with `wac` made from this branch: the fix is inside the command, so
`tools/ci-build.sh` bootstraps it from the pinned commit rather than using a released `wac`.

When the commit is merged, point `wac.lock` at master and delete this folder and those two scripts.
