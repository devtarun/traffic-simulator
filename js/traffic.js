// Traffic: the road graph, routes, and cars moving along them

// The road network is a graph: points are nodes and lines are edges, so cars
// can only turn where roads share a point. Each car belongs to a house and
// shuttles between it and offices it can reach, pausing inside each building.

const CAR_RADIUS = 3;
const CARS_PER_HOUSE = 2;
const MAX_CARS = 250;
const CAR_COLORS = ['#e63946', '#f1faee', '#ffb703', '#219ebc', '#8ecae6', '#fb8500', '#2a9d8f', '#ffffff'];
// Speed multiplier by lanes each way: 4-lane roads are 1.5× as fast as
// 2-lane. Driveways and turns at junctions go at the 2-lane speed.
const ROAD_SPEED = { 1: 1, 2: 1.5 };
let traffic = { adj: [], comp: [], cars: [] };

function makeTraffic({ boxes }) {
  // adj[i]: [neighbour, length, lanes each way] for each road at point i
  const adj = points.map(() => []);
  lines.forEach(([a, b, lanes]) => {
    const d = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
    adj[a].push([b, d, lanes]); adj[b].push([a, d, lanes]);
  });
  // Connected components, so cars only head for offices they can reach
  const comp = points.map(() => -1);
  points.forEach((_, s) => {
    if (comp[s] !== -1) return;
    const stack = [s];
    comp[s] = s;
    while (stack.length) adj[stack.pop()].forEach(([v]) => { if (comp[v] === -1) { comp[v] = s; stack.push(v); } });
  });
  const t = { adj, comp, cars: [] };
  const offices = boxes.filter(b => b.office);
  const houses = boxes.filter(b => !b.office);
  houses.forEach(home => {
    home.reach = offices.filter(o => comp[lines[o.seg][0]] === comp[lines[home.seg][0]]);
  });
  const homes = houses.filter(h => h.reach.length);
  const count = Math.min(MAX_CARS, Math.ceil(homes.length * CARS_PER_HOUSE));
  for (let i = 0; i < count; i++) {
    const home = homes[i % homes.length];
    const car = {
      home, at: home, speed: 35 + Math.random() * 30, wait: 0,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    };
    depart(t, car);
    // Start most cars mid-trip and the rest at home, so traffic starts at once but staggered
    if (Math.random() < 0.8) car.s = Math.random() * car.len;
    else { car.path = null; car.wait = Math.random() * 3; car.to = null; }
    t.cars.push(car);
  }
  return t;
}

// Sends car from the building it's at to its next stop: home if it's at an
// office, otherwise a random office it can reach
function depart(t, car) {
  const to = car.at.office ? car.home : car.home.reach[Math.floor(Math.random() * car.home.reach.length)];
  car.to = to;
  // The lane is clamped per road, so on 2-lane roads every car uses lane 0
  ({ path: car.path, speed: car.pieceSpeed } = route(t, car.at, to, Math.floor(Math.random() * MAX_LANES)));
  car.cum = [0];
  for (let i = 1; i < car.path.length; i++) {
    const a = car.path[i - 1], b = car.path[i];
    car.cum.push(car.cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  car.len = car.cum[car.cum.length - 1];
  car.s = 0;
}

// Where box b's driveway meets the road's center line
function roadPoint(b) {
  const [p, q] = lines[b.seg].map(i => points[i]);
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  return { x: p.x + (q.x - p.x) * b.along / L, y: p.y + (q.y - p.y) * b.along / L };
}

// Route from building `from` to building `to`: out of the driveway, along the
// shortest route through the road graph in lane `lane` of the car's side
// (0 = next to the center line, clamped to each road's lanes), and in to `to`.
// Returns the path's points, and speed[i], the ROAD_SPEED multiplier for the
// piece from path[i] to path[i + 1].
function route(t, from, to, lane) {
  const A = lines[from.seg], B = lines[to.seg];
  // center: the route along road center lines; lanes[i]: lanes each way on
  // the road from center[i] to center[i + 1]
  let center, lanes;
  if (from.seg === to.seg) { center = [roadPoint(from), roadPoint(to)]; lanes = [A[2]]; }
  else {
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
    const between = nodes.slice(1).map((v, k) => t.adj[nodes[k]].find(([w]) => w === v)[2]);
    lanes = [A[2], ...between, B[2]];
  }
  // Shift each piece of the center line sideways into the car's lane. The
  // driveways and the short joins between shifted pieces (the turns) go at
  // the base speed; each shifted piece goes at its road's speed.
  const door = b => ({ x: b.c.x - b.n.x * b.hd, y: b.c.y - b.n.y * b.hd });
  const path = [door(from)], speed = [];
  for (let i = 1; i < center.length; i++) {
    const a = center[i - 1], b = center[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const off = KEEP * (Math.min(lane, lanes[i - 1] - 1) + 0.5) * LANE_W;
    const r = { x: -(b.y - a.y) / L * off, y: (b.x - a.x) / L * off };
    path.push({ x: a.x + r.x, y: a.y + r.y }, { x: b.x + r.x, y: b.y + r.y });
    speed.push(ROAD_SPEED[1], ROAD_SPEED[lanes[i - 1]]);
  }
  path.push(door(to));
  speed.push(ROAD_SPEED[1]);
  return { path, speed };
}

// Index i of the path piece the car is on, from path[i - 1] to path[i]
function pieceAt(car) {
  let i = 1;
  while (i < car.cum.length - 1 && car.cum[i] < car.s) i++;
  return i;
}

function stepCar(t, car, dt) {
  if (car.wait > 0) {
    car.wait -= dt;
    if (car.wait <= 0) depart(t, car);
    return;
  }
  car.s += car.speed * car.pieceSpeed[pieceAt(car) - 1] * dt;
  if (car.s >= car.len) {
    car.at = car.to;
    car.path = null;
    car.wait = 0.5 + Math.random() * (car.at.office ? 3 : 1.5);
  }
}

function carPos(car) {
  const i = pieceAt(car);
  const a = car.path[i - 1], b = car.path[i];
  const seg = car.cum[i] - car.cum[i - 1];
  const f = seg ? (car.s - car.cum[i - 1]) / seg : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
