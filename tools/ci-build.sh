#!/bin/sh
# Build the site from nothing but this repository and the repositories wac.lock names: what the Pages workflow runs.
#
#     sh tools/ci-build.sh          # leaves the site in dist/
#
# Bootstraps the `wac` command on Node from the commit wac.lock pins — the same commit the project's wac
# dependencies are — into $WAC_TOOL (.wac-tool by default), cloning wac into $WAC_SRC (.wac-src) to do it; skipped
# when $WAC_TOOL already holds the command for that commit, as a cached CI run's does. Puts every pinned commit in
# wac's package cache, and drops the checkouts no pin names; then tests and builds. Needs git that can fetch
# https://github.com/voltrevo/ (or the mirror `tools/use-mirror.sh` sets), and Node 22+.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
export WAC_HOME="${WAC_HOME:-$HOME/.wac}"
src="${WAC_SRC:-$root/.wac-src}"
tool="${WAC_TOOL:-$root/.wac-tool}"
commit=$(sed -n 's/.*"wac": {.*"commit": "\([0-9a-f]\{40\}\)".*/\1/p' wac.lock | head -n 1)

sh tools/fill-cache.sh
# What a pin no longer names: gone, so a cache carried from run to run keeps only what this build reads.
pinned=$(sed -n 's/.*"commit": "\([0-9a-f]\{40\}\)".*/\1/p' wac.lock)
for d in "$WAC_HOME"/cache/git/*/*/; do
  [ -d "$d" ] || continue
  printf '%s\n' "$pinned" | grep -qx "$(basename "$d")" || rm -rf "$d"
done

# **The command, made once for each wac commit**: the slow part, and the only part a new wac pin redoes. Its
# commit is written beside it, so a command left from another pin is made again rather than used.
if [ ! -x "$tool/wac" ] || [ "$(cat "$tool/commit" 2>/dev/null)" != "$commit" ]; then
  if [ ! -d "$src/.git" ]; then
    # Commits and trees only; file contents arrive as the checkout asks for them.
    git clone -q --filter=blob:none https://github.com/voltrevo/wac.git "$src"
  fi
  git -C "$src" -c advice.detachedHead=false checkout -q "$commit"
  mkdir -p "$tool"
  (cd "$src" && ./bootstrap.sh --host nodejs -o "$tool/wac")
  echo "$commit" > "$tool/commit"
fi
export PATH="$tool:$PATH"
echo "wac: $(command -v wac), from $commit"

wac task test
wac task build
touch dist/.nojekyll
echo "the site is in dist/: $(ls dist | tr '\n' ' ')"
