// Editing roads with the pointer, the viewport, and the Snap and Reset buttons

function connect(a, b) {
  if (a === null || a === b) return;
  const exists = lines.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (!exists) lines.push([a, b, roadLanes]);
}

// Removes point i and its lines, shifting later indices down to match
function remove(i) {
  points.splice(i, 1);
  const kept = lines.filter(([a, b]) => a !== i && b !== i)
    .map(([a, b, lanes]) => [a > i ? a - 1 : a, b > i ? b - 1 : b, lanes]);
  lines.length = 0;
  lines.push(...kept);
  if (last === i) last = null;
  else if (last > i) last--;
}

// Removes points with no roads, except last: a new chain's first point has
// none until the next click. Highest index first, so remove()'s shifting
// doesn't skip any.
function prune() {
  for (let i = points.length - 1; i >= 0; i--) {
    if (i !== last && !lines.some(([a, b]) => a === i || b === i)) remove(i);
  }
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

// Road type menu, opened by right clicking empty canvas. The chosen type
// (lanes each way) applies to roads drawn from then on.
const menu = document.getElementById('road-menu');
function openMenu(e) {
  menu.querySelectorAll('button').forEach(b => b.classList.toggle('current', +b.dataset.lanes === roadLanes));
  menu.hidden = false;
  // Keep it on screen near the window edges
  menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 4) + 'px';
  menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 4) + 'px';
}
function closeMenu() { menu.hidden = true; }
menu.querySelectorAll('button').forEach(b => {
  b.onclick = () => { roadLanes = +b.dataset.lanes; closeMenu(); render(); };
});
menu.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
  // Any press on the canvas closes the menu and then does its usual job, so
  // ending a road and starting the next doesn't need an extra click
  closeMenu();
  // Right click on a point removes it; elsewhere it ends the current chain
  // and opens the road type menu. Either way, points left with no roads go too.
  if (e.button === 2) {
    const i = hitTest(pos(e));
    if (i === null) { last = null; openMenu(e); }
    else {
      const n = lines.filter(([a, b]) => a === i || b === i).length;
      if (!confirm(`Remove this point${n ? ` and its ${n} road${n > 1 ? 's' : ''}` : ''}?`)) return;
      remove(i);
      pointer = pos(e);
    }
    prune();
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
  pointerScreen = screenPos(e);
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
  closeMenu();
  const s = screenPos(e);
  const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1); // lines → px
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * Math.exp(-delta * 0.0015)));
  view.x = s.x - (s.x - view.x) * scale / view.scale;
  view.y = s.y - (s.y - view.y) * scale / view.scale;
  view.scale = scale;
  pointer = target(pos(e)).p;
  render();
}, { passive: false });
canvas.addEventListener('pointerleave', () => { pointer = null; pointerScreen = null; render(); });

// WASD pans the view while held: W up, A left, S down, D right. Keys are
// tracked here and applied each frame by panKeys(), so movement is smooth.
// Combinations with Ctrl, Alt or Meta are left to the browser (Ctrl+S, Ctrl+W...).
const PAN_KEYS = { KeyW: [0, 1], KeyA: [1, 0], KeyS: [0, -1], KeyD: [-1, 0] };
const held = new Set();
window.addEventListener('keydown', e => {
  if (!(e.code in PAN_KEYS) || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  held.add(e.code);
});
window.addEventListener('keyup', e => held.delete(e.code));
window.addEventListener('blur', () => held.clear()); // keyup is lost if focus leaves mid-press

function panKeys(dt) {
  let dx = 0, dy = 0;
  held.forEach(k => { dx += PAN_KEYS[k][0]; dy += PAN_KEYS[k][1]; });
  // Normalise so diagonals aren't faster; opposite keys cancel out
  const len = Math.hypot(dx, dy);
  if (!len) return;
  view.x += dx / len * PAN_SPEED * dt;
  view.y += dy / len * PAN_SPEED * dt;
  // The world under a still pointer has moved, so the preview follows it
  if (pointerScreen) pointer = target(screenToWorld(pointerScreen)).p;
}

const snapBtn = document.getElementById('snap');
snapBtn.onclick = () => {
  snap = !snap;
  snapBtn.textContent = `Snap: ${snap ? 'on' : 'off'}`;
};

document.getElementById('reset').onclick = () => {
  points.length = 0; lines.length = 0; last = null;
  render();
};
