// Startup and the animation loop. Loaded last, once everything else is defined.

load();
resize();

// Moves the cars and redraws every frame. dt is capped so a background tab
// coming back doesn't teleport everything.
let prevTime = null;
function frame(now) {
  const dt = prevTime === null ? 0 : Math.min(0.1, (now - prevTime) / 1000);
  prevTime = now;
  getScene(); // rebuilds traffic if the roads changed
  traffic.cars.forEach(car => stepCar(traffic, car, dt));
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
