// Seeded randomness and geometry for oriented boxes and segments

// Seeded PRNG (mulberry32), so a road's boxes are the same on every render
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(...nums) {
  let h = 2166136261;
  nums.forEach(n => { h = Math.imul(h ^ Math.round(n), 16777619); });
  return h;
}

// Boxes are oriented rectangles: center c, unit axes u (along the road) and
// n (across it), half-sizes hw and hd. local() maps a point into that frame.
function local(b, p) {
  const dx = p.x - b.c.x, dy = p.y - b.c.y;
  return { x: dx * b.u.x + dy * b.u.y, y: dx * b.n.x + dy * b.n.y };
}

function corners(b) {
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([s, t]) => ({
    x: b.c.x + b.u.x * b.hw * s + b.n.x * b.hd * t,
    y: b.c.y + b.u.y * b.hw * s + b.n.y * b.hd * t,
  }));
}

function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

// Distance from segment a–c to box b (0 if they intersect)
function segBoxDist(b, a, c) {
  const la = local(b, a), lc = local(b, c);
  // Liang–Barsky clip of the segment against the box
  const dx = lc.x - la.x, dy = lc.y - la.y;
  let t0 = 0, t1 = 1, hit = true;
  for (const [p, q] of [[-dx, la.x + b.hw], [dx, b.hw - la.x], [-dy, la.y + b.hd], [dy, b.hd - la.y]]) {
    if (p === 0) { if (q < 0) hit = false; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
  }
  if (hit && t0 <= t1) return 0;
  const toBox = p => Math.hypot(Math.max(Math.abs(p.x) - b.hw, 0), Math.max(Math.abs(p.y) - b.hd, 0));
  return Math.min(toBox(la), toBox(lc), ...corners(b).map(k => pointSegDist(k, a, c)));
}

// Separating axis test for two boxes, with a margin between them
function boxesOverlap(a, b, margin) {
  return [a.u, a.n, b.u, b.n].every(ax => {
    const proj = k => k.x * ax.x + k.y * ax.y;
    const pa = corners(a).map(proj), pb = corners(b).map(proj);
    return Math.min(...pa) < Math.max(...pb) + margin && Math.min(...pb) < Math.max(...pa) + margin;
  });
}
