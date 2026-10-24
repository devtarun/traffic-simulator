// Drawing roads

function line(a, b, c = ctx) {
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
}

// Draws segments ([p, q] pairs) as roads on context c. Each pass is drawn for
// every road before the next, so overlapping roads merge into clean junctions
// instead of one road's edge cutting across another.
function roads(c, segs) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.setLineDash([]);
  [[ROAD_WIDTH, '#3a3a3a'], [ROAD_WIDTH - 4, '#f2f2f2'], [ROAD_WIDTH - 7, '#3a3a3a']].forEach(([w, color]) => {
    c.lineWidth = w;
    c.strokeStyle = color;
    segs.forEach(([p, q]) => line(p, q, c));
  });
  // Markings, each a copy of the center line shifted sideways by off and
  // stopped short of the ends to keep junctions clear: a double solid yellow
  // line between the directions, and dashed white lines between the lanes
  // on each side
  const marking = (off, width, color, dash) => {
    c.lineWidth = width;
    c.strokeStyle = color;
    c.setLineDash(dash);
    segs.forEach(([p, q]) => {
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const t = ROAD_WIDTH / 2 / len;
      if (t >= 0.5) return;
      const n = { x: -(q.y - p.y) / len * off, y: (q.x - p.x) / len * off };
      line({ x: p.x + (q.x - p.x) * t + n.x, y: p.y + (q.y - p.y) * t + n.y },
           { x: q.x - (q.x - p.x) * t + n.x, y: q.y - (q.y - p.y) * t + n.y }, c);
    });
  };
  c.lineCap = 'butt';
  [-1.5, 1.5].forEach(off => marking(off, 1.5, '#f5c518', []));
  for (let k = 1; k < LANES; k++) {
    [-1, 1].forEach(side => marking(side * k * LANE_W, 1.5, '#e8e8e8', [8, 10]));
  }
  c.setLineDash([]);
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
}
