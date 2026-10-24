// Settings, shared state, and pointer position and hit-testing

export const canvas = document.getElementById("c");
export const ctx = canvas.getContext("2d");
export const STORAGE_KEY = "canvas-state";
export const points = [];
export const lines = []; // [a, b, lanes]: indices into points, and lanes each way
// Bumped whenever points or lines change (call roadsChanged()), so caches
// keyed on the roads (getScene()) can tell cheaply whether to rebuild
export let roadsVersion = 0;
export function roadsChanged() {
    roadsVersion++;
}
export const LANE_W = 10.25; // width of one lane
export const MAX_LANES = 2; // lanes each way on the widest road type (4-lane)
// Values more than one module changes. ES modules can't assign to an
// imported variable, so they live on this one shared object instead.
export const game = {
    roadLanes: 2, // lanes each way for new roads, chosen from the right-click menu
    last: null, // index of the most recently clicked point
    pointer: null, // current pointer position, or null when outside
    snap: true, // new roads snap to horizontal/vertical when close to it
    paused: false, // traffic simulation paused; drawing and the view still work
    simSpeed: 1, // simulation steps per frame: 1, 2 or 3 (the speed button)
    roadEnabled: false, // Road toggle: allow point and road creation
    trafficEnabled: false, // Traffic toggle: allow signal placement at junctions
    drag: null, // in-progress press: start position, view then, moved yet
    pointerScreen: null, // last pointer position in screen px, or null when outside
    autoSaveOnFirstRoad: false,
    traffic: { adj: [], comp: [], cars: [] },
    selectedCar: null,
    selectedBox: null,
    selectedRoad: null,
    selectedJunction: null,
    renderAlpha: 0, // how far between the last two sim steps to draw cars (main.js)
};
// Full width of a road with `lanes` lanes each way: the lanes plus the white
// edge lines and their dark borders (7px in all, see roads())
export function roadWidth(lanes) {
    return 2 * lanes * LANE_W + 7;
}
export const ROAD_WIDTH = roadWidth(MAX_LANES); // widest road; for clearances not tied to one road
export const KEEP = 1; // cars keep to the right (1) or the left (-1)
export const OFFICE_SHARE = 0.2; // share of boxes that are offices; the rest are houses
export const BOX_MIN = 40; // boxes along roads are BOX_MIN to 2 × BOX_MIN wide
export const BOX_GAP = 20; // space between neighbouring boxes
export const HIT = 20; // pointer within this many px of a point snaps to it
export const SNAP_ANGLE = 10; // degrees either side of horizontal/vertical that snap
export const view = { x: 0, y: 0, scale: 1 }; // screen = world × scale + (x, y), in CSS px
export const MIN_ZOOM = 0.1,
    MAX_ZOOM = 10;
export const DRAG = 4; // pointer must move this many px before a press pans
export const PAN_SPEED = 600; // WASD pan speed, in screen px per second

// Pointer position in CSS px relative to the canvas
export function screenPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function screenToWorld(s) {
    return { x: (s.x - view.x) / view.scale, y: (s.y - view.y) / view.scale };
}

// Pointer position in world coordinates, which points are stored in
export function pos(e) {
    return screenToWorld(screenPos(e));
}

// HIT is in screen px, so snapping feels the same at any zoom
export function hitTest(p) {
    let best = null,
        bestDist = HIT / view.scale;
    points.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= bestDist) {
            best = i;
            bestDist = d;
        }
    });
    return best;
}
