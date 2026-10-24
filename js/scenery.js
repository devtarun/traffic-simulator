// Drawing houses, trees and offices

const ROOFS = [[12, 55, 48], [210, 12, 45], [25, 35, 40], [0, 45, 40], [100, 18, 40]]; // HSL
const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }; // light from the top left

function poly(pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

// Draws box b as a house seen from above: a hip roof whose four faces are
// shaded by how much they face LIGHT, a drop shadow and maybe a chimney.
// Colour and chimney are seeded from the box's position, so they're stable.
function house(b) {
  const rand = rng(hash(b.c.x * 10, b.c.y * 10));
  const [h, s, l] = ROOFS[Math.floor(rand() * ROOFS.length)];
  // Long axis a with half-length L, short axis m with half-length S
  const [a, L, m, S] = b.hw >= b.hd ? [b.u, b.hw, b.n, b.hd] : [b.n, b.hd, b.u, b.hw];
  const at = (i, j) => ({ x: b.c.x + a.x * i + m.x * j, y: b.c.y + a.y * i + m.y * j });
  const r1 = at(-(L - S), 0), r2 = at(L - S, 0);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  poly(corners(b).map(p => ({ x: p.x + 3, y: p.y + 3 })));
  ctx.fill();

  ctx.strokeStyle = `hsl(${h}, ${s}%, ${l - 18}%)`;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  [
    [[at(L, S), at(-L, S), r1, r2], m],
    [[at(L, -S), at(-L, -S), r1, r2], { x: -m.x, y: -m.y }],
    [[at(L, S), at(L, -S), r2], a],
    [[at(-L, S), at(-L, -S), r1], { x: -a.x, y: -a.y }],
  ].forEach(([pts, normal]) => {
    const lit = normal.x * LIGHT.x + normal.y * LIGHT.y;
    ctx.fillStyle = `hsl(${h}, ${s}%, ${l + lit * 12}%)`;
    poly(pts); ctx.fill(); ctx.stroke();
  });

  if (rand() < 0.5) {
    const k = Math.max(3, S * 0.35);
    const p = at((rand() - 0.5) * (L - S), (rand() < 0.5 ? 1 : -1) * S * 0.45);
    const box = { c: p, u: a, n: m, hw: k / 2, hd: k / 2 };
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    poly(corners(box).map(q => ({ x: q.x + 1.5, y: q.y + 1.5 })));
    ctx.fill();
    ctx.fillStyle = '#8a8580';
    ctx.strokeStyle = '#4a4744';
    poly(corners(box)); ctx.fill(); ctx.stroke();
  }
  ctx.lineJoin = 'miter';
}

// Draws a tree seen from above: a shadow, a round canopy and a highlight on
// the side facing LIGHT
function tree({ c, r, shade }) {
  const disc = (x, y, rad) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); };
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  disc(c.x + 2.5, c.y + 2.5, r);
  const h = 95 + shade * 30, l = 30 + shade * 8;
  ctx.fillStyle = `hsl(${h}, 40%, ${l}%)`;
  disc(c.x, c.y, r);
  ctx.fillStyle = `hsl(${h}, 40%, ${l + 10}%)`;
  disc(c.x + LIGHT.x * r * 0.3, c.y + LIGHT.y * r * 0.3, r * 0.6);
}

// Draws box b as an office seen from above: a flat concrete roof with a
// raised parapet, a few rooftop units and a longer shadow, since it's taller
function office(b) {
  const rand = rng(hash(b.c.x * 10, b.c.y * 10));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  poly(corners(b).map(p => ({ x: p.x + 6, y: p.y + 6 })));
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.fillStyle = '#9aa6b2';
  ctx.strokeStyle = '#56616c';
  poly(corners(b)); ctx.fill(); ctx.stroke();
  const inset = Math.min(3, b.hw / 3, b.hd / 3);
  ctx.fillStyle = '#c3ccd5';
  poly(corners({ ...b, hw: b.hw - inset, hd: b.hd - inset })); ctx.fill(); ctx.stroke();
  // Rooftop units, kept inside the parapet
  const units = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < units; i++) {
    const k = Math.min(6, (b.hd - inset) * 0.8);
    const c = {
      x: b.c.x + b.u.x * (rand() - 0.5) * (b.hw - inset - k) * 2 + b.n.x * (rand() - 0.5) * (b.hd - inset - k) * 2,
      y: b.c.y + b.u.y * (rand() - 0.5) * (b.hw - inset - k) * 2 + b.n.y * (rand() - 0.5) * (b.hd - inset - k) * 2,
    };
    const unit = { c, u: b.u, n: b.n, hw: k / 2, hd: k / 2 };
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    poly(corners(unit).map(p => ({ x: p.x + 1.5, y: p.y + 1.5 }))); ctx.fill();
    ctx.fillStyle = '#7d8893';
    poly(corners(unit)); ctx.fill(); ctx.stroke();
  }
}
