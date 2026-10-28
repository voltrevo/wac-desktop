#!/usr/bin/env python3
"""Copy the wac sources this project imports into vendor/wac/, with everything they import in turn.

    python3 tools/vendor_wac.py /path/to/a/wac/checkout

wac's packages cannot be imported from outside its repository yet — a fix under way makes them reachable
as `import { json } from "wac"` — so until then the files are copied. They keep their paths under the
repository root (vendor/wac/packages/...), so their own relative imports keep working unchanged, and
vendor/wac/VENDORED.md records which commit they came from. Run it again to update; it replaces the
whole tree, so nothing stale survives.
"""
import os, re, shutil, subprocess, sys

# What the project itself reaches into wac for. Everything they import comes along.
ROOTS = [
    "packages/box/src/lib/session.wac",   # the terminal: a shell with no page in it
    "packages/box/src/shrun.wac",         # box's programs, run in-process or spawned
    "packages/fs/src/fs.wac",             # the filesystem the shell and the desktop share
    "packages/json/src/json.wac",
    "packages/gzip/src/inflate.wac",
    "packages/gzip/src/crc32.wac",
    "packages/zstd/src/frame.wac",
    "packages/crypto/src/sha256.wac",
]
IMPORT = re.compile(r'(?:import|export)\s*(?:\*\s*as\s*\w+|\{[^}]*\})\s*from\s*"([^"]+)"', re.S)

def closure(src):
    seen, stack, outside = set(), list(ROOTS), set()
    while stack:
        rel = os.path.normpath(stack.pop())
        if rel in seen:
            continue
        path = os.path.join(src, rel)
        if not os.path.exists(path):
            sys.exit(f"vendor_wac.py: {rel} is imported but not in {src}")
        seen.add(rel)
        for spec in IMPORT.findall(open(path).read()):
            if spec.startswith("."):
                stack.append(os.path.join(os.path.dirname(rel), spec))
            else:
                outside.add(spec)
    return sorted(seen), outside

def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = os.path.abspath(sys.argv[1])
    files, outside = closure(src)
    if outside - {"core", "std"}:
        sys.exit(f"vendor_wac.py: the closure reaches beyond core and std: {sorted(outside)}")
    here = os.path.dirname(os.path.abspath(__file__))
    dest = os.path.join(here, "..", "vendor", "wac")
    shutil.rmtree(dest, ignore_errors=True)
    for rel in files:
        os.makedirs(os.path.join(dest, os.path.dirname(rel)), exist_ok=True)
        shutil.copyfile(os.path.join(src, rel), os.path.join(dest, rel))
    try:
        commit = subprocess.check_output(["git", "-C", src, "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        commit = "unknown (not a git checkout)"
    lines = sum(len(open(os.path.join(dest, r)).read().splitlines()) for r in files)
    packages = sorted({r.split("/")[1] for r in files})
    with open(os.path.join(dest, "VENDORED.md"), "w") as f:
        f.write(f"# Vendored from wac\n\nCopied by `tools/vendor_wac.py` from wac `{commit}`: {len(files)} files, "
                f"{lines:,} lines, from {len(packages)} packages ({', '.join(packages)}).\n\n"
                "Do not edit these files: change wac, then run the script again. When wac's root exports its "
                "packages (`import {{ json }} from \"wac\"`), import them that way and delete this directory.\n\n"
                + "".join(f"- `{r}`\n" for r in files))
    print(f"vendored {len(files)} files ({lines:,} lines) from {len(packages)} packages at {commit[:9]}")

main()
