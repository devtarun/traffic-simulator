// Traffic: the road graph, routes, and cars moving along them

// The road network is a graph: points are nodes and lines are edges, so cars
// can only turn where roads share a point. Each car belongs to a house and
// shuttles between it and offices it can reach, pausing inside each building.

const CAR_RADIUS = 3;
const CARS_PER_HOUSE = 2;
const MAX_CARS = 250;
const CAR_COLORS = ['#e63946', '#f1faee', '#ffb703', '#219ebc', '#8ecae6', '#fb8500', '#2a9d8f', '#ffffff'];
let traffic = { adj: [], comp: [], cars: [] };

function makeTraffic({ boxes }) {
  const adj = points.map(() => []);
  lines.forEach(([a, b]) => {
    const d = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
    adj[a].push([b, d]); adj[b].push([a, d]);
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
  car.path = route(t, car.at, to, Math.floor(Math.random() * LANES));
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

// Path from building `from` to building `to`: out of the driveway, along the
// shortest route through the road graph in lane `lane` of the car's side
// (0 = next to the center line), and in to `to`
function route(t, from, to, lane) {
  const A = lines[from.seg], B = lines[to.seg];
  let center;
  if (from.seg === to.seg) center = [roadPoint(from), roadPoint(to)];
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
    for (let i = end; i !== -1; i = prev[i]) nodes.unshift(points[i]);
    center = [roadPoint(from), ...nodes, roadPoint(to)];
  }
  // Shift each piece of the center line sideways into the car's lane; the
  // short jumps between shifted pieces are where the car turns
  const off = KEEP * (lane + 0.5) * LANE_W;
  const shifted = [];
  for (let i = 1; i < center.length; i++) {
    const a = center[i - 1], b = center[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const r = { x: -(b.y - a.y) / L * off, y: (b.x - a.x) / L * off };
    shifted.push({ x: a.x + r.x, y: a.y + r.y }, { x: b.x + r.x, y: b.y + r.y });
  }
  const door = b => ({ x: b.c.x - b.n.x * b.hd, y: b.c.y - b.n.y * b.hd });
  return [door(from), ...shifted, door(to)];
}

function stepCar(t, car, dt) {
  if (car.wait > 0) {
    car.wait -= dt;
    if (car.wait <= 0) depart(t, car);
    return;
  }
  car.s += car.speed * dt;
  if (car.s >= car.len) {
    car.at = car.to;
    car.path = null;
    car.wait = 0.5 + Math.random() * (car.at.office ? 3 : 1.5);
  }
}

function carPos(car) {
  let i = 1;
  while (i < car.cum.length - 1 && car.cum[i] < car.s) i++;
  const a = car.path[i - 1], b = car.path[i];
  const seg = car.cum[i] - car.cum[i - 1];
  const f = seg ? (car.s - car.cum[i - 1]) / seg : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
