// Unit tests for js/lights.js: signals at junctions, phases, cycle timing
// and which approach sees which light

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

// A + junction at (200, 200) and a T junction at (600, 200)
function app2() {
    const app = loadApp();
    app.road(2, [0, 200], [800, 200]);
    app.road(2, [200, 0], [200, 400]);
    app.road(1, [600, 200], [600, 400]);
    app.run("getScene()");
    return app;
}
const nodeAt = (app, x, y) =>
    app.run(`points.findIndex((p) => p.x === ${x} && p.y === ${y})`);

test("toggleLight adds and removes a timed signal, keyed by the junction's position", () => {
    const app = app2();
    const j = nodeAt(app, 200, 200);
    assert.equal(app.run(`posKey(${j})`), "200,200");
    assert.equal(app.run(`lightAt(${j})`), null);
    app.run(`toggleLight(${j})`);
    assert.equal(app.run(`lightAt(${j}).green`), app.run("GREEN_DEFAULT"));
    assert.equal(app.run("lights.has('200,200')"), true);
    app.run(`toggleLight(${j})`);
    assert.equal(app.run(`lightAt(${j})`), null);
});

test("junctionPhases pairs opposite approaches", () => {
    const app = app2();
    const sizes = (x, y) =>
        plain(
            app.run(
                `game.traffic.junctions.get(${nodeAt(app, x, y)}).phases.map((p) => p.length).sort()`,
            ),
        );
    assert.deepEqual(sizes(200, 200), [2, 2]); // + : two straight-through pairs
    assert.deepEqual(sizes(600, 200), [1, 2]); // T : the through road, and the stem alone
});

test("lightCycle runs green, amber, all-red for each phase in turn", () => {
    const app = app2();
    const j = nodeAt(app, 200, 200);
    app.run(
        `toggleLight(${j}); lightAt(${j}).green = 10; lightAt(${j}).start = 0`,
    );
    const at = (t) =>
        plain(
            app.run(
                `simTime = ${t}; lightCycle(lightAt(${j}), game.traffic.junctions.get(${j}))`,
            ),
        );
    assert.deepEqual(at(0), { phase: 0, state: "green", left: 10 });
    assert.deepEqual(at(10.5), { phase: 0, state: "amber", left: 1.5 });
    assert.deepEqual(at(12.5), { phase: 0, state: "red", left: 0.5 });
    assert.equal(at(13).phase, 1); // 10 + 2 + 1
    assert.equal(at(13).state, "green");
    assert.equal(at(26).phase, 0); // the cycle wraps after both phases
});

test("lightFor gives an approach its phase's state, and red otherwise", () => {
    const app = app2();
    const j = nodeAt(app, 200, 200);
    app.run(`toggleLight(${j}); lightAt(${j}).start = 0; simTime = 1`);
    const states = plain(
        app.run(
            `(() => { const J = game.traffic.junctions.get(${j}); return J.phases.map((ph) => ph.map((a) => lightFor(lightAt(${j}), J, a.id + ':0'))); })()`,
        ),
    );
    assert.deepEqual(states, [
        ["green", "green"],
        ["red", "red"],
    ]);
});

test("lightGreen allows green, and amber only when too close to stop", () => {
    const app = app2();
    const j = nodeAt(app, 200, 200);
    app.run(
        `toggleLight(${j}); lightAt(${j}).green = 10; lightAt(${j}).start = 0`,
    );
    const go = (t, phase, stopDist, v) =>
        app.run(
            `(() => { simTime = ${t}; const J = game.traffic.junctions.get(${j}); return lightGreen(lightAt(${j}), J, J.phases[${phase}][0].id + ':0', ${stopDist}, ${v}); })()`,
        );
    assert.equal(go(1, 0, 50, 40), true); // green
    assert.equal(go(1, 1, 50, 40), false); // red
    assert.equal(go(10.5, 0, 50, 40), false); // amber, room to stop (40²/180 ≈ 8.9 < 50)
    assert.equal(go(10.5, 0, 5, 40), true); // amber, too close to stop
});

test("drawLights draws every signal without errors", () => {
    const app = app2();
    app.run("game.traffic.junctions.forEach((J) => toggleLight(J.node))");
    assert.doesNotThrow(() => app.run("drawLights(ctx, game.traffic)"));
});
