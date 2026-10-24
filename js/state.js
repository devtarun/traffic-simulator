// Settings, shared state, and pointer position and hit-testing

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const STORAGE_KEY = 'canvas-state';
const points = [];
const lines = [];      // pairs of indices into points
const RADIUS = 4;
const ROAD_WIDTH = 32; // two lanes, one each way
const KEEP = 1;        // cars keep to the right (1) or the left (-1)
const OFFICE_SHARE = 0.2; // share of boxes that are offices; the rest are houses
const BOX_MIN = 40;    // boxes along roads are BOX_MIN to 2 × BOX_MIN wide
const BOX_GAP = 20;    // space between neighbouring boxes
const HIT = 20;        // pointer within this many px of a point snaps to it
let last = null;       // index of the most recently clicked point
let pointer = null;    // current pointer position, or null when outside
let snap = true;       // new roads snap to horizontal/vertical when close to it
const SNAP_ANGLE = 10; // degrees either side of horizontal/vertical that snap
const view = { x: 0, y: 0, scale: 1 }; // screen = world × scale + (x, y), in CSS px
const MIN_ZOOM = 0.1, MAX_ZOOM = 10;
const DRAG = 4;        // pointer must move this many px before a press pans
let drag = null;       // in-progress press: start position, view then, moved yet

// Pointer position in CSS px relative to the canvas
function screenPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// Pointer position in world coordinates, which points are stored in
function pos(e) {
  const s = screenPos(e);
  return { x: (s.x - view.x) / view.scale, y: (s.y - view.y) / view.scale };
}

// HIT is in screen px, so snapping feels the same at any zoom
function hitTest(p) {
  let best = null, bestDist = HIT / view.scale;
  points.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestDist) { best = i; bestDist = d; }
  });
  return best;
}
