#!/bin/sh
# Make the wac commit that wac.lock pins available to `wac`, without GitHub.
#
#     sh tools/use-local-wac.sh /path/to/a/clone/of/voltrevo/wac
#
# Adds the commits in wac-patches/ to that clone (the same hashes as the lock), then writes the pinned
# commit into wac's package cache — $WAC_HOME/cache/git, `$HOME/.wac` by default — which is where `wac`
# looks for a locked dependency. See wac-patches/README.md for why this exists.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
repo=${1:?usage: use-local-wac.sh <path to a clone of voltrevo/wac>}
commit=$(sed -n 's/.*"commit": "\([0-9a-f]\{40\}\)".*/\1/p' "$root/wac.lock" | head -n 1)
[ -n "$commit" ] || { echo "use-local-wac.sh: no commit in wac.lock" >&2; exit 1; }
git -C "$repo" fetch -q "$root/wac-patches/web-folder-drops.git.bundle" "web-folder-drops:web-folder-drops"
git -C "$repo" cat-file -e "$commit^{commit}" || { echo "use-local-wac.sh: $commit is not in the bundle" >&2; exit 1; }
dest="${WAC_HOME:-$HOME/.wac}/cache/git/https%3A%2F%2Fgithub.com%2Fvoltrevo%2Fwac/$commit"
if [ ! -f "$dest/pack.pack" ]; then
  mkdir -p "$dest"
  git -C "$repo" archive "$commit" | tar -x -C "$dest"
  touch "$dest/pack.pack"     # the cache's "this checkout is complete" marker
fi
echo "wac $commit is in the cache"
