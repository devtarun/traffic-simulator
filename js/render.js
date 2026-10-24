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
  const { boxes, trees } = getScene();
  boxes.forEach(b => (b.office ? office(b) : house(b)));
  trees.forEach(tree);
  roads(ctx, lines.map(([a, b, lanes]) => [points[a], points[b], lanes]));
  // Cars on the road; ones parked inside a building aren't drawn
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  traffic.cars.forEach(car => {
    if (!car.path) return;
    const p = carPos(car);
    ctx.fillStyle = car.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, CAR_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
  // Points stay the same size on screen at any zoom
  ctx.fillStyle = '#000';
  points.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, RADIUS / view.scale, 0, Math.PI * 2); ctx.fill();
  });
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
