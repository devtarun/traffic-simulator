// Unit tests for js/junctions.js: crossings, splitting roads into junctions,
// and joining a new road onto an existing one

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

// How many roads meet at point i
const degree = (app, i) =>
    app.run(`lines.filter(([a, b]) => a === ${i} || b === ${i}).length`);

test("crossing finds where two segments cross strictly inside both", () => {
    const crossing = loadApp().run("crossing");
    const P = (x, y) => ({ x, y });
    assert.deepEqual(plain(crossing(P(0, 0), P(10, 0), P(5, -5), P(5, 5))), {
        x: 5,
        y: 0,
    });
    assert.equal(crossing(P(0, 0), P(10, 0), P(0, 5), P(10, 5)), null); // parallel
    assert.equal(crossing(P(0, 0), P(10, 0), P(10, 0), P(10, 5)), null); // meet at an end
    assert.equal(crossing(P(0, 0), P(10, 0), P(15, -5), P(15, 5)), null); // would meet beyond the end
});

test("addLine skips loops and duplicates in either direction", () => {
    const app = loadApp();
    app.run("points.push({ x: 0, y: 0 }, { x: 100, y: 0 })");
    app.run("addLine(0, 1, 2); addLine(1, 0, 2); addLine(0, 0, 2)");
    assert.deepEqual(plain(app.run("lines")), [[0, 1, 2]]);
});

test("splitLine replaces a road with two at a point, keeping its type", () => {
    const app = loadApp();
    app.run("points.push({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 })");
    app.run("addLine(0, 1, 1)");
    const before = app.run("roadsVersion");
    app.run("splitLine(0, 2)");
    assert.deepEqual(plain(app.run("lines")), [
        [0, 2, 1],
        [2, 1, 1],
    ]);
    assert.ok(app.run("roadsVersion") > before);
});

test("junctionize turns a + crossing into a 4-way junction", () => {
    const app = loadApp();
    app.road(2, [0, 100], [200, 100]);
    app.road(1, [100, 0], [100, 200]);
    assert.equal(app.run("points.length"), 5);
    assert.equal(app.run("lines.length"), 4);
    const j = app.run("points.findIndex((p) => p.x === 100 && p.y === 100)");
    assert.ok(j >= 0);
    assert.equal(degree(app, j), 4);
    // each half keeps its own road type
    assert.deepEqual(
        plain(
            app.run(
                `lines.filter(([a, b]) => a === ${j} || b === ${j}).map((l) => l[2]).sort()`,
            ),
        ),
        [1, 1, 2, 2],
    );
});

test("junctionize splits a road that runs through another road's point", () => {
    const app = loadApp();
    app.road(2, [100, 0], [100, 100]); // ends at (100, 100)
    app.road(2, [0, 100], [200, 100]); // passes through it
    const j = app.run("points.findIndex((p) => p.x === 100 && p.y === 100)");
    assert.equal(degree(app, j), 3); // a T-junction
});

test("junctionize turns a # of four long roads into four 4-way junctions", () => {
    const app = loadApp();
    app.road(2, [0, 100], [300, 100]);
    app.road(2, [0, 200], [300, 200]);
    app.road(2, [100, 0], [100, 300]);
    app.road(2, [200, 0], [200, 300]);
    const fourWay = app.run(
        "points.filter((p, i) => lines.filter(([a, b]) => a === i || b === i).length === 4).length",
    );
    assert.equal(fourWay, 4);
    assert.equal(app.run("points.length"), 12);
    assert.equal(app.run("lines.length"), 12);
});

test("roadAt projects onto the road under a point, away from its ends", () => {
    const app = loadApp();
    app.road(2, [0, 100], [400, 100]);
    assert.deepEqual(plain(app.run("roadAt({ x: 150, y: 110 }, null)")), {
        p: { x: 150, y: 100 },
        line: 0,
    });
    assert.equal(app.run("roadAt({ x: 150, y: 140 }, null)"), null); // off the asphalt
    assert.equal(app.run("roadAt({ x: 10, y: 100 }, null)"), null); // near an end: that's a point
});

test("roadAt joins where the angle-snap axis meets the road, and skips roads at last", () => {
    const app = loadApp();
    app.road(2, [0, 100], [400, 100]);
    app.run("points.push({ x: 150, y: 0 }); game.last = 2");
    // snapped vertically from last (150, 0): join at x = 150 even though the pointer is at 158
    assert.deepEqual(plain(app.run("roadAt({ x: 158, y: 104 }, 'y')")), {
        p: { x: 150, y: 100 },
        line: 0,
    });
    app.run("game.last = 0"); // drawing from the road's own end
    assert.equal(app.run("roadAt({ x: 150, y: 100 }, null)"), null);
});
