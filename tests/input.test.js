// Unit tests for js/input.js: building roads with the pointer, removing
// points, the Road / Traffic tools, the viewport, and the buttons

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

// An app with the Road tool on, as if its button had been clicked
function roadApp() {
    const app = loadApp();
    app.elements["mode-road"].click();
    return app;
}
const count = (app) =>
    plain(app.run("({ points: points.length, lines: lines.length })"));

test("clicks build nothing until the Road tool is on", () => {
    const app = loadApp();
    app.click(100, 100);
    app.click(300, 100);
    assert.deepEqual(count(app), { points: 0, lines: 0 });
    app.elements["mode-road"].click();
    assert.equal(app.run("roadEnabled"), true);
    app.click(100, 100);
    app.click(300, 100);
    assert.deepEqual(count(app), { points: 2, lines: 1 });
});

test("a chain of clicks builds connected roads of the chosen type", () => {
    const app = roadApp();
    app.run("roadLanes = 1");
    app.click(100, 100);
    app.click(400, 100);
    app.click(400, 400);
    assert.deepEqual(plain(app.run("lines")), [
        [0, 1, 1],
        [1, 2, 1],
    ]);
    assert.equal(app.run("last"), 2);
});

test("clicking back along an existing road doesn't duplicate it", () => {
    const app = roadApp();
    app.click(100, 100);
    app.click(300, 100);
    app.click(100, 100);
    app.click(300, 100);
    assert.deepEqual(count(app), { points: 2, lines: 1 });
});

test("angle snapping straightens near-horizontal roads and reuses points it lands on", () => {
    const app = roadApp();
    app.click(100, 100);
    app.click(300, 108); // within 10° of horizontal
    assert.deepEqual(plain(app.run("points[1]")), { x: 300, y: 100 });
    app.run("last = null");
    app.click(100, 100);
    app.click(300, 130); // snaps exactly onto (300, 100): reuse it, no stacked point
    assert.deepEqual(count(app), { points: 2, lines: 1 });
});

test("snapping can be turned off from the settings", () => {
    const app = roadApp();
    app.elements.snap.click();
    assert.equal(app.run("snap"), false);
    assert.equal(app.elements.snap.textContent, "Snap: off");
    app.click(100, 100);
    app.click(300, 108);
    assert.deepEqual(plain(app.run("points[1]")), { x: 300, y: 108 });
});

test("clicking on a road joins onto it as a T-junction", () => {
    const app = roadApp();
    app.click(100, 300);
    app.click(700, 300);
    app.run("last = null");
    app.click(400, 100);
    app.click(406, 309); // on the road, slightly off its center line
    const j = app.run("points.findIndex((p) => p.x === 400 && p.y === 300)");
    assert.ok(j >= 0);
    assert.equal(
        app.run(`lines.filter(([a, b]) => a === ${j} || b === ${j}).length`),
        3,
    );
});

test("right-click on empty ground ends the road and opens the road type menu", () => {
    const app = roadApp();
    app.click(100, 100);
    app.rightClick(600, 600);
    assert.equal(app.run("last"), null);
    assert.equal(app.elements["road-menu"].hidden, false);
    assert.deepEqual(count(app), { points: 0, lines: 0 }); // the lone first point is pruned
    // a left press while the menu is open only closes it
    app.click(200, 200);
    assert.equal(app.elements["road-menu"].hidden, true);
    assert.deepEqual(count(app), { points: 0, lines: 0 });
});

test("right-click on a point removes it, and any points it leaves without roads", () => {
    const app = roadApp();
    app.click(100, 100);
    app.click(300, 100);
    app.click(300, 300);
    app.run("last = null");
    app.rightClick(300, 100); // the middle point: both neighbours are stranded
    assert.deepEqual(count(app), { points: 0, lines: 0 });
});

test("cancelling the removal confirmation keeps the point", () => {
    const app = roadApp();
    app.click(100, 100);
    app.click(300, 100);
    app.run("last = null; confirm = () => false");
    app.rightClick(300, 100);
    assert.deepEqual(count(app), { points: 2, lines: 1 });
});

test("remove() renumbers later points in roads and last", () => {
    const app = loadApp();
    app.run(
        "points.push({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }); lines.push([1, 2, 2]); last = 2",
    );
    app.run("remove(0)");
    assert.deepEqual(plain(app.run("lines")), [[0, 1, 2]]);
    assert.equal(app.run("last"), 1);
});

test("with Road off, clicks select cars and buildings instead of building", () => {
    const app = loadApp();
    app.road(2, [100, 300], [900, 300]);
    const box = app.run("getScene().boxes[0]");
    app.click(box.c.x, box.c.y);
    assert.equal(app.run("selectedBox"), box);
    assert.deepEqual(count(app), { points: 2, lines: 1 });
    app.rightClick(5, 5); // right-click just deselects
    assert.equal(app.run("selectedBox"), null);
});

test("with Traffic on, clicking a junction toggles its signal", () => {
    const app = loadApp();
    app.road(2, [100, 300], [700, 300]);
    app.road(2, [400, 100], [400, 500]);
    app.run("getScene()");
    app.elements["mode-traffic"].click();
    app.click(400, 300);
    assert.ok(
        app.run("lightAt(points.findIndex((p) => p.x === 400 && p.y === 300))"),
    );
    assert.equal(
        app.run("selectedJunction"),
        app.run("points.findIndex((p) => p.x === 400 && p.y === 300)"),
    );
    app.click(400, 300);
    assert.equal(app.run("lights.size"), 0);
});

test("dragging pans the view without adding a point", () => {
    const app = roadApp();
    app.canvasEvent("pointerdown", { button: 0, clientX: 500, clientY: 400 });
    app.canvasEvent("pointermove", { clientX: 560, clientY: 380 });
    app.canvasEvent("pointerup", { button: 0, clientX: 560, clientY: 380 });
    assert.deepEqual(plain(app.run("view")), { x: 60, y: -20, scale: 1 });
    assert.deepEqual(count(app), { points: 0, lines: 0 });
});

test("the wheel zooms around the pointer", () => {
    const app = loadApp();
    const under = () => plain(app.run("screenToWorld({ x: 600, y: 300 })"));
    const before = under();
    app.canvasEvent("wheel", {
        deltaY: -300,
        deltaMode: 0,
        clientX: 600,
        clientY: 300,
    });
    assert.ok(app.run("view.scale") > 1);
    const after = under();
    assert.ok(
        Math.abs(after.x - before.x) < 1e-9 &&
            Math.abs(after.y - before.y) < 1e-9,
    );
});

test("holding W/A/S/D pans the view, ignoring Ctrl combinations", () => {
    const app = loadApp();
    app.windowEvent("keydown", { code: "KeyD" });
    app.run("panKeys(0.5)");
    assert.equal(app.run("view.x"), -app.run("PAN_SPEED") * 0.5);
    app.windowEvent("keyup", { code: "KeyD" });
    app.windowEvent("keydown", { code: "KeyW", ctrlKey: true });
    app.run("panKeys(0.5)");
    assert.equal(app.run("view.y"), 0);
});

test("the speed button cycles normal, 2× and 3×", () => {
    const app = loadApp();
    const speed = app.elements.speed;
    const seen = [];
    for (let i = 0; i < 3; i++) {
        speed.click();
        seen.push([app.run("simSpeed"), speed.textContent]);
    }
    assert.deepEqual(seen, [
        [2, "❯❯"],
        [3, "❯❯❯"],
        [1, "❯"],
    ]);
});

test("traffic + and − change the traffic level", () => {
    const app = loadApp();
    app.road(2, [100, 300], [900, 300]);
    app.run("getScene()");
    app.elements["traffic-more"].click();
    assert.equal(app.run("trafficLevel"), 1.1);
    app.elements["traffic-less"].click();
    app.elements["traffic-less"].click();
    assert.equal(app.run("trafficLevel"), 0.9);
});

test("the settings menu pauses while open and restores the previous state", () => {
    const app = loadApp();
    app.run("paused = false");
    app.elements.settings.click();
    assert.equal(app.elements["settings-menu"].hidden, false);
    assert.equal(app.run("paused"), true);
    app.elements.resume.click();
    assert.equal(app.elements["settings-menu"].hidden, true);
    assert.equal(app.run("paused"), false);
    app.run("paused = true");
    app.elements.settings.click();
    app.windowEvent("keydown", { key: "Escape" });
    assert.equal(app.run("paused"), true); // was paused before, stays paused
});

test("Reset clears roads and signals and closes the settings", () => {
    const app = loadApp();
    app.road(2, [100, 300], [700, 300]);
    app.road(2, [400, 100], [400, 500]);
    app.run("getScene(); toggleLight([...traffic.junctions.keys()][0])");
    app.elements.settings.click();
    app.elements.reset.click();
    assert.deepEqual(count(app), { points: 0, lines: 0 });
    assert.equal(app.run("lights.size"), 0);
    assert.equal(app.elements["settings-menu"].hidden, true);
});
