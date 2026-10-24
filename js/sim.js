// Traffic simulation: cars following each other in their lanes, junctions
// with right of way, queues, and spotting blocked junctions and gridlock.
//
// Cars are indexed per lane by how far along the lane they are (their lane
// position). A car's speed is limited by the gap to the car ahead and, at a
// junction, by the stop line until it's allowed in. A junction (a point
// where 3 or more roads meet) has a box: the area within `clear` of the
// point. A car may only enter the box when its exit lane has room past the
// box, and, with no traffic light, when no car from another approach is in
// the box or arrived at its stop line first.

const MIN_GAP = 4;        // px between bumpers when stopped
const HEADWAY = 0.6;      // s: a car's speed is at most its gap / HEADWAY
const ACCEL = 45, DECEL = 180; // px/s²
const DECEL_COMFORT = 90; // px/s²: how hard a car brakes for a junction it may not enter
const LOOKAHEAD = 90;     // px: how far ahead into the next lane a car looks for traffic
const BLOCK_TIME = 6;     // s of standstill at a junction before it counts as blocked
const GRIDLOCK_TIME = 15; // s of standstill before it counts as gridlocked
let simTime = 0;

// Junctions of the road graph: node index -> { node, clear, lastMove,
// blocked, gridlock }. clear is half the widest road there plus a margin;
// lastMove is when a car waiting at it or in its box last moved.
function makeJunctions(adj) {
  const out = new Map();
  adj.forEach((roads, node) => {
    if (roads.length < 3) return;
    const clear = Math.max(...roads.map(([, , lanes]) => roadWidth(lanes))) / 2 + 2;
    out.set(node, { node, clear, lastMove: simTime, blocked: false, gridlock: false, phases: junctionPhases(adj, node) });
  });
  return out;
}

// Where the car is in lane terms, or null on a driveway. A car on a turn is
// counted on the lane it's turning into, just before that lane's start, so
// cars behind it on that lane see it.
// The same goes for a car pulling out of a driveway, once it has started
// moving: it's counted on the lane it's joining, so traffic there slows for it.
function laneSpot(car) {
  const i = pieceAt(car), piece = car.pieces[i - 1];
  if (piece.kind === 'road') return { key: piece.key, pos: piece.start + (car.s - car.cum[i - 1]) };
  if (piece.kind === 'turn' || (piece.kind === 'drive' && i === 1 && car.s > 0 && car.pieces[1])) {
    const next = car.pieces[i];
    return { key: next.key, pos: next.start - (car.cum[i] - car.s) };
  }
  return null;
}

// Direction of travel along lane `key` as an angle, ignoring which way
// (0..π), so opposite approaches to a junction share an axis
function laneAxis(key) {
  const [k, dir] = key.split(':').map(Number);
  const p = points[lines[k][0]], q = points[lines[k][1]];
  const a = Math.atan2((q.y - p.y) * dir, (q.x - p.x) * dir);
  return ((a % Math.PI) + Math.PI) % Math.PI;
}

// Whether two approaches can use a junction at the same time: same road and
// direction, or straight opposite each other (within 30°)
function compatible(keyA, keyB) {
  const [ka, da] = keyA.split(':'), [kb, db] = keyB.split(':');
  if (ka === kb && da === db) return true;
  const d = Math.abs(laneAxis(keyA) - laneAxis(keyB));
  return Math.min(d, Math.PI - d) < Math.PI / 6;
}

// Whether lane `key` has room for a car at position pos (nothing within a car
// length either side, and nothing just behind about to arrive), ignoring `self`
function laneRoom(lanes, key, pos, self, behind = CAR_LEN + MIN_GAP) {
  return !(lanes.get(key) || []).some(c => c.car !== self && c.pos > pos - behind - CAR_LEN && c.pos < pos + CAR_LEN + MIN_GAP);
}

// Whether car may enter junction j now. `approach` is its lane into the box,
// exit = { key, start } its lane out; stopDist is how far it is from the stop line.
function canEnter(car, j, approach, exit, lanes, cars, stopDist) {
  // Don't block the box: the exit needs room for this car past the box, and
  // no other car already in the box may be heading for the same exit. Like
  // real drivers, though, a car goes if the car in the way is still moving,
  // expecting it to clear; if that queue then stops, the car is left
  // stranded in the box, which is how gridlock starts.
  const at = exit.start + j.clear + CAR_LEN / 2;
  const inWay = (lanes.get(exit.key) || []).find(c => c.car !== car && c.pos > at - CAR_LEN && c.pos < at + CAR_LEN + MIN_GAP);
  car.exitBlocked = (inWay && inWay.car.v < 8)
    || cars.some(o => o !== car && o.box === j.node && o.boxExit === exit.key);
  if (car.exitBlocked) return false;
  const light = lightAt(j.node);
  if (light) return lightGreen(light, j, approach, stopDist, car.v);
  // No light: give way to cars from crossing approaches already in the box,
  // or waiting at their stop line since before this car arrived (unless that
  // car can't go anyway because its own exit is full)
  return !cars.some(o => o !== car && (
    (o.box === j.node && !compatible(o.boxFrom, approach)) ||
    (o.waitingAt === j.node && !compatible(o.approach, approach) && o.arrived < car.arrived && !o.exitBlocked)));
}

function arrive(car) {
  car.at = car.to;
  car.path = null;
  car.box = car.waitingAt = null;
  car.v = 0;
  car.wait = 0.5 + Math.random() * (car.at.office ? 3 : 1.5);
}

// Advances the simulation by dt seconds
function stepSim(t, dt) {
  simTime += dt;
  // Cars parked in a building count down, then set off (they wait on the
  // driveway below until the lane has room)
  t.cars.forEach(car => {
    if (car.path || (car.wait -= dt) > 0) return;
    depart(t, car);
    car.v = 0;
  });
  const driving = t.cars.filter(car => car.path);

  // Index cars by lane, front-most last. A car whose road and direction
  // ('line:dir') changed since last frame has just left the old one: that's
  // logged in t.flow for the throughput figure.
  const lanes = new Map();
  if (!t.flow) t.flow = new Map();
  driving.forEach(car => {
    const spot = laneSpot(car);
    car.lane = spot;
    const road = spot ? roadDir(spot.key) : null;
    if (car.road && car.road !== road) {
      if (!t.flow.has(car.road)) t.flow.set(car.road, []);
      t.flow.get(car.road).push(simTime);
    }
    car.road = road;
    if (!spot) return;
    if (!lanes.has(spot.key)) lanes.set(spot.key, []);
    lanes.get(spot.key).push({ car, pos: spot.pos });
  });
  lanes.forEach(list => list.sort((a, b) => a.pos - b.pos));

  // Leave a box once the rear of the car is out of it, on the exit lane
  driving.forEach(car => {
    if (car.box === null) return;
    const j = t.junctions.get(car.box);
    if (!j || (car.lane && car.lane.key === car.boxExit && car.lane.pos >= j.clear + CAR_LEN / 2 - 0.5)) car.box = null;
  });

  driving.forEach(car => {
    const i = pieceAt(car), piece = car.pieces[i - 1];
    let limit = car.len; // furthest the car may get this frame, in path distance
    car.limitBy = 'end'; car.leader = null;
    // Lowers the limit, noting why (and which car is in the way, if one is)
    const cap = (s, why, other = null) => { if (s < limit) { limit = s; car.limitBy = why; car.leader = other; } };
    const spot = car.lane;
    let laneAhead = null; // the next car in this lane, if any

    // The car ahead in this lane, or else the first car within LOOKAHEAD on
    // the next lane after the coming turn
    if (spot) {
      const list = lanes.get(spot.key);
      const k = list.findIndex(c => c.car === car);
      if (k < list.length - 1) laneAhead = list[k + 1].car;
      if (laneAhead) cap(car.s + list[k + 1].pos - spot.pos - CAR_LEN - MIN_GAP, 'car ahead', laneAhead);
      else if (piece.kind === 'road' && car.pieces[i] && car.pieces[i].kind === 'turn' && car.pieces[i + 1]) {
        const toEnd = car.cum[i] - car.s;
        if (toEnd < LOOKAHEAD) {
          const next = car.pieces[i + 1];
          const joinLen = car.cum[i + 1] - car.cum[i];
          const here = next.start - joinLen - toEnd; // this car's position in the next lane's terms
          const ahead = (lanes.get(next.key) || []).find(c => c.car !== car && c.pos > here);
          if (ahead) cap(car.s + ahead.pos - here - CAR_LEN - MIN_GAP, 'car ahead', ahead.car);
        }
      }
    }

    // Driveway out: wait at the door until the lane being joined has room
    // there and nothing close behind. Once it goes, it's added to that lane's
    // index straight away, so a second car at the same door (or a
    // neighbour's) sees it this same frame.
    if (piece.kind === 'drive' && i === 1 && car.pieces[1] && car.s === 0) {
      const first = car.pieces[1];
      if (!laneRoom(lanes, first.key, first.start, car, 40)) cap(0, 'pulling out');
      else {
        if (!lanes.has(first.key)) lanes.set(first.key, []);
        const list = lanes.get(first.key), pos = first.start - car.cum[1];
        list.splice(list.filter(e => e.pos < pos).length, 0, { car, pos });
      }
    }

    // Stop line before a junction box, until allowed in
    const turn = car.pieces[i];
    const j = piece.kind === 'road' && turn && turn.kind === 'turn' ? t.junctions.get(turn.node) : null;
    if (j && car.permit !== j.node) {
      const stopS = car.cum[i] - j.clear - CAR_LEN / 2;
      if (car.s > stopS + 0.5) car.permit = j.node; // already past it (e.g. placed there at start)
      else {
        // Ask to go in once within comfortable braking distance of the stop
        // line, so a car that may go keeps its speed through the junction.
        // Only the front car of the lane asks, or one following a car that
        // is already going through, so a car queued behind never holds the box.
        const front = !laneAhead || laneAhead.permit === j.node;
        if (front && car.s >= stopS - Math.max(2, car.v * HEADWAY + car.v * car.v / (2 * DECEL_COMFORT) + 6)) {
          if (car.waitingAt !== j.node) { car.waitingAt = j.node; car.arrived = simTime; car.approach = piece.key; }
          if (canEnter(car, j, piece.key, car.pieces[i + 1], lanes, driving, stopS - car.s)) {
            car.permit = j.node; car.box = j.node; car.boxFrom = piece.key; car.boxExit = car.pieces[i + 1].key;
            car.waitingAt = null;
            j.lastMove = simTime;
          }
        }
        if (car.permit !== j.node) cap(stopS, car.exitBlocked ? 'exit full' : 'junction');
      }
    }

    // Speed: up to the road's speed, less when close to whatever is ahead;
    // accelerate and brake smoothly, but never pass the limit
    const target = Math.min(car.speed * car.pieceSpeed[i - 1], Math.max(0, limit - car.s) / HEADWAY);
    const before = car.v;
    car.v = car.v < target ? Math.min(target, car.v + ACCEL * dt) : Math.max(target, car.v - DECEL * dt);
    const ds = Math.max(0, Math.min(car.v * dt, limit - car.s));
    car.v = dt > 0 ? ds / dt : 0;
    car.s += ds;
    car.braking = car.v < 2 || car.v < before - 0.5;
    car.stopped = car.v < 1 ? car.stopped + dt : 0;
    if (car.s >= car.len - 1e-6) arrive(car);
  });

  // Junction status, from how long it has been at a complete standstill: no
  // car waiting at it or inside its box has moved, and none has got in.
  // Temporary jams clear well within GRIDLOCK_TIME; deadlocks never do.
  // Cars held at a red or amber light don't count: waiting there is normal.
  t.junctions.forEach(j => {
    const light = lightAt(j.node);
    const involved = driving.filter(car => car.box === j.node ||
      (car.waitingAt === j.node && (!light || lightFor(light, j, car.approach) === 'green')));
    if (!involved.length || involved.some(car => car.v > 1)) j.lastMove = simTime;
    const still = simTime - j.lastMove;
    j.blocked = still > BLOCK_TIME;
    j.gridlock = still > GRIDLOCK_TIME;
  });
  t.lanes = lanes;
}

// 'line:dir' part of a lane key: a road in one direction
function roadDir(key) { return key.split(':').slice(0, 2).join(':'); }

const FLOW_WINDOW = 60; // s of history for throughput

// Live statistics for line k in direction dir:
// - cars: on it now; stopped: of those, stopped for a moment
// - speed: their average speed as a share of their free speed (1 when empty)
// - flow: cars leaving it per minute over the last FLOW_WINDOW s
// - queue: length in px of the longest run of stopped cars
// - wait: average time the stopped cars have been stopped
// - level: 'Free', 'Busy', 'Congested' or 'Jammed'
function roadStats(t, k, dir) {
  const id = k + ':' + dir;
  const events = (t.flow && t.flow.get(id)) || [];
  while (events.length && events[0] < simTime - FLOW_WINDOW) events.shift();
  const span = Math.min(FLOW_WINDOW, Math.max(simTime, 1));
  const here = [], runs = [];
  for (let lane = 0; lane < lines[k][2]; lane++) {
    let run = null;
    ((t.lanes && t.lanes.get(laneKey(k, dir, lane))) || []).forEach(e => {
      if (e.pos < 0) return; // still turning in
      here.push(e.car);
      if (e.car.stopped > 0.4) {
        if (run && e.pos - run.end < CAR_LEN + MIN_GAP + 8) run.end = e.pos;
        else runs.push(run = { start: e.pos, end: e.pos });
      } else run = null;
    });
  }
  const stopped = here.filter(c => c.stopped > 0.4);
  const free = ROAD_SPEED[lines[k][2]];
  const speed = here.length ? here.reduce((s, c) => s + c.v / (c.speed * free), 0) / here.length : 1;
  const level = !here.length || speed > 0.7 ? 'Free' : speed > 0.4 ? 'Busy' : speed > 0.15 ? 'Congested' : 'Jammed';
  return {
    cars: here.length, stopped: stopped.length, speed, flow: events.length * 60 / span,
    queue: runs.reduce((m, r) => Math.max(m, r.end - r.start + CAR_LEN), 0),
    wait: stopped.length ? stopped.reduce((s, c) => s + c.stopped, 0) / stopped.length : 0,
    level,
  };
}

const LEVEL_COLORS = { Free: '60, 200, 90', Busy: '245, 185, 30', Congested: '245, 120, 30', Jammed: '230, 40, 30' };

// Selected road: a light blue outline along both edges, and each direction's
// lanes tinted by its congestion level (between the junctions at its ends)
function drawRoadFlow(c, t, k) {
  const [a, b, lanes] = lines[k];
  const p = points[a], q = points[b], L = lineLength(k);
  const n = { x: -(q.y - p.y) / L, y: (q.x - p.x) / L };
  const half = roadWidth(lanes) / 2 + 2;
  c.strokeStyle = 'rgba(90, 190, 255, 0.95)';
  c.lineWidth = 2.5 / view.scale;
  [-1, 1].forEach(s => line({ x: p.x + n.x * half * s, y: p.y + n.y * half * s }, { x: q.x + n.x * half * s, y: q.y + n.y * half * s }, c));
  const clearAt = node => (t.junctions.get(node) || { clear: 0 }).clear;
  c.lineCap = 'butt';
  c.lineWidth = LANE_W - 1;
  [1, -1].forEach(dir => {
    const st = roadStats(t, k, dir);
    c.strokeStyle = `rgba(${LEVEL_COLORS[st.level]}, 0.35)`;
    const [from, to] = dir > 0 ? [a, b] : [b, a];
    for (let lane = 0; lane < lanes; lane++) {
      const key = laneKey(k, dir, lane);
      line(lanePoint(key, clearAt(from)), lanePoint(key, L - clearAt(to)), c);
    }
  });
}

// Queues: a translucent red band under each run of two or more stopped cars
// (or a single car held at a stop line) in a lane
function drawQueues(c, t) {
  if (!t.lanes) return;
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255, 60, 40, 0.55)';
  c.lineWidth = LANE_W - 1;
  t.lanes.forEach((list, key) => {
    let run = [];
    const flush = () => {
      if (run.length >= 2 || (run.length === 1 && run[0].car.waitingAt !== null && run[0].car.waitingAt !== undefined)) {
        line(lanePoint(key, run[0].pos - CAR_LEN / 2), lanePoint(key, run[run.length - 1].pos + CAR_LEN / 2), c);
      }
      run = [];
    };
    list.forEach(e => {
      const queued = e.car.stopped > 0.4;
      if (queued && run.length && e.pos - run[run.length - 1].pos > CAR_LEN + MIN_GAP + 8) flush();
      if (queued) run.push(e); else flush();
    });
    flush();
  });
  c.lineCap = 'butt';
}

// Blocked junctions get a pulsing amber ring, gridlocked ones a red ring,
// each with a "!" badge. Sizes are partly in screen px so they read at any zoom.
function drawJunctionAlerts(c, t) {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
  t.junctions.forEach(j => {
    if (!j.blocked) return;
    const p = points[j.node];
    const rgb = j.gridlock ? '230, 40, 30' : '240, 160, 20';
    c.fillStyle = `rgba(${rgb}, ${0.12 + 0.1 * pulse})`;
    c.strokeStyle = `rgba(${rgb}, ${0.55 + 0.45 * pulse})`;
    c.lineWidth = 4 / view.scale;
    c.beginPath(); c.arc(p.x, p.y, j.clear + 4 + 3 * pulse, 0, Math.PI * 2); c.fill(); c.stroke();
    const r = 8 / view.scale, bx = p.x + j.clear * 0.8, by = p.y - j.clear * 0.8;
    c.fillStyle = `rgb(${rgb})`;
    c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.font = `bold ${12 / view.scale}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('!', bx, by + 0.5 / view.scale);
  });
}

// Shows a gridlock toast (bottom right) each time a junction becomes
// gridlocked; `notified` stops repeats until that gridlock clears
function updateAlerts(t) {
  t.junctions.forEach(j => {
    if (j.gridlock && !j.notified) showGridlockToast(points[j.node]);
    j.notified = j.gridlock;
  });
}
