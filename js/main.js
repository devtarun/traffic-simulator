// Simulation timing is shared with render interpolation.
const FIXED_DT = 1 / 120;
let accumulator = 0;
let renderAlpha = 0;

// Startup and the animation loop. Loaded last, once everything else is defined.
load();
resize();

// Moves the cars and redraws every frame. dt is capped so a background tab
// coming back doesn't teleport everything.
let prevTime = null;
function frame(now) {
  const dt = prevTime === null ? 0 : Math.min(0.1, (now - prevTime) / 1000);
  prevTime = now;
  panKeys(dt);
  getScene(); // rebuilds traffic if the roads changed
  if (paused) { accumulator = 0; renderAlpha = 1; }
  else {
    accumulator += dt * simSpeed;
    while (accumulator >= FIXED_DT) { stepSim(traffic, FIXED_DT); accumulator -= FIXED_DT; }
    renderAlpha = accumulator / FIXED_DT;
  }
  render();
  updateAlerts(traffic);
  updatePanel(traffic);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
