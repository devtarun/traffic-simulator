// Unit tests for js/roads.js: grouping segments into chains, trimming and
// offsetting paths, and rounding bends (the drawing itself isn't tested)

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

const app = loadApp();
const chains = app.run("chains"),
    cutPath = app.run("cutPath"),
    offsetPath = app.run("offsetPath"),
    bendTangent = app.run("bendTangent"),
    filletPath = app.run("filletPath"),
    roadWidth = app.run("roadWidth"),
    INNER_R = app.run("INNER_R");

const P = (x, y) => ({ x, y });
const A = P(0, 0),
    B = P(100, 0),
    C = P(100, 100),
    D = P(0, 100),
    E = P(200, 0),
    N = P(100, -100);
// Each chain as "points:lanes" plus "loop" when closed
const shape = (segs) =>
    plain(chains(segs)).map(
        (c) => c.pts.length + ":" + c.lanes + (c.closed ? " loop" : ""),
    );
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("chains joins roads of the same type through 2-road points", () => {
    assert.deepEqual(
        shape([
            [A, B, 2],
            [B, C, 2],
        ]),
        ["3:2"],
    ); // L corner
    assert.deepEqual(
        shape([
            [A, B, 2],
            [B, E, 2],
        ]),
        ["3:2"],
    ); // straight join
    assert.deepEqual(
        shape([
            [B, C, 2],
            [A, B, 2],
            [C, D, 2],
        ]),
        ["4:2"],
    ); // out of order
    assert.deepEqual(
        shape([
            [A, B, 2],
            [B, C, 2],
            [C, D, 2],
            [D, A, 2],
        ]),
        ["4:2 loop"],
    );
});

test("chains breaks at junctions and where the road type changes", () => {
    assert.deepEqual(
        shape([
            [A, B, 2],
            [B, C, 1],
        ]),
        ["2:2", "2:1"],
    );
    assert.deepEqual(
        shape([
            [A, B, 2],
            [B, E, 2],
            [B, C, 2],
        ]),
        ["2:2", "2:2", "2:2"],
    ); // T
    assert.deepEqual(
        shape([
            [A, B, 2],
            [B, E, 2],
            [B, C, 2],
            [N, B, 2],
        ]),
        ["2:2", "2:2", "2:2", "2:2"],
    ); // +
});

test("cutPath trims distances off each end, following the path round corners", () => {
    assert.deepEqual(plain(cutPath([A, B, C], 24, 24)), [
        P(24, 0),
        P(100, 0),
        P(100, 76),
    ]);
    assert.equal(cutPath([A, B], 60, 50), null); // nothing left
});

test("offsetPath keeps a right-angle corner exactly off from both legs", () => {
    const out = plain(offsetPath([A, B, C], 10, false));
    assert.equal(out.length, 3);
    assert.deepEqual(out[1], P(90, 10)); // inside the turn
});

test("offsetPath bevels the outside of turns sharper than a right angle", () => {
    // A sharp V: out along x, then back at 30° to it
    const V = [P(0, 0), P(100, 0), P(0, 50)];
    const inside = plain(offsetPath(V, 10, false)),
        outside = plain(offsetPath(V, -10, false));
    assert.equal(inside.length, 3); // mitred on the inside
    assert.equal(outside.length, 4); // two points at the bevelled tip
});

test("bendTangent gives the inner kerb radius INNER_R, limited by the sides' lengths", () => {
    const R = roadWidth(2) / 2 + INNER_R;
    assert.ok(near(bendTangent(2, Math.PI / 2, 1000, 1000), R)); // tan(45°) = 1
    assert.ok(
        bendTangent(2, Math.PI / 2, 1000, 1000) >
            bendTangent(1, Math.PI / 2, 1000, 1000),
    );
    assert.equal(bendTangent(2, Math.PI / 2, 40, 1000), 18); // 0.45 × the short side
});

test("filletPath rounds bends but keeps the ends and straight runs", () => {
    assert.deepEqual(plain(filletPath([A, B, E], 2, false)), [A, B, E]); // straight: unchanged
    const out = plain(filletPath([P(0, 0), P(300, 0), P(300, 300)], 2, false));
    assert.deepEqual(out[0], P(0, 0));
    assert.deepEqual(out[out.length - 1], P(300, 300));
    assert.ok(!out.some((p) => p.x === 300 && p.y === 0)); // the corner itself is gone
    // the curve starts and ends bendTangent() from the corner, and bulges inwards
    const d = bendTangent(2, Math.PI / 2, 300, 300);
    assert.ok(out.some((p) => near(p.x, 300 - d) && near(p.y, 0)));
    assert.ok(out.some((p) => near(p.x, 300) && near(p.y, d)));
    out.forEach((p) => assert.ok(p.x <= 300 + 1e-9 && p.y >= -1e-9));
});

test("roads draws a mixed network without errors", () => {
    const a = loadApp();
    a.road(2, [0, 100], [400, 100], [400, 400]);
    a.road(1, [200, 0], [200, 300]);
    assert.doesNotThrow(() =>
        a.run(
            "roads(ctx, lines.map(([p, q, l]) => [points[p], points[q], l]))",
        ),
    );
});
