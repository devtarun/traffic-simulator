// Unit tests for js/state.js: road widths, coordinates and point picking

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

test("roadWidth is two lane-widths per lane each way plus 7px of edges", () => {
    const app = loadApp();
    const roadWidth = app.run("roadWidth"),
        LANE_W = app.run("LANE_W");
    assert.equal(roadWidth(1), 2 * LANE_W + 7);
    assert.equal(roadWidth(2), 4 * LANE_W + 7);
    assert.equal(app.run("ROAD_WIDTH"), roadWidth(app.run("MAX_LANES")));
});

test("roadsChanged bumps roadsVersion", () => {
    const app = loadApp();
    const before = app.run("roadsVersion");
    app.run("roadsChanged()");
    assert.equal(app.run("roadsVersion"), before + 1);
});

test("screenToWorld undoes the view's pan and zoom", () => {
    const app = loadApp();
    app.run("Object.assign(view, { x: 100, y: -50, scale: 2 })");
    assert.deepEqual(plain(app.run("screenToWorld({ x: 300, y: 150 })")), {
        x: 100,
        y: 100,
    });
    // pos() reads clientX/Y relative to the canvas (at 0, 0 here)
    assert.deepEqual(plain(app.run("pos({ clientX: 300, clientY: 150 })")), {
        x: 100,
        y: 100,
    });
});

test("hitTest finds the nearest point within HIT screen px", () => {
    const app = loadApp();
    app.run("points.push({ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 100, y: 100 })");
    assert.equal(app.run("hitTest({ x: 10, y: 0 })"), 1); // nearer to 15 than to 0
    assert.equal(app.run("hitTest({ x: 2, y: 1 })"), 0);
    assert.equal(app.run("hitTest({ x: 50, y: 50 })"), null); // nothing within 20
});

test("hitTest's reach is in screen px, so it shrinks in world px when zoomed in", () => {
    const app = loadApp();
    app.run("points.push({ x: 0, y: 0 })");
    assert.equal(app.run("hitTest({ x: 15, y: 0 })"), 0);
    app.run("view.scale = 2"); // 20 screen px = 10 world px
    assert.equal(app.run("hitTest({ x: 15, y: 0 })"), null);
    assert.equal(app.run("hitTest({ x: 9, y: 0 })"), 0);
});
