// Drawing roads

function line(a, b, c = ctx) {
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
}

// Draws segments ([p, q, lanes] triples, lanes each way) as roads on context
// c. Each pass is drawn for every road before the next, so overlapping roads
// merge into clean junctions instead of one road's edge cutting across another.
function roads(c, segs) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.setLineDash([]);
  [[0, '#3a3a3a'], [4, '#f2f2f2'], [7, '#3a3a3a']].forEach(([inset, color]) => {
    c.strokeStyle = color;
    segs.forEach(([p, q, lanes]) => {
      c.lineWidth = roadWidth(lanes) - inset;
      line(p, q, c);
    });
  });
  // Markings, each a copy of the center line shifted sideways by off and
  // stopped short of the ends to keep junctions clear: a double solid yellow
  // line between the directions, and dashed white lines between the lanes
  // on each side
  const marking = (p, q, off, width, color, dash) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const t = ROAD_WIDTH / 2 / len;
    if (t >= 0.5) return;
    c.lineWidth = width;
    c.strokeStyle = color;
    c.setLineDash(dash);
    const n = { x: -(q.y - p.y) / len * off, y: (q.x - p.x) / len * off };
    line({ x: p.x + (q.x - p.x) * t + n.x, y: p.y + (q.y - p.y) * t + n.y },
         { x: q.x - (q.x - p.x) * t + n.x, y: q.y - (q.y - p.y) * t + n.y }, c);
  };
  c.lineCap = 'butt';
  segs.forEach(([p, q, lanes]) => {
    [-1.5, 1.5].forEach(off => marking(p, q, off, 1.5, '#f5c518', []));
    for (let k = 1; k < lanes; k++) {
      [-1, 1].forEach(side => marking(p, q, side * k * LANE_W, 1.5, '#e8e8e8', [8, 10]));
    }
  });
  c.setLineDash([]);
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
}
