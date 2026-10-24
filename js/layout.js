// Laying out boxes (houses and offices) and trees along the roads

// Lays boxes along both sides of every road, left to right from CLEAR px
// past each end, skipping any that would cover a road, a point or a box.
// Then puts a tree in the gap after each placed box where one fits. Trees
// go in after all boxes, so they never change where boxes land.
function layout() {
    // [p, q, half the road's width]
    const segs = lines.map(([a, b, lanes]) => [
        points[a],
        points[b],
        roadWidth(lanes) / 2,
    ]);
    const placed = [];
    const gaps = []; // middle of the gap after each placed box, on the road edge
    // CLEAR uses the widest road, since any type of road may join at the ends
    const CLEAR = ROAD_WIDTH,
        SETBACK = 4;
    segs.forEach(([p, q, half], seg) => {
        const L = Math.hypot(q.x - p.x, q.y - p.y);
        const u = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
        [1, -1].forEach((side) => {
            const n = { x: -u.y * side, y: u.x * side };
            // Seed from the road's ends in a fixed order, so direction doesn't matter
            const [s, e] =
                p.x < q.x || (p.x === q.x && p.y < q.y) ? [p, q] : [q, p];
            const rand = rng(
                hash(s.x, s.y, e.x, e.y, side * (s === p ? 1 : -1)),
            );
            for (let t = CLEAR; ;) {
                const w = BOX_MIN + rand() * BOX_MIN,
                    d = 20 + rand() * 20;
                if (t + w > L - CLEAR) break;
                const off = half + SETBACK + d / 2;
                const box = {
                    c: {
                        x: p.x + u.x * (t + w / 2) + n.x * off,
                        y: p.y + u.y * (t + w / 2) + n.y * off,
                    },
                    u,
                    n,
                    hw: w / 2,
                    hd: d / 2,
                    seg,
                    along: t + w / 2, // which line it fronts, and how far along it from its first point
                };
                // Its own road sits exactly at the minimum, so allow for rounding.
                // Points are junctions of unknown width, so allow for the widest road.
                const clear =
                    segs.every(
                        ([a, c, h]) =>
                            segBoxDist(box, a, c) >= h + SETBACK - 0.5,
                    ) &&
                    points.every(
                        (pt) =>
                            segBoxDist(box, pt, pt) >=
                            ROAD_WIDTH / 2 + SETBACK - 0.5,
                    ) &&
                    placed.every((o) => !boxesOverlap(box, o, SETBACK));
                if (clear) {
                    placed.push(box);
                    const g = t + w + BOX_GAP / 2;
                    if (g < L - CLEAR)
                        gaps.push({
                            x: p.x + u.x * g,
                            y: p.y + u.y * g,
                            n,
                            half,
                        });
                }
                t += w + BOX_GAP;
            }
        });
    });

    // Offices are picked by a PRNG seeded from position (separate from the
    // roof PRNG); with two or more boxes there is always at least one
    placed.forEach((b) => {
        b.office = rng(hash(b.c.x * 7, b.c.y * 7, 1))() < OFFICE_SHARE;
    });
    if (placed.length > 1 && !placed.some((b) => b.office)) {
        placed.reduce((a, b) => (b.hw * b.hd > a.hw * a.hd ? b : a)).office =
            true;
    }

    const trees = [];
    gaps.forEach((g) => {
        const rand = rng(hash(g.x * 10, g.y * 10, g.n.x * 10, g.n.y * 10));
        const r = 5.5 + rand() * 2; // at most 15px across, to fit the 20px gap
        const off = g.half + SETBACK + r + rand() * 10;
        const c = { x: g.x + g.n.x * off, y: g.y + g.n.y * off };
        const clear =
            segs.every(
                ([a, b, h]) => pointSegDist(c, a, b) >= h + SETBACK + r - 0.5,
            ) &&
            points.every(
                (pt) =>
                    Math.hypot(pt.x - c.x, pt.y - c.y) >=
                    ROAD_WIDTH / 2 + SETBACK + r - 0.5,
            ) &&
            placed.every((b) => segBoxDist(b, c, c) >= r + 1) &&
            trees.every(
                (o) => Math.hypot(o.c.x - c.x, o.c.y - c.y) >= o.r + r + 1,
            );
        if (clear) trees.push({ c, r, shade: rand() });
    });
    return { boxes: placed, trees };
}

// Boxes and trees only change when the roads do, so cache them between
// renders; traffic is rebuilt along with them. The key is roadsVersion, plus
// the counts as a safety net for any change that didn't call roadsChanged().
let sceneKey = "",
    scene = { boxes: [], trees: [] };
function getScene() {
    const key = roadsVersion + ":" + points.length + ":" + lines.length;
    if (key !== sceneKey) {
        sceneKey = key;
        scene = layout();
        traffic = makeTraffic(scene);
        selectedCar = selectedBox = selectedJunction = selectedRoad = null;
        // Drop signals whose junction is gone
        const keep = new Set([...traffic.junctions.keys()].map(posKey));
        [...lights.keys()].forEach((k) => {
            if (!keep.has(k)) lights.delete(k);
        });
    }
    return scene;
}
