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
  // Selected car's remaining route, under the cars: a light blue line from
  // the car to its destination's door, ending in a dot. Sizes are in screen px.
  const showRoute = paused && selectedCar && selectedCar.path;
  if (showRoute) {
    const car = selectedCar;
    const rest = [carPos(car), ...car.path.slice(pieceAt(car))];
    ctx.strokeStyle = ctx.fillStyle = 'rgba(90, 190, 255, 0.9)';
    ctx.lineWidth = 3 / view.scale;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    rest.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    const end = rest[rest.length - 1];
    ctx.beginPath(); ctx.arc(end.x, end.y, 5 / view.scale, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  }
  // Cars on the road; ones parked inside a building aren't drawn
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  traffic.cars.forEach(car => {
    if (!car.path) return;
    const p = carPos(car);
    ctx.fillStyle = car.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, CAR_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  // Ring around the selected car
  if (showRoute) {
    const p = carPos(selectedCar);
    ctx.strokeStyle = 'rgba(90, 190, 255, 0.9)';
    ctx.lineWidth = 2 / view.scale;
    ctx.beginPath(); ctx.arc(p.x, p.y, CAR_RADIUS + 3 / view.scale, 0, Math.PI * 2); ctx.stroke();
  }
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
