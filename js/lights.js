// Traffic lights at junctions. A junction either has no signal (cars give
// way, see canEnter() in sim.js) or a timed signal that cycles through its
// phases: each phase is a group of approaches that can go together, i.e.
// approaches straight opposite each other. Each phase gets `green` seconds,
// then AMBER, then ALL_RED with every approach on red so the box clears.

const AMBER = 2, ALL_RED = 1;
const GREEN_DEFAULT = 12, GREEN_MIN = 5, GREEN_MAX = 30;
// Junction position "x,y" -> { green, start }: keyed by position rather than
// point index, which changes when points are removed. start is the simTime
// the cycle is counted from.
const lights = new Map();
// Junction (point index) selected by a click while paused, whose panel is
// shown; it stays selected through Play, and is cleared when traffic rebuilds
let selectedJunction = null;

function posKey(node) { const p = points[node]; return p.x + ',' + p.y; }
function lightAt(node) { return lights.get(posKey(node)) || null; }

// Adds a timed signal at junction node, starting on its first phase now, or
// removes the one there
function toggleLight(node) {
  const k = posKey(node);
  if (lights.has(k)) lights.delete(k);
  else lights.set(k, { green: GREEN_DEFAULT, start: simTime });
}

// Approaches into junction `node` ({ id: 'line:dir', axis, from }), grouped
// into phases by axis (direction of travel, ignoring which way, within 30°)
function junctionPhases(adj, node) {
  const approaches = adj[node].map(([from, , , line]) => {
    const dir = lines[line][1] === node ? 1 : -1; // travelling towards node
    const id = line + ':' + dir;
    return { id, axis: laneAxis(id + ':0'), from };
  }).sort((a, b) => a.axis - b.axis);
  const phases = [];
  approaches.forEach(a => {
    const near = phases.find(ph => ph.some(b => { const d = Math.abs(a.axis - b.axis); return Math.min(d, Math.PI - d) < Math.PI / 6; }));
    if (near) near.push(a); else phases.push([a]);
  });
  return phases;
}

// Where light is in its cycle at junction j: { phase (index), state ('green',
// 'amber' or 'red' for all-red), left (seconds left in that state) }
function lightCycle(light, j) {
  const per = light.green + AMBER + ALL_RED;
  const t = ((simTime - light.start) % (per * j.phases.length) + per * j.phases.length) % (per * j.phases.length);
  const phase = Math.floor(t / per), into = t - phase * per;
  if (into < light.green) return { phase, state: 'green', left: light.green - into };
  if (into < light.green + AMBER) return { phase, state: 'amber', left: light.green + AMBER - into };
  return { phase, state: 'red', left: per - into };
}

// The light an approach (lane key, or 'line:dir') sees at junction j
function lightFor(light, j, approach) {
  const id = approach.split(':').slice(0, 2).join(':');
  const cyc = lightCycle(light, j);
  return j.phases[cyc.phase].some(a => a.id === id) ? cyc.state : 'red';
}

// Whether a car on `approach` may go: on green, or on amber if it's too
// close to stop comfortably (stopDist: how far it is from the stop line, v:
// its speed)
function lightGreen(light, j, approach, stopDist = 0, v = 0) {
  const state = lightFor(light, j, approach);
  return state === 'green' || (state === 'amber' && stopDist < (v * v) / (2 * DECEL_COMFORT));
}

// Signal heads beside each approach's stop line, and a red stop bar across
// the approach's lanes while it isn't green
function drawLights(c, t) {
  t.junctions.forEach(j => {
    const light = lightAt(j.node);
    if (!light) return;
    const p = points[j.node];
    j.phases.flat().forEach(a => {
      const from = points[a.from];
      const L = Math.hypot(p.x - from.x, p.y - from.y);
      const u = { x: (p.x - from.x) / L, y: (p.y - from.y) / L }; // travel direction
      const n = { x: -u.y * KEEP, y: u.x * KEEP };                // towards the car's side
      const half = roadWidth(lines[+a.id.split(':')[0]][2]) / 2;
      const stop = { x: p.x - u.x * j.clear, y: p.y - u.y * j.clear };
      const state = lightFor(light, j, a.id);
      const color = state === 'green' ? '#3ddc5a' : state === 'amber' ? '#ffb020' : '#ff3b30';
      if (state !== 'green') {
        c.strokeStyle = color;
        c.lineWidth = 1.5;
        line({ x: stop.x + n.x * 1.5, y: stop.y + n.y * 1.5 }, { x: stop.x + n.x * (half - 4), y: stop.y + n.y * (half - 4) }, c);
      }
      // The head: a dark box on the kerb with a glowing lamp
      const h = { x: stop.x + n.x * (half + 4), y: stop.y + n.y * (half + 4) };
      c.fillStyle = '#1d1f22';
      c.beginPath(); c.roundRect(h.x - 3, h.y - 3, 6, 6, 1.5); c.fill();
      c.fillStyle = color;
      c.shadowColor = color; c.shadowBlur = 6;
      c.beginPath(); c.arc(h.x, h.y, 2, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
    });
  });
}
