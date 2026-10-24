// Traffic: the road graph, routes, and cars moving along them

// The road network is a graph: points are nodes and lines are edges, so cars
// can only turn where roads share a point. Each car belongs to a house and
// shuttles between it and offices it can reach, pausing inside each building.

const CARS_PER_HOUSE = 2;
const MAX_CARS = 250;
const CAR_COLORS = ['#e63946', '#f1faee', '#ffb703', '#219ebc', '#8ecae6', '#fb8500', '#2a9d8f', '#ffffff'];
// Speed multiplier by lanes each way: 4-lane roads are 1.5× as fast as
// 2-lane. Driveways and turns at junctions go at the 2-lane speed.
const ROAD_SPEED = { 1: 1, 2: 1.5 };
let traffic = { adj: [], comp: [], cars: [] };
// What a click while paused selected: a car (its route is shown) or a box
// (the routes of every car driving to it are shown). At most one is set;
// both are cleared on play and whenever traffic is rebuilt.
let selectedCar = null;
let selectedBox = null;
// Road (line index) selected by a click while paused, for its flow panel;
// like selectedJunction it stays selected through Play
let selectedRoad = null;

// The road whose asphalt covers world point p (the nearest, if several), or null
function roadUnder(p) {
  let best = null, bestDist = Infinity;
  lines.forEach(([a, b, lanes], k) => {
    const d = pointSegDist(p, points[a], points[b]);
    if (d <= roadWidth(lanes) / 2 && d < bestDist) { best = k; bestDist = d; }
  });
  return best;
}
const CAR_PICK = 8;    // a click within this many screen px of a car selects it

// The box (house or office) containing world point p, or null
function boxAt(p) {
  return getScene().boxes.find(b => segBoxDist(b, p, p) === 0) || null;
}

// Cars whose routes are shown: the selected car, or every car driving to the
// selected box
function shownCars() {
  if (selectedCar) return selectedCar.path ? [selectedCar] : [];
  if (selectedBox) return traffic.cars.filter(car => car.path && car.to === selectedBox);
  return [];
}

// The driving car nearest world point p within CAR_PICK screen px, or null.
// Cars parked inside a building can't be picked.
function carAt(p) {
  let best = null, bestDist = CAR_PICK / view.scale;
  traffic.cars.forEach(car => {
    if (!car.path) return;
    const q = carPos(car);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestDist) { best = car; bestDist = d; }
  });
  return best;
}

function makeTraffic({ boxes }) {
  // adj[i]: [neighbour, length, lanes each way, line index] for each road at point i
  const adj = points.map(() => []);
  lines.forEach(([a, b, lanes], k) => {
    const d = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
    adj[a].push([b, d, lanes, k]); adj[b].push([a, d, lanes, k]);
  });
  // Connected components, so cars only head for offices they can reach
  const comp = points.map(() => -1);
  points.forEach((_, s) => {
    if (comp[s] !== -1) return;
    const stack = [s];
    comp[s] = s;
    while (stack.length) adj[stack.pop()].forEach(([v]) => { if (comp[v] === -1) { comp[v] = s; stack.push(v); } });
  });
  const t = { adj, comp, cars: [], junctions: makeJunctions(adj) };
  const offices = boxes.filter(b => b.office);
  const houses = boxes.filter(b => !b.office);
  houses.forEach(home => {
    home.reach = offices.filter(o => comp[lines[o.seg][0]] === comp[lines[home.seg][0]]);
  });
  const homes = houses.filter(h => h.reach.length);
  t.homes = homes;
  // The normal number of cars for this map; trafficLevel scales it
  t.baseCount = Math.min(MAX_CARS, Math.ceil(homes.length * CARS_PER_HOUSE));
  const count = Math.round(t.baseCount * trafficLevel);
  const placed = new Map(); // lane key -> positions of cars started mid-trip on it
  for (let i = 0; i < count; i++) {
    const car = newCar(homes[i % homes.length]);
    depart(t, car);
    // Start most cars mid-trip and the rest at home, so traffic starts at once
    // but staggered. A car only starts mid-trip on a road stretch with room
    // in its lane, away from the road's ends (so never inside a junction);
    // otherwise it starts at home too.
    let spot = null;
    if (Math.random() < 0.8) {
      car.s = Math.random() * car.len;
      const piece = car.pieces[pieceAt(car) - 1];
      spot = piece.kind === 'road' ? laneSpot(car) : null;
      if (spot) {
        const L = lineLength(+spot.key.split(':')[0]);
        if (spot.pos < ROAD_WIDTH || spot.pos > L - ROAD_WIDTH) spot = null;
      }
      if (spot && (placed.get(spot.key) || []).some(p => Math.abs(p - spot.pos) < CAR_LEN + MIN_GAP + 2)) spot = null;
    }
    if (spot) {
      if (!placed.has(spot.key)) placed.set(spot.key, []);
      placed.get(spot.key).push(spot.pos);
    } else { car.path = null; car.wait = Math.random() * 3; car.to = null; }
    t.cars.push(car);
  }
  return t;
}

function newCar(home) {
  return {
    home, at: home, speed: 35 + Math.random() * 30, wait: 0, v: 0, stopped: 0, path: null,
    color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
  };
}

// Traffic level: a multiplier on the normal number of cars, set by the
// Traffic − / + buttons in steps of TRAFFIC_STEP, kept when traffic rebuilds
const TRAFFIC_STEP = 0.1, TRAFFIC_MIN = 0.1, TRAFFIC_MAX = 3;
let trafficLevel = 1;

// Changes the traffic level by delta (clamped) and adds or removes cars to
// match: new cars start at random homes and set off within a few seconds;
// cars are removed parked ones first, then from the road. Returns whether
// the level changed.
function changeTraffic(t, delta) {
  const level = Math.round(Math.min(TRAFFIC_MAX, Math.max(TRAFFIC_MIN, trafficLevel + delta)) * 10) / 10;
  if (level === trafficLevel) return false;
  trafficLevel = level;
  const want = Math.round((t.baseCount || 0) * trafficLevel);
  while (t.cars.length < want && t.homes && t.homes.length) {
    const car = newCar(t.homes[Math.floor(Math.random() * t.homes.length)]);
    car.wait = Math.random() * 3;
    t.cars.push(car);
  }
  if (t.cars.length > want) {
    const parked = t.cars.filter(c => !c.path), driving = t.cars.filter(c => c.path);
    const keep = [...parked, ...driving].slice(t.cars.length - want);
    t.cars = t.cars.filter(c => keep.includes(c));
    if (selectedCar && !t.cars.includes(selectedCar)) selectedCar = null;
  }
  return true;
}

// Sends car from the building it's at to its next stop: home if it's at an
// office, otherwise a random office it can reach
function depart(t, car) {
  const to = car.at.office ? car.home : car.home.reach[Math.floor(Math.random() * car.home.reach.length)];
  car.to = to;
  // The lane is clamped per road, so on 2-lane roads every car uses lane 0
  ({ path: car.path, speed: car.pieceSpeed, pieces: car.pieces } = route(t, car.at, to, Math.floor(Math.random() * MAX_LANES)));
  car.permit = car.box = car.waitingAt = null;
  car.cum = [0];
  for (let i = 1; i < car.path.length; i++) {
    const a = car.path[i - 1], b = car.path[i];
    car.cum.push(car.cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  car.len = car.cum[car.cum.length - 1];
  car.s = 0;
  car.prevS = 0;
}

// Where box b's driveway meets the road's center line
function roadPoint(b) {
  const [p, q] = lines[b.seg].map(i => points[i]);
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  return { x: p.x + (q.x - p.x) * b.along / L, y: p.y + (q.y - p.y) * b.along / L };
}

function lineLength(k) {
  const [a, b] = lines[k];
  return Math.hypot(points[b].x - points[a].x, points[b].y - points[a].y);
}

// Route from building `from` to building `to`: out of the driveway, along the
// shortest route through the road graph in lane `lane` of the car's side
// (0 = next to the center line, clamped to each road's lanes), and in to `to`.
// Returns:
// - path: the points to drive through
// - speed[i]: the ROAD_SPEED multiplier for the piece from path[i] to path[i + 1]
// - pieces[i]: what that piece is: { kind: 'drive' } for a driveway,
//   { kind: 'turn', node } for the join at a point, or { kind: 'road', key,
//   start } for a stretch of lane. key names the lane (line:dir:lane, see
//   laneKey()); start is how far along the lane, in travel direction, the
//   stretch begins.
function route(t, from, to, lane) {
  const A = lines[from.seg], B = lines[to.seg];
  // center: the route along road center lines; info[i]: the road from
  // center[i] to center[i + 1] (line, travel dir, where it starts along the
  // line in travel direction, and the point it ends at, or -1 at a building)
  let center, info;
  if (from.seg === to.seg) {
    center = [roadPoint(from), roadPoint(to)];
    const dir = to.along >= from.along ? 1 : -1;
    info = [{ line: from.seg, dir, start: dir > 0 ? from.along : lineLength(from.seg) - from.along, end: -1 }];
  } else {
    // Dijkstra seeded with the distances from `from` to both ends of its line
    const LA = Math.hypot(points[A[1]].x - points[A[0]].x, points[A[1]].y - points[A[0]].y);
    const LB = Math.hypot(points[B[1]].x - points[B[0]].x, points[B[1]].y - points[B[0]].y);
    const dist = points.map(() => Infinity), prev = points.map(() => -1), done = points.map(() => false);
    dist[A[0]] = from.along;
    dist[A[1]] = Math.min(dist[A[1]], LA - from.along);
    for (;;) {
      let u = -1;
      dist.forEach((d, i) => { if (!done[i] && d < Infinity && (u < 0 || d < dist[u])) u = i; });
      if (u < 0) break;
      done[u] = true;
      t.adj[u].forEach(([v, w]) => { if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } });
    }
    const end = dist[B[0]] + to.along <= dist[B[1]] + LB - to.along ? B[0] : B[1];
    const nodes = [];
    for (let i = end; i !== -1; i = prev[i]) nodes.unshift(i);
    center = [roadPoint(from), ...nodes.map(i => points[i]), roadPoint(to)];
    const first = nodes[0], lastNode = nodes[nodes.length - 1];
    const dirA = first === A[1] ? 1 : -1;
    info = [
      { line: from.seg, dir: dirA, start: dirA > 0 ? from.along : lineLength(from.seg) - from.along, end: first },
      ...nodes.slice(1).map((v, k) => {
        const line = t.adj[nodes[k]].find(([w]) => w === v)[3];
        return { line, dir: lines[line][0] === nodes[k] ? 1 : -1, start: 0, end: v };
      }),
      { line: to.seg, dir: lastNode === B[0] ? 1 : -1, start: 0, end: -1 },
    ];
  }
  // Shift each piece of the center line sideways into the car's lane. The
  // driveways and the short joins between shifted pieces (the turns) go at
  // the base speed; each shifted piece goes at its road's speed.
  const door = b => ({ x: b.c.x - b.n.x * b.hd, y: b.c.y - b.n.y * b.hd });
  const path = [door(from)], speed = [], pieces = [];
  let prevEnd = null;
  for (let i = 1; i < center.length; i++) {
    const a = center[i - 1], b = center[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const { line, dir, start, end } = info[i - 1];
    if (L < 1e-6) { prevEnd = end; continue; }
    const lanes = lines[line][2], l = Math.min(lane, lanes - 1);
    const off = KEEP * (l + 0.5) * LANE_W;
    const r = { x: -(b.y - a.y) / L * off, y: (b.x - a.x) / L * off };
    path.push({ x: a.x + r.x, y: a.y + r.y }, { x: b.x + r.x, y: b.y + r.y });
    speed.push(ROAD_SPEED[1], ROAD_SPEED[lanes]);
    pieces.push(prevEnd === null ? { kind: 'drive' } : { kind: 'turn', node: prevEnd },
      { kind: 'road', key: laneKey(line, dir, l), start, end });
    prevEnd = end;
  }
  path.push(door(to));
  speed.push(ROAD_SPEED[1]);
  pieces.push({ kind: 'drive' });
  return { path, speed, pieces };
}

// Name of lane `lane` (0 = next to the center line) of line k, for travel in
// direction dir (1 = from its first point to its second, -1 = back)
function laneKey(k, dir, lane) { return k + ':' + dir + ':' + lane; }

// World position at distance pos along a lane (in its travel direction)
function lanePoint(key, pos) {
  const [k, dir, lane] = key.split(':').map(Number);
  const [a, b] = dir > 0 ? [lines[k][0], lines[k][1]] : [lines[k][1], lines[k][0]];
  const p = points[a], q = points[b];
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  const u = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
  const off = KEEP * (lane + 0.5) * LANE_W;
  return { x: p.x + u.x * pos - u.y * off, y: p.y + u.y * pos + u.x * off };
}

// Index i of the path piece the car is on, from path[i - 1] to path[i]
function pieceAt(car) {
  let i = 1;
  while (i < car.cum.length - 1 && car.cum[i] < car.s) i++;
  return i;
}

function carPos(car) {
  return pathPosAt(car, car.s);
}

function pathPosAt(car, s) {
  s = Math.max(0, Math.min(car.len, s));
  const i = pieceAt({ ...car, s });
  const a = car.path[i - 1], b = car.path[i];
  const seg = car.cum[i] - car.cum[i - 1];
  const f = seg ? (s - car.cum[i - 1]) / seg : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function renderCarPos(car) {
  if (!car.path || car.prevS === undefined) return carPos(car);
  const s = car.prevS + (car.s - car.prevS) * renderAlpha;
  const i = pieceAt({ ...car, s });
  const a = car.path[i - 1], b = car.path[i];
  const seg = car.cum[i] - car.cum[i - 1];
  const f = seg ? (s - car.cum[i - 1]) / seg : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
