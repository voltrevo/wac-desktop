#!/bin/sh
# Build the site from nothing but this repository and GitHub: what the Pages workflow runs.
#
#     sh tools/ci-build.sh          # leaves the site in dist/
#
# Clones wac (into $WAC_SRC, .wac-src by default), adds the commits wac-patches/ carries, bootstraps the
# `wac` command on Node from the commit wac.lock pins — skipped when $WAC_HOME already has one, as a
# cached CI run does — then tests and builds. Needs git, curl-free network access to GitHub, and Node 22+.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
export WAC_HOME="${WAC_HOME:-$HOME/.wac}"
src="${WAC_SRC:-$root/.wac-src}"
commit=$(sed -n 's/.*"commit": "\([0-9a-f]\{40\}\)".*/\1/p' wac.lock | head -n 1)

if [ ! -d "$src/.git" ]; then
  # Commits and trees only; file contents arrive as the checkout and the cache ask for them.
  git clone -q --filter=blob:none https://github.com/voltrevo/wac "$src"
fi
sh tools/use-local-wac.sh "$src"

if [ ! -x "$WAC_HOME/bin/wac" ]; then
  git -C "$src" -c advice.detachedHead=false checkout -q "$commit"
  (cd "$src" && ./bootstrap.sh --host nodejs --no-profile)
fi
export PATH="$WAC_HOME/bin:$PATH"

wac update
wac task test
wac task build
touch dist/.nojekyll
echo "the site is in dist/: $(ls dist | tr '\n' ' ')"
