// Unit tests for js/geometry.js: seeded randomness and box/segment geometry

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

const app = loadApp();
const rng = app.run("rng"),
    hash = app.run("hash"),
    corners = app.run("corners"),
    pointSegDist = app.run("pointSegDist"),
    segBoxDist = app.run("segBoxDist"),
    boxesOverlap = app.run("boxesOverlap");

// An axis-aligned box: center (cx, cy), half-width hw along x, half-depth hd along y
const box = (cx, cy, hw, hd) => ({
    c: { x: cx, y: cy },
    u: { x: 1, y: 0 },
    n: { x: 0, y: 1 },
    hw,
    hd,
});

test("rng is repeatable for a seed and stays in [0, 1)", () => {
    const a = rng(42),
        b = rng(42),
        c = rng(43);
    const seqA = Array.from({ length: 20 }, a),
        seqB = Array.from({ length: 20 }, b);
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 20 }, c));
    seqA.forEach((v) => assert.ok(v >= 0 && v < 1));
});

test("hash depends on every argument and rounds them", () => {
    assert.equal(hash(1, 2, 3), hash(1, 2, 3));
    assert.notEqual(hash(1, 2, 3), hash(3, 2, 1));
    assert.equal(hash(1.2, 2), hash(1, 2));
});

test("corners lists the four corners of a box", () => {
    const pts = plain(corners(box(0, 0, 2, 1)))
        .map((p) => `${p.x},${p.y}`)
        .sort();
    assert.deepEqual(pts, ["-2,-1", "-2,1", "2,-1", "2,1"]);
});

test("pointSegDist measures to the nearest point of the segment", () => {
    const a = { x: 0, y: 0 },
        b = { x: 10, y: 0 };
    assert.equal(pointSegDist({ x: 5, y: 3 }, a, b), 3); // above the middle
    assert.equal(pointSegDist({ x: -4, y: 3 }, a, b), 5); // past an end
    assert.equal(pointSegDist({ x: 3, y: 4 }, a, a), 5); // zero-length segment
});

test("segBoxDist is 0 when the segment crosses the box, else the gap", () => {
    const b = box(0, 0, 2, 1);
    assert.equal(segBoxDist(b, { x: -5, y: 0 }, { x: 5, y: 0 }), 0);
    assert.equal(segBoxDist(b, { x: -5, y: 4 }, { x: 5, y: 4 }), 3);
    assert.equal(segBoxDist(b, { x: 0, y: 0 }, { x: 0, y: 0 }), 0); // a point inside
});

test("boxesOverlap detects overlap and honours the margin", () => {
    assert.equal(boxesOverlap(box(0, 0, 2, 2), box(3, 0, 2, 2), 0), true);
    assert.equal(boxesOverlap(box(0, 0, 2, 2), box(5, 0, 2, 2), 0), false);
    assert.equal(boxesOverlap(box(0, 0, 2, 2), box(5, 0, 2, 2), 2), true); // 1 px apart, margin 2
});
