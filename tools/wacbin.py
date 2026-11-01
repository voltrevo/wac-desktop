#!/usr/bin/env python3
"""Writes dist/bin/wac: the `wac` command, as a module, for the Terminal to run from the desktop's site.

Built from the commit wac.lock pins — the same one as everything else here — by the `wac` on PATH, out of the
package cache tools/fill-cache.sh (or `wac update`, where it can reach the host) filled. The Terminal's `$WACPATH`
is `/site/bin` (src/apps/terminal.wac), so the shell finds it there and spawns it like any program, from a GET the
browser caches: the desktop's page does not carry it.

    python3 tools/wacbin.py [site-dir]      # dist by default
"""
import json, os, re, subprocess, sys, tempfile, urllib.parse

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.normpath(os.path.join(here, ".."))
lock = json.load(open(os.path.join(root, "wac.lock")))
entry = lock["imports"]["wac"]
home = os.environ.get("WAC_HOME") or os.path.join(os.environ["HOME"], ".wac")
src = os.path.join(home, "cache", "git", urllib.parse.quote(entry["git"], safe=""), entry["commit"])
if not os.path.isfile(os.path.join(src, "packages", "wac", "src", "wac.wac")):
    sys.exit("wacbin.py: wac %s is not in the package cache at %s — run `sh tools/fill-cache.sh`" % (entry["commit"][:9], src))

with tempfile.TemporaryDirectory() as tmp:
    stem = os.path.join(tmp, "wac")
    done = subprocess.run(["wac", "build", "packages/wac/src/wac.wac", "-o", stem], cwd=src,
                          capture_output=True, text=True)
    if done.returncode != 0:
        sys.exit("wacbin.py: building the wac command failed:\n" + done.stderr + done.stdout)
    module = open(stem + ".wasm", "rb").read()

site = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "dist")
os.makedirs(os.path.join(site, "bin"), exist_ok=True)
out = os.path.join(site, "bin", "wac")
with open(out, "wb") as f:
    f.write(module)
print("%s: the wac command, from wac %s, %d bytes" % (os.path.relpath(out, root), entry["commit"][:9], len(module)))
