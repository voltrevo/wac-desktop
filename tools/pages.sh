#!/bin/sh
# Put the built site on the `gh-pages` branch, ready to push: run `wac task build` first.
#
#     sh tools/pages.sh
#     git push origin gh-pages          # then, in the repository's settings, serve Pages from it
#
# The desktop is dist/index.html and the Archive Explorer dist/explorer/index.html. Each run adds one
# commit to gh-pages holding exactly what dist/ holds now; nothing else on the branch, and no push.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
[ -f dist/index.html ] || { echo "pages.sh: no dist/index.html — run wac task build first" >&2; exit 1; }
touch dist/.nojekyll                     # serve the files as they are
index=$(mktemp -u)
GIT_INDEX_FILE=$index git --work-tree="$root/dist" add -A -f .
tree=$(GIT_INDEX_FILE=$index git write-tree)
rm -f "$index"
parent=$(git rev-parse -q --verify refs/heads/gh-pages || true)
commit=$(echo "Pages from $(git rev-parse --short HEAD)" | git commit-tree "$tree" ${parent:+-p "$parent"})
git update-ref refs/heads/gh-pages "$commit"
echo "gh-pages is now $(git rev-parse --short gh-pages): $(git ls-tree -r --name-only gh-pages | tr '\n' ' ')"
