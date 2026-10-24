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
  // Dashed center line, stopped short of the ends to keep junctions clear
  c.lineCap = 'butt';
  c.lineWidth = 2;
  c.strokeStyle = '#f5c518';
  c.setLineDash([10, 10]);
  segs.forEach(([p, q]) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const t = ROAD_WIDTH / 2 / len;
    if (t >= 0.5) return;
    line({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t },
         { x: q.x - (q.x - p.x) * t, y: q.y - (q.y - p.y) * t }, c);
  });
  c.setLineDash([]);
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
}
