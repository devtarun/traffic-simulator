// Editing roads with the pointer, the viewport, and the Snap and Reset buttons

function connect(a, b) {
  if (a === null || a === b) return;
  const exists = lines.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (!exists) lines.push([a, b]);
}

// Removes point i and its lines, shifting later indices down to match
function remove(i) {
  points.splice(i, 1);
  const kept = lines.filter(([a, b]) => a !== i && b !== i)
    .map(([a, b]) => [a > i ? a - 1 : a, b > i ? b - 1 : b]);
  lines.length = 0;
  lines.push(...kept);
  if (last === i) last = null;
  else if (last > i) last--;
}

// Where a click at p lands: an existing point within HIT px if there is one,
// otherwise, with snapping on, p moved onto the horizontal or vertical
// through last when the road from last is within SNAP_ANGLE of it
function target(p) {
  const i = hitTest(p);
  if (i !== null) return { p: points[i], i };
  if (!snap || last === null) return { p, i: null };
  const o = points[last];
  const dx = Math.abs(p.x - o.x), dy = Math.abs(p.y - o.y);
  const off = Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180 / Math.PI;
  if (off > SNAP_ANGLE) return { p, i: null };
  const q = dx > dy ? { x: p.x, y: o.y } : { x: o.x, y: p.y };
  // Snapping can land on or near a point the raw position missed: reuse it,
  // rather than stacking a new point (and a duplicate road) on top of it
  const j = hitTest(q);
  return j !== null ? { p: points[j], i: j } : { p: q, i: null };
}

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
  // Right click on a point removes it; elsewhere it ends the current chain
  if (e.button === 2) {
    const i = hitTest(pos(e));
    if (i === null) last = null;
    else {
      const n = lines.filter(([a, b]) => a === i || b === i).length;
      if (!confirm(`Remove this point${n ? ` and its ${n} road${n > 1 ? 's' : ''}` : ''}?`)) return;
      remove(i);
      pointer = pos(e);
    }
    render();
    return;
  }
  // Left or middle press: a drag pans the view; a left click adds a point on release
  if (e.button !== 0 && e.button !== 1) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  drag = { button: e.button, start: screenPos(e), view: { ...view }, moved: false };
});
canvas.addEventListener('pointermove', e => {
  if (drag) {
    const s = screenPos(e);
    const dx = s.x - drag.start.x, dy = s.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG) {
      drag.moved = true;
      canvas.style.cursor = 'grabbing';
    }
    if (drag.moved) { view.x = drag.view.x + dx; view.y = drag.view.y + dy; }
  }
  pointer = target(pos(e)).p;
  render();
});
canvas.addEventListener('pointerup', e => {
  if (!drag) return;
  const click = drag.button === 0 && !drag.moved;
  drag = null;
  canvas.style.cursor = '';
  if (!click) return;
  let { p, i } = target(pos(e));
  if (i === null) { points.push(p); i = points.length - 1; }
  connect(last, i);
  last = i;
  pointer = points[i];
  render();
});
canvas.addEventListener('pointercancel', () => { drag = null; canvas.style.cursor = ''; });

// Wheel zooms around the pointer: the world point under it stays put
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const s = screenPos(e);
  const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1); // lines → px
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * Math.exp(-delta * 0.0015)));
  view.x = s.x - (s.x - view.x) * scale / view.scale;
  view.y = s.y - (s.y - view.y) * scale / view.scale;
  view.scale = scale;
  pointer = target(pos(e)).p;
  render();
}, { passive: false });
canvas.addEventListener('pointerleave', () => { pointer = null; render(); });

const snapBtn = document.getElementById('snap');
snapBtn.onclick = () => {
  snap = !snap;
  snapBtn.textContent = `Snap: ${snap ? 'on' : 'off'}`;
};

document.getElementById('reset').onclick = () => {
  points.length = 0; lines.length = 0; last = null;
  render();
};
