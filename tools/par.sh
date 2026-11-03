#!/usr/bin/env bash
# Run independent commands side by side, and fail if any of them failed.
#
#     bash tools/par.sh 'cmd one' 'cmd two' ...      # at $PAR_JOBS at once (default: the cores, at most 4)
#
# **Why this exists.** `wac task build` was twelve `wac run build.wac` calls joined by `&&`, and the
# browser tests were nine `node tools/*_test.js` run one after another. None of them depends on another:
# each build writes only its own output directory, and each browser test serves `dist/` read-only on a
# port of its own (`listen(0)`) with a temporary directory of its own. Measured on 4 cores, 2026-11-03:
# the builds were 111s in a row and the browser tests 212s of wall clock for about 50s of CPU — they
# mostly wait on a page — so running them in a row was paying for waiting, one wait at a time.
#
# **Each command's output is held and printed whole when it ends**, with its name, its time and its
# status, so nine interleaved logs never have to be read at once. The first failure is not a reason
# to stop the others: a gate wants every verdict, not just the first.
#
# **The exit status is the number of commands that failed**, capped at 125, so `&&` after this means
# "all of them passed".
set -u

jobs="${PAR_JOBS:-}"
if [ -z "$jobs" ]; then
  jobs=$(nproc 2>/dev/null || echo 2)
  [ "$jobs" -gt 4 ] && jobs=4
fi

tmp=$(mktemp -d "${TMPDIR:-/tmp}/par-XXXXXX")
trap 'rm -rf "$tmp"' EXIT

n=$#
i=0
running=0
failed=0
declare -A started name

finish() {
  # Wait for whichever command ends next, and report it.
  local pid status k
  wait -n -p pid
  status=$?
  k=${name[$pid]}
  local took=$(( $(date +%s) - ${started[$pid]} ))
  if [ "$status" -eq 0 ]; then
    echo "== ok   (${took}s) ${cmds[$k]}"
  else
    echo "== FAIL (${took}s, exit $status) ${cmds[$k]}"
    failed=$((failed + 1))
  fi
  cat "$tmp/$k.out"
  running=$((running - 1))
}

cmds=("$@")
for ((i = 0; i < n; i++)); do
  while [ "$running" -ge "$jobs" ]; do finish; done
  bash -c "${cmds[$i]}" > "$tmp/$i.out" 2>&1 &
  name[$!]=$i
  started[$!]=$(date +%s)
  running=$((running + 1))
done
while [ "$running" -gt 0 ]; do finish; done

if [ "$failed" -gt 0 ]; then
  echo "== $failed of $n failed"
  [ "$failed" -gt 125 ] && failed=125
  exit "$failed"
fi
echo "== all $n passed"
