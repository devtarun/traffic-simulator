// Drawing vehicles: small top-down cars with headlights, and brake lights
// when they're slowing or stopped

const CAR_LEN = 8, CAR_WID = 4.5; // world px

// Use the path tangent around the blended position instead of easing toward
// each segment's heading. Sampling across nearby segments smooths short
// junction connectors without angle wraparound or accumulated rotation.
function carHeading(car) {
  const s = car.prevS === undefined ? car.s : car.prevS + (car.s - car.prevS) * renderAlpha;
  const before = pathPosAt(car, Math.max(0, s - CAR_LEN / 2));
  const after = pathPosAt(car, Math.min(car.len, s + CAR_LEN / 2));
  if (Math.hypot(after.x - before.x, after.y - before.y) < 1e-6) return 0;
  return Math.atan2(after.y - before.y, after.x - before.x);
}

// Draws every driving car on c (in world coordinates): all headlight beams
// first, so a beam never covers the car ahead, then the bodies. Cars parked
// inside a building aren't drawn.
function drawCars(c) {
  const driving = traffic.cars.filter(car => car.path).map(car => ({ car, p: renderCarPos(car), h: carHeading(car) }));
  const half = CAR_LEN / 2;
  driving.forEach(({ p, h }) => {
    c.save();
    c.translate(p.x, p.y); c.rotate(h);
    const g = c.createRadialGradient(half, 0, 0, half, 0, 16);
    g.addColorStop(0, 'rgba(255, 244, 190, 0.45)');
    g.addColorStop(1, 'rgba(255, 244, 190, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(half, -1.6); c.lineTo(half + 16, -6); c.lineTo(half + 16, 6); c.lineTo(half, 1.6);
    c.closePath(); c.fill();
    c.restore();
  });
  driving.forEach(({ car, p, h }) => {
    c.save();
    c.translate(p.x, p.y); c.rotate(h);
    // Body, windscreen and rear window
    c.fillStyle = car.color;
    c.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    c.lineWidth = 0.6;
    c.beginPath(); c.roundRect(-half, -CAR_WID / 2, CAR_LEN, CAR_WID, 1.3); c.fill(); c.stroke();
    c.fillStyle = 'rgba(25, 35, 50, 0.8)';
    c.fillRect(0.6, -CAR_WID / 2 + 0.6, 1.6, CAR_WID - 1.2);
    c.fillRect(-half + 1, -CAR_WID / 2 + 0.8, 1, CAR_WID - 1.6);
    // Headlights at the front, brake lights at the back
    c.fillStyle = '#fffbe0';
    [-1.4, 1.4].forEach(y => { c.beginPath(); c.arc(half - 0.4, y, 0.6, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = car.braking ? '#ff2d20' : 'rgba(120, 20, 20, 0.9)';
    [-1.4, 1.4].forEach(y => c.fillRect(-half, y - 0.5, 0.7, 1));
    c.restore();
  });
}
