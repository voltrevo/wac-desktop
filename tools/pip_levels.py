#!/usr/bin/env python3
# Pip's long levels — the sixth to the twelfth — built from pieces laid along a cursor: runs, spike pits, plank
# crossings, crumbling bridges, sliding planks, springs and climbs. Each is checked as it is built: every lantern, flag
# and the door reachable from the start by runs, jumps, drops and springs, under an envelope smaller than Pip's real
# one. test/pip_test.wac checks the same of every level, and that the envelope's leaps are real.
#
#     python3 tools/pip_levels.py          # check them, and show any that fail
#     python3 tools/pip_levels.py --wac    # print them as src/apps/pip/levels.wac's entries, to paste after the fifth
#
# The first five levels are written by hand in levels.wac.
import sys
H = 12

class Lv:
    def __init__(s, name):
        s.name = name; s.cols = {}; s.x = 0; s.g = 9
    def put(s, x, y, c):
        assert 0 <= y < 11, (s.name, x, y, c)
        s.cols.setdefault(x, ['.'] * H)[y] = c
    def col(s, x):
        c = s.cols.setdefault(x, ['.'] * H); c[11] = '#'; return c
    def solid(s, x, top):
        c = s.col(x)
        for y in range(top, 11): c[y] = '#'
    # Pieces: each starts at the cursor and leaves it after itself, on ground at `s.g` unless it says otherwise.
    def run(s, n, foe=None, lantern=None, flag=False, high=3):
        for i in range(n): s.solid(s.x + i, s.g)
        if foe: s.put(s.x + n // 2, s.g - 1, foe)
        if lantern is not None: s.put(s.x + lantern, s.g - high, 'L')
        if flag: s.put(s.x + 1, s.g - 1, 'C')
        s.x += n; return s
    def pit(s, n):
        for i in range(n): s.col(s.x + i)[10] = '^'
        s.x += n; return s
    def step(s, k):            # the next ground k higher (k > 0) or lower
        s.g -= k; assert 4 <= s.g <= 9, (s.name, s.x, s.g); return s
    def planks(s, n, lantern=True):
        # A spike pit with planks two above the ground, two wide, a gap of two between.
        x0 = s.x; s.pit(n)
        for x in range(x0 + 1, x0 + n - 1, 4):
            s.put(x, s.g - 2, '='); s.put(x + 1, s.g - 2, '=')
        if lantern: s.put(x0 + n // 2, s.g - 5, 'L')
        return s
    def bridge(s, n, lantern=True):
        # A spike pit crossed on crumbling blocks, level with the ground, one gap between.
        x0 = s.x; s.pit(n)
        for x in range(x0 + 1, x0 + n - 1, 3):
            s.put(x, s.g, 'X'); s.put(x + 1, s.g, 'X')
        if lantern: s.put(x0 + n // 2, s.g - 3, 'L')
        return s
    def slide(s, lantern=True):
        # A spike pit nine wide, crossed on a sliding plank level with the ground.
        x0 = s.x; s.pit(9); s.put(x0 + 1, s.g, 'M')
        if lantern: s.put(x0 + 4, s.g - 3, 'L')
        return s
    def spring(s, up, lantern=True):
        # Ground with a spring in it, then a wall `up` high (at most 6): the spring is the way up.
        s.run(3); s.col(s.x - 2)[s.g] = 'S'
        s.g -= up
        assert 4 <= s.g <= 9, (s.name, s.x, s.g)
        if lantern: s.put(s.x + 1, s.g - 3, 'L')
        return s
    def climb(s, lantern=True):
        # Planks rising in steps of two up and three across, from the ground to five above, and a lantern on top.
        x0 = s.x; s.run(2)
        for k, (dx, dy) in enumerate([(2, 2), (5, 4), (8, 6)]):
            for i in range(2): s.put(x0 + dx + i, s.g - dy, '=')
        if lantern: s.put(x0 + 9, s.g - 8, 'L')
        s.run(9); return s
    def door(s):
        s.run(6); s.put(s.x - 2, s.g - 1, 'E'); return s
    def rows(s):
        w = max(s.cols) + 1
        for x in range(w): s.col(x)
        return [''.join(s.cols[x][y] for x in range(w)) for y in range(H)]

SOLID = set("#XS")
def check(name, rows, show=False):
    H = len(rows); W = len(rows[0])
    for r in rows: assert len(r) == W, (name, len(r))
    at = lambda x, y: rows[y][x] if 0 <= x < W and 0 <= y < H else ('.' if y < 0 else '#')
    moving = {(x + dx, y) for y in range(H) for x in range(W) if rows[y][x] == 'M' for dx in range(6)}
    floor = lambda x, y: at(x, y + 1) in SOLID or at(x, y + 1) == '=' or (x, y + 1) in moving
    open_ = lambda x, y: at(x, y) not in SOLID and at(x, y) != '^' and (x, y) not in moving
    room = lambda x, y: open_(x, y) and open_(x, y - 1)
    stands = {(x, y) for y in range(H - 1) for x in range(W) if room(x, y) and floor(x, y)}
    # Where Pip can hang against a wall, in the air: the wall's side, -1 left and 1 right (two can be both).
    clings = {}
    for y in range(H - 1):
        for x in range(W):
            if room(x, y) and not floor(x, y):
                for side in (-1, 1):
                    if at(x + side, y) in SOLID and at(x + side, y - 1) in SOLID: clings.setdefault((x, y), set()).add(side)
    start = next((x, y) for y in range(H) for x in range(W) if rows[y][x] == 'P')
    assert start in stands, (name, 'start')
    def leap(x, y, u, v, sprung):
        dx = abs(u - x); dy = y - v
        ok = (dy == 3 and dx <= 2) or (dy == 2 and dx <= 4) or (0 <= dy <= 1 and dx <= 5) or (dy < 0 and dx <= 5 + (-dy) // 2 + 1)
        return ok or (sprung and 0 <= dy <= 7 and dx <= 3)
    spots = stands | set(clings)
    seen = {start}; todo = [start]
    while todo:
        x, y = todo.pop()
        sprung = at(x, y + 1) == 'S'
        for (u, v) in spots:
            if (u, v) in seen: continue
            ok = False
            if (x, y) in stands and leap(x, y, u, v, sprung): ok = True
            for side in clings.get((x, y), ()):
                away = -side; across = (u - x) * away; up = y - v
                # Off the wall: across to the facing wall, up to two higher; to ground, as a jump; or slid or fallen down.
                if (u, v) in clings and -side in clings[(u, v)] and 0 <= across <= 3 and 0 <= up <= 2: ok = True
                if (u, v) in stands and 0 <= across <= 4 and 0 <= up <= 2: ok = True
                if up < 0 and abs(u - x) <= 5: ok = True
            if ok: seen.add((u, v)); todo.append((u, v))
    want = [(x, y, rows[y][x]) for y in range(H) for x in range(W) if rows[y][x] in 'LEC']
    bad = [(c, x, y) for (x, y, c) in want if not any(abs(x - u) <= 1 and 0 <= v - y <= 2 for (u, v) in seen)]
    if bad or show:
        for y in range(H): print('   ' + ''.join('*' if (x, y) in seen and (x, y) in stands else ('+' if (x, y) in seen else rows[y][x]) for x in range(W)))
    print(f"{name}: {W} wide, {H} high, {sum(r.count('L') for r in rows)} lanterns, {sum(r.count('C') for r in rows)} flags, unreachable: {bad}")
    return not bad

def start(name):
    l = Lv(name); l.run(4); l.put(1, l.g - 1, 'P'); return l

class Tower:
    """A tower of floors seven apart, walked right and left in turn, each joined to the one above at the end it reaches."""
    B = 7
    def __init__(s, name, width, floors):
        s.name = name; s.W = width; s.F = floors; s.H = floors * s.B + 3
        s.g = [['.'] * width for _ in range(s.H)]
        for y in range(s.H):
            s.g[y][0] = '#'; s.g[y][width - 1] = '#'
        for k in range(floors): s.fill(0, s.slab(k), width, 1, '#')
        s.fill(0, s.H - 1, width, 1, '#')
    def slab(s, k): return s.H - 1 - k * s.B
    def fill(s, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w): s.g[yy][xx] = c
        return s
    def put(s, x, y, c):
        assert 0 <= x < s.W and 0 <= y < s.H, (s.name, x, y, c); s.g[y][x] = c; return s
    def right(s, k): return k % 2 == 0
    # Along floor k, at a column counted from where Pip comes onto it (from the left on even floors, the right on odd).
    def at(s, k, i): return 1 + i if s.right(k) else s.W - 2 - i
    def lantern(s, k, i): return s.put(s.at(k, i), s.slab(k) - 3, 'L')
    def foe(s, k, i, c='p'): return s.put(s.at(k, i), s.slab(k) - 1, c)
    def flag(s, k, i): return s.put(s.at(k, i), s.slab(k) - 1, 'C')
    def spikes(s, k, i, n):
        for j in range(n): s.put(s.at(k, i + j), s.slab(k), '^')
        return s
    def crumbles(s, k, i, n):
        for j in range(n): s.put(s.at(k, i + j), s.slab(k), 'X')
        return s
    def chimney(s, k, gap):
        # Up from the end of floor k: a shaft `gap` wide against the tower's wall, its inner wall stopping two above the
        # floor so Pip walks in under it, and a hole in the floor above.
        top = s.slab(k + 1); bottom = s.slab(k) - 3
        inner = s.at(k, s.end() - gap)
        for y in range(top, bottom + 1): s.put(inner, y, '#')
        for j in range(gap): s.put(s.at(k, s.end() - j), top, '.')
        return s
    def end(s): return s.W - 3   # the floor's last column, counted as `at` counts
    def spring(s, k):
        # A spring near the end of floor k, under a hole of three in the floor above.
        e = s.end()
        s.put(s.at(k, e - 2), s.slab(k), 'S')
        for j in range(3): s.put(s.at(k, e - 3 + j), s.slab(k + 1), '.')
        return s
    def stair(s, k):
        # Planks up from near the end of floor k, the second under a one-way stretch of the floor above, which Pip
        # jumps up through.
        e = s.end()
        for j in range(2): s.put(s.at(k, e - 5 + j), s.slab(k) - 3, '=')
        for j in range(2): s.put(s.at(k, e - 2 + j), s.slab(k) - 5, '=')
        for j in range(3): s.put(s.at(k, e - 2 + j), s.slab(k + 1), '=')
        return s
    def start(s): return s.put(s.at(0, 1), s.slab(0) - 1, 'P')
    def door(s): k = s.F - 1; return s.put(s.at(k, s.end() - 1), s.slab(k) - 1, 'E')
    def rows(s): return [''.join(r) for r in s.g]

levels = []

l = start("Over the Spikes")
l.run(6, lantern=3).planks(12).run(6, foe='p').planks(14).run(5, flag=True).step(1).run(4).planks(10).step(-1).run(8, foe='p', lantern=4)
l.planks(16).run(5, flag=True).pit(3).run(4).pit(4).run(4, lantern=1).planks(14).run(6, foe='p').pit(3).run(5, foe='h')
l.planks(18, lantern=False).run(5, flag=True, lantern=3).planks(10).run(4).door()
levels.append(l)

l = start("Spring Heights")
l.run(5).spring(4).run(8, foe='p').step(-4).run(6, flag=True).pit(3).run(5).spring(4).run(6, lantern=2).step(-4).run(4)
l.planks(10, lantern=False).run(4).run(6, foe='h', flag=True).spring(5).run(5).step(-5).run(5).spring(3).run(10, foe='p', lantern=6).step(-3)
l.run(5, flag=True).climb().pit(3).run(4).spring(4).run(7, foe='h').step(-2).run(5, lantern=2).step(-2).run(4).planks(12).run(6, foe='p').pit(3).run(4).door()
levels.append(l)

l = start("Frog Marsh")
l.run(8, foe='h').pit(3).run(6, foe='h', lantern=2).slide().run(6, flag=True).pit(4).run(7, foe='h').slide().run(5, lantern=2)
l.step(1).run(6, foe='p').step(1).run(6, foe='h', flag=True).step(-2).slide().run(8, foe='h', lantern=4).pit(3).run(5).slide().run(8, foe='h')
l.pit(4).run(6, flag=True).slide(lantern=False).run(5, foe='h', lantern=2).pit(3).run(6, foe='p').door()
levels.append(l)

l = start("Brittle Bridges")
l.run(4).bridge(10).run(5, foe='p').bridge(13).run(4, flag=True).bridge(16, lantern=False).run(4, lantern=1).step(1).run(4).bridge(10)
l.step(-1).run(6, foe='h', flag=True).bridge(19).run(5, lantern=2).bridge(13).run(4).pit(3).run(5, foe='p').bridge(16)
l.run(5, flag=True).bridge(10, lantern=False).run(4).door()
levels.append(l)

l = start("The High Road")
l.run(4).step(2).run(5).step(2).run(6, foe='p', lantern=3).pit(4).run(5).step(-1).run(4).pit(4).run(6, flag=True).step(-3).run(3).climb().run(4)
l.run(5).spring(4).run(10, foe='p', lantern=5).pit(4).run(6).step(-3).run(5, flag=True).planks(14).run(4).step(2).run(5, foe='h', lantern=2)
l.step(2).run(6).pit(3).run(5, flag=True).step(-4).run(4).spring(4).run(6, lantern=3).pit(4).run(6, foe='p').step(-4).door()
levels.append(l)

l = start("Mill Race")
l.run(3).slide().run(4).bridge(10).run(5, flag=True, lantern=2).slide().run(3).slide(lantern=False).run(5, foe='p').step(1).run(4).bridge(13)
l.run(5, flag=True).spring(4).run(6, lantern=3).step(-4).slide().run(4, foe='h').bridge(10).run(4).slide().run(6, flag=True).planks(14).run(6, foe='p').door()
levels.append(l)

l = start("Last Light")
l.run(4).planks(10).run(5, foe='p').bridge(10).run(4, flag=True).slide().run(5, foe='h', lantern=2).spring(5).run(6).step(-5).run(3).climb().run(5, flag=True)
l.bridge(16, lantern=False).run(5, lantern=2).planks(14).run(6, foe='p').step(2).run(5).spring(3).run(8, foe='h', lantern=4).step(-5).run(5, flag=True)
l.slide().run(4).slide().run(6, foe='p').bridge(13).run(4).planks(14).run(6, lantern=3).door()
levels.append(l)

t = Tower("The Old Well", 34, 6).start()
t.lantern(0, 8).spikes(0, 12, 2).foe(0, 18).chimney(0, 2)
t.lantern(1, 6).flag(1, 6).spikes(1, 10, 3).spring(1)
t.lantern(2, 9).foe(2, 14).chimney(2, 3)
t.flag(3, 6).crumbles(3, 8, 3).lantern(3, 9).stair(3)
t.lantern(4, 5).spikes(4, 11, 2).foe(4, 17, 'h').chimney(4, 2)
t.lantern(5, 10).door()
levels.append(t)

t = Tower("Chimney Rock", 44, 8).start()
t.spikes(0, 8, 3).lantern(0, 8).foe(0, 20).chimney(0, 3)
t.lantern(1, 6).crumbles(1, 12, 4).chimney(1, 2)
t.flag(2, 6).foe(2, 14, 'h').spikes(2, 22, 2).lantern(2, 23).chimney(2, 3)
t.lantern(3, 10).spikes(3, 16, 3).spring(3)
t.flag(4, 6).crumbles(4, 9, 3).crumbles(4, 18, 3).lantern(4, 19).chimney(4, 2)
t.foe(5, 10).lantern(5, 16).spikes(5, 24, 2).stair(5)
t.flag(6, 6).lantern(6, 8).foe(6, 20, 'h').chimney(6, 3)
t.spikes(7, 10, 3).lantern(7, 10).foe(7, 20).door()
levels.append(t)

t = Tower("Lantern Spire", 40, 10).start()
t.lantern(0, 6).foe(0, 14).spikes(0, 20, 2).stair(0)
t.lantern(1, 10).chimney(1, 2)
t.flag(2, 6).spikes(2, 9, 3).lantern(2, 9).foe(2, 18, 'h').spring(2)
t.crumbles(3, 6, 4).lantern(3, 6).chimney(3, 3)
t.flag(4, 6).foe(4, 12).foe(4, 22).lantern(4, 17).stair(4)
t.spikes(5, 8, 2).spikes(5, 16, 2).lantern(5, 17).chimney(5, 2)
t.flag(6, 6).crumbles(6, 10, 3).lantern(6, 11).foe(6, 20, 'h').spring(6)
t.lantern(7, 6).spikes(7, 12, 3).chimney(7, 3)
t.flag(8, 6).foe(8, 10).crumbles(8, 15, 4).lantern(8, 15).chimney(8, 2)
t.lantern(9, 8).foe(9, 16, 'h').door()
levels.append(t)

ok = all([check(l.name, l.rows(), '-v' in sys.argv) for l in levels])
if '--wac' in sys.argv:
    for l in levels: print('    Level("' + l.name + '", [\n' + ',\n'.join('      "' + r + '"' for r in l.rows()) + ']),')
sys.exit(0 if ok else 1)
