// Unit tests for js/sim.js: lane helpers, right of way, car following,
// traffic lights, blocked / gridlocked junctions, road statistics and alerts

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

const DT = 1 / 120;

function gridApp() {
    const app = loadApp();
    app.road(2, [100, 250], [1100, 250]);
    app.road(2, [100, 600], [1100, 600]);
    app.road(2, [350, 80], [350, 800]);
    app.road(1, [800, 80], [800, 800]);
    app.road(1, [575, 250], [575, 600]);
    app.run("getScene()");
    return app;
}

// Runs the simulation for `seconds`, calling check() every 0.1 s
function run(app, seconds, check) {
    const step = app.run(`() => stepSim(traffic, ${DT})`);
    for (let k = 0; k < seconds / DT; k++) {
        step();
        if (check && k % 12 === 0) check(k * DT);
    }
}

// Pairs of cars in the same lane closer than a car length plus the gap
const overlaps = (app) =>
    app.run(`(() => { let bad = 0; (traffic.lanes || new Map()).forEach((list) => {
        for (let k = 1; k < list.length; k++) if (list[k].pos - list[k - 1].pos < CAR_LEN + MIN_GAP - 0.5) bad++;
    }); return bad; })()`);

test("compatible lets the same road and straight-opposite approaches go together", () => {
    const app = loadApp();
    app.road(2, [0, 200], [400, 200]);
    app.road(2, [200, 0], [200, 400]); // + junction at (200, 200)
    const key = (x0, y0, x1, y1) =>
        app.run(`(() => { const k = lines.findIndex(([a, b]) => [a, b].every((i) => [[${x0}, ${y0}], [${x1}, ${y1}]].some(([x, y]) => points[i].x === x && points[i].y === y)));
            return k + ':' + (points[lines[k][1]].x === ${x1} && points[lines[k][1]].y === ${y1} ? 1 : -1) + ':0'; })()`);
    const fromWest = key(0, 200, 200, 200),
        fromEast = key(400, 200, 200, 200),
        fromNorth = key(200, 0, 200, 200);
    const compatible = app.run("compatible");
    assert.equal(compatible(fromWest, fromWest.replace(/:0$/, ":1")), true); // same road, other lane
    assert.equal(compatible(fromWest, fromEast), true); // straight opposite
    assert.equal(compatible(fromWest, fromNorth), false); // crossing
});

test("nextRoad skips a turn's curve pieces", () => {
    const nextRoad = loadApp().run("nextRoad");
    const car = {
        pieces: [
            { kind: "drive" },
            { kind: "road" },
            { kind: "turn" },
            { kind: "turn" },
            { kind: "road", key: "x" },
        ],
    };
    assert.equal(nextRoad(car, 2), 4);
    assert.equal(nextRoad(car, 1), 1);
    assert.equal(nextRoad(car, 0), -1); // a driveway isn't a turn
});

test("cars never overlap in a lane and keep moving", () => {
    const app = gridApp();
    let worst = 0,
        nan = 0,
        trips = 0;
    const parked = () => app.run("traffic.cars.filter((c) => !c.path).length");
    let before = parked();
    run(app, 120, (t) => {
        if (t > 3) worst = Math.max(worst, overlaps(app));
        nan += app.run(
            "traffic.cars.filter((c) => c.path && !isFinite(carPos(c).x)).length",
        );
        const now = parked();
        if (now > before) trips += now - before;
        before = now;
    });
    assert.equal(worst, 0);
    assert.equal(nan, 0);
    assert.ok(trips > 50, `only ${trips} arrivals in 2 minutes`);
});

test("with signals, no car enters a junction on red", () => {
    const app = gridApp();
    app.run("traffic.junctions.forEach((j) => toggleLight(j.node))");
    app.run(`(() => {
        window.__entries = 0; window.__onRed = 0;
        const orig = stepSim;
        stepSim = (t, dt) => {
            const before = new Map(t.cars.map((c) => [c, c.box]));
            orig(t, dt);
            t.cars.forEach((c) => {
                if (c.box != null && before.get(c) !== c.box) {
                    __entries++;
                    if (lightFor(lightAt(c.box), t.junctions.get(c.box), c.boxFrom) === 'red') __onRed++;
                }
            });
        };
    })()`);
    run(app, 90);
    assert.ok(app.run("__entries") > 100);
    assert.equal(app.run("__onRed"), 0);
});

test("a standstill is flagged blocked, then gridlocked, and clears when traffic moves", () => {
    const app = gridApp();
    run(app, 10);
    app.run(
        "traffic.cars.forEach((c) => { c.__speed = c.speed; c.speed = 0; })",
    );
    const BLOCK = app.run("BLOCK_TIME"),
        GRID = app.run("GRIDLOCK_TIME");
    let firstBlocked = null,
        firstGrid = null;
    const t0 = app.run("simTime");
    run(app, GRID + 3, () => {
        const t = app.run("simTime") - t0;
        if (
            firstBlocked === null &&
            app.run("[...traffic.junctions.values()].some((j) => j.blocked)")
        )
            firstBlocked = t;
        if (
            firstGrid === null &&
            app.run("[...traffic.junctions.values()].some((j) => j.gridlock)")
        )
            firstGrid = t;
    });
    assert.ok(
        firstBlocked !== null &&
            firstBlocked >= BLOCK - 0.2 &&
            firstBlocked <= BLOCK + 0.5,
        `blocked at ${firstBlocked}`,
    );
    assert.ok(
        firstGrid !== null &&
            firstGrid >= GRID - 0.2 &&
            firstGrid <= GRID + 0.5,
        `gridlock at ${firstGrid}`,
    );
    app.run("traffic.cars.forEach((c) => { c.speed = c.__speed; })");
    run(app, 30);
    assert.equal(
        app.run(
            "[...traffic.junctions.values()].filter((j) => j.blocked || j.gridlock).length",
        ),
        0,
    );
});

test("waiting at a long red light isn't reported as blocked", () => {
    const app = gridApp();
    app.run(
        "traffic.junctions.forEach((j) => { toggleLight(j.node); lightAt(j.node).green = GREEN_MAX; })",
    );
    let flagged = 0;
    run(app, 120, () => {
        flagged += app.run(
            "[...traffic.junctions.values()].filter((j) => j.blocked).length",
        );
    });
    assert.equal(flagged, 0);
});

test("a long red builds a queue, which roadStats reports", () => {
    const app = gridApp();
    const j = app.run("points.findIndex((p) => p.x === 350 && p.y === 600)");
    app.run(`toggleLight(${j}); lightAt(${j}).green = GREEN_MAX`);
    let longest = null;
    run(app, 70, () => {
        const s = plain(
            app.run(
                `lines.flatMap(([a, b], k) => a === ${j} || b === ${j} ? [roadStats(traffic, k, 1), roadStats(traffic, k, -1)] : [])`,
            ),
        );
        s.forEach((x) => {
            if (!longest || x.queue > longest.queue) longest = x;
        });
    });
    assert.ok(longest.stopped >= 3, `only ${longest.stopped} cars queued`);
    assert.ok(longest.queue > 30);
    assert.ok(["Busy", "Congested", "Jammed"].includes(longest.level));
});

test("roadStats stays in range on every road", () => {
    const app = gridApp();
    run(app, 40);
    const all = plain(
        app.run(
            "lines.flatMap((l, k) => [roadStats(traffic, k, 1), roadStats(traffic, k, -1)])",
        ),
    );
    all.forEach((s) => {
        assert.ok(s.speed >= 0 && s.speed <= 1.01);
        assert.ok(
            s.flow >= 0 && s.cars >= s.stopped && s.queue >= 0 && s.wait >= 0,
        );
        assert.ok(["Free", "Busy", "Congested", "Jammed"].includes(s.level));
    });
    assert.ok(all.some((s) => s.flow > 0));
});

test("updateAlerts shows one toast per gridlock until it clears", () => {
    const app = gridApp();
    app.run(
        "window.__toasts = []; showGridlockToast = (p) => __toasts.push(p)",
    );
    const j = app.run("[...traffic.junctions.values()][0]");
    j.gridlock = true;
    app.run("updateAlerts(traffic); updateAlerts(traffic)");
    assert.equal(app.run("__toasts.length"), 1);
    j.gridlock = false;
    app.run("updateAlerts(traffic)");
    j.gridlock = true;
    app.run("updateAlerts(traffic)");
    assert.equal(app.run("__toasts.length"), 2);
});

test("the queue, flow and alert drawing runs without errors", () => {
    const app = gridApp();
    run(app, 10);
    assert.doesNotThrow(() =>
        app.run(
            "drawQueues(ctx, traffic); drawRoadFlow(ctx, traffic, 0); drawJunctionAlerts(ctx, traffic)",
        ),
    );
});
