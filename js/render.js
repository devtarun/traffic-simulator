// Drawing a frame, and keeping the canvas sized to the window

// Offscreen layer for the preview road: drawn opaque, then composited at
// half opacity, so its stacked passes don't show through each other.
const layer = document.createElement('canvas');
const lctx = layer.getContext('2d');

function render() {
  // Clear and composite in device pixels; draw everything else in world coordinates
  const dpr = window.devicePixelRatio || 1;
  const toWorld = c => c.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  toWorld(ctx);
  terrain(ctx);
  const { boxes, trees } = getScene();
  boxes.forEach(b => (b.office ? office(b) : house(b)));
  trees.forEach(tree);
  roads(ctx, lines.map(([a, b, lanes]) => [points[a], points[b], lanes]));
  // While paused: the selected box's outline, and the remaining routes of the
  // shown cars (the selected car, or all cars driving to the selected box),
  // under the cars: light blue lines from each car to its destination's door,
  // ending in a dot. Sizes are in screen px.
  const shown = paused ? shownCars() : [];
  ctx.strokeStyle = ctx.fillStyle = 'rgba(90, 190, 255, 0.9)';
  ctx.lineCap = ctx.lineJoin = 'round';
  if (paused && selectedBox) {
    ctx.lineWidth = 3 / view.scale;
    poly(corners(selectedBox)); ctx.stroke();
  }
  shown.forEach(car => {
    const rest = [carPos(car), ...car.path.slice(pieceAt(car))];
    ctx.lineWidth = 3 / view.scale;
    ctx.beginPath();
    rest.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    const end = rest[rest.length - 1];
    ctx.beginPath(); ctx.arc(end.x, end.y, 5 / view.scale, 0, Math.PI * 2); ctx.fill();
  });
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  drawCars(ctx);
  // Rings around the shown cars
  ctx.strokeStyle = 'rgba(90, 190, 255, 0.9)';
  ctx.lineWidth = 2 / view.scale;
  shown.forEach(car => {
    const p = carPos(car);
    ctx.beginPath(); ctx.arc(p.x, p.y, CAR_LEN / 2 + 3 / view.scale, 0, Math.PI * 2); ctx.stroke();
  });
  if (last !== null && pointer) {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
    toWorld(lctx);
    roads(lctx, [[points[last], pointer, roadLanes]]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(layer, 0, 0);
    ctx.globalAlpha = 1;
    toWorld(ctx);
  }
  // Points aren't drawn: they still snap, join roads and can be right-clicked
}

// Match the backing store to CSS size × devicePixelRatio so drawing stays sharp.
// Resizing clears the canvas, so redraw everything afterwards.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  layer.width = canvas.width;
  layer.height = canvas.height;
  render();
}
window.addEventListener('resize', resize);
