#!/bin/sh
# Put the wac commit that wac.lock pins into wac's package cache from a local clone, without `wac update`.
#
#     sh tools/use-local-wac.sh /path/to/a/clone/of/voltrevo/wac
#
# `wac update` fetches the same thing over the network; this is for where it cannot (it could not in the
# container this project was made in) and for CI, which has a clone already. The cache is
# $WAC_HOME/cache/git, `$HOME/.wac` by default, which is where `wac` looks for a locked dependency.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
repo=${1:?usage: use-local-wac.sh <path to a clone of voltrevo/wac>}
commit=$(sed -n 's/.*"commit": "\([0-9a-f]\{40\}\)".*/\1/p' "$root/wac.lock" | head -n 1)
[ -n "$commit" ] || { echo "use-local-wac.sh: no commit in wac.lock" >&2; exit 1; }
git -C "$repo" cat-file -e "$commit^{commit}" 2>/dev/null || git -C "$repo" fetch -q origin "$commit"
dest="${WAC_HOME:-$HOME/.wac}/cache/git/https%3A%2F%2Fgithub.com%2Fvoltrevo%2Fwac/$commit"
if [ ! -f "$dest/pack.pack" ]; then
  mkdir -p "$dest"
  git -C "$repo" archive "$commit" | tar -x -C "$dest"
  touch "$dest/pack.pack"     # the cache's "this checkout is complete" marker
fi
echo "wac $commit is in the cache"
