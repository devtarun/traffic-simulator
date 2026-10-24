// Junctions: making roads that cross or touch share a point, so markings stop
// at the junction and cars can turn there

import {
    HIT,
    game,
    lines,
    points,
    roadWidth,
    roadsChanged,
    view,
} from "./state.js";
import { pointSegDist } from "./geometry.js";

// Where segments p–q and r–s cross, strictly inside both (not at an end), or null
export function crossing(p, q, r, s) {
    const d1 = { x: q.x - p.x, y: q.y - p.y },
        d2 = { x: s.x - r.x, y: s.y - r.y };
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-9) return null; // parallel
    const t = ((r.x - p.x) * d2.y - (r.y - p.y) * d2.x) / den;
    const u = ((r.x - p.x) * d1.y - (r.y - p.y) * d1.x) / den;
    const e = 1e-6;
    if (t <= e || t >= 1 - e || u <= e || u >= 1 - e) return null;
    return { x: p.x + d1.x * t, y: p.y + d1.y * t };
}

// Adds road a–b unless it's a loop or already exists
export function addLine(a, b, lanes) {
    if (
        a === b ||
        lines.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
    )
        return;
    lines.push([a, b, lanes]);
    roadsChanged();
}

// Replaces line k with two lines meeting at point m, keeping its type
export function splitLine(k, m) {
    const [a, b, lanes] = lines.splice(k, 1)[0];
    roadsChanged();
    addLine(a, m, lanes);
    addLine(m, b, lanes);
}

// Turns every place two roads meet mid-way into a junction: roads that cross
// are split at the crossing and share a new point there, and a road running
// through another road's point is split at that point. Repeats until nothing
// changes, since each split can create new pairs to check. Never removes
// points, so indices (and last) stay valid.
export function junctionize() {
    for (let changed = true; changed;) {
        changed = false;
        for (let i = 0; i < lines.length && !changed; i++) {
            const [a, b] = lines[i];
            // A point lying on this road's center line, away from its ends
            const m = points.findIndex(
                (pt, k) =>
                    k !== a &&
                    k !== b &&
                    pointSegDist(pt, points[a], points[b]) < 0.5 &&
                    Math.min(
                        Math.hypot(pt.x - points[a].x, pt.y - points[a].y),
                        Math.hypot(pt.x - points[b].x, pt.y - points[b].y),
                    ) > 0.5,
            );
            if (m >= 0) {
                splitLine(i, m);
                changed = true;
                break;
            }
            for (let j = i + 1; j < lines.length; j++) {
                const [c, d] = lines[j];
                if (a === c || a === d || b === c || b === d) continue;
                const x = crossing(points[a], points[b], points[c], points[d]);
                if (!x) continue;
                let k = points.findIndex(
                    (pt) => Math.hypot(pt.x - x.x, pt.y - x.y) < 0.5,
                );
                if (k < 0) {
                    points.push(x);
                    k = points.length - 1;
                    roadsChanged();
                }
                splitLine(j, k); // j first: it's later in lines, so i's index is unaffected
                splitLine(i, k);
                changed = true;
                break;
            }
        }
    }
}

// The road under world point q, for joining a new road onto it: the nearest
// line whose asphalt covers q, away from its ends (those are points, which
// hitTest() handles), skipping roads at last since joining one would double
// back along it. With an angle-snap axis ('x' for horizontal, 'y' for
// vertical, through last), the join is where that axis meets the road's center
// line; otherwise it's q's projection onto it. Returns { p, line } or null.
export function roadAt(q, axis) {
    let best = null,
        bestDist = Infinity;
    const end = HIT / view.scale;
    lines.forEach(([a, b, lanes], k) => {
        if (a === game.last || b === game.last) return;
        const p0 = points[a],
            p1 = points[b];
        const d = pointSegDist(q, p0, p1);
        if (d > roadWidth(lanes) / 2 || d >= bestDist) return;
        const dx = p1.x - p0.x,
            dy = p1.y - p0.y,
            L = Math.hypot(dx, dy);
        let t = ((q.x - p0.x) * dx + (q.y - p0.y) * dy) / (L * L);
        if (axis && game.last !== null) {
            const o = points[game.last];
            // Solve p0 + t·(dx, dy) on the line y = o.y (axis x) or x = o.x (axis y)
            const s =
                axis === "x"
                    ? dy
                        ? (o.y - p0.y) / dy
                        : null
                    : dx
                      ? (o.x - p0.x) / dx
                      : null;
            if (
                s !== null &&
                Math.hypot(p0.x + dx * s - q.x, p0.y + dy * s - q.y) <=
                    roadWidth(lanes) / 2 + end
            )
                t = s;
        }
        if (t * L <= end || (1 - t) * L <= end) return;
        best = { p: { x: p0.x + dx * t, y: p0.y + dy * t }, line: k };
        bestDist = d;
    });
    return best;
}
