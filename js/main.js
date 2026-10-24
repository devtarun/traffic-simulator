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
  // Faster speeds run the same step several times, rather than one bigger
  // step, so following and junction rules stay just as accurate
  if (!paused) for (let k = 0; k < simSpeed; k++) stepSim(traffic, dt);
  render();
  updateAlerts(traffic);
  updatePanel(traffic);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
