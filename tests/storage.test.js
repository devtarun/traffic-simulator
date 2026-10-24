// Unit tests for js/storage.js: save data, validating backups, loading and
// restoring

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

const KEY = "canvas-state";
const save = (data) => ({ [KEY]: JSON.stringify(data) });

test("saveData and applySave round-trip roads, view and signals", () => {
    const app = loadApp();
    app.road(2, [0, 200], [800, 200]);
    app.road(1, [200, 0], [200, 400]);
    app.run(
        "getScene(); toggleLight([...game.traffic.junctions.keys()][0]); lights.get('200,200').green = 20",
    );
    app.run("Object.assign(view, { x: 30, y: -40, scale: 1.5 })");
    const data = plain(app.run("saveData()"));

    const copy = loadApp();
    copy.run("applySave")(data);
    assert.deepEqual(plain(copy.run("points")), data.points);
    assert.deepEqual(plain(copy.run("lines")), data.lines);
    assert.deepEqual(plain(copy.run("view")), { x: 30, y: -40, scale: 1.5 });
    assert.equal(copy.run("lights.get('200,200').green"), 20);
});

test("normalizeSave fills in what older saves lack", () => {
    const n = plain(
        loadApp().run("normalizeSave")({
            points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            lines: [[0, 1]],
        }),
    );
    assert.deepEqual(n.lines, [[0, 1, 2]]); // no road type: 4-lane
    assert.equal(n.last, null);
    assert.deepEqual(n.view, { x: 0, y: 0, scale: 1 });
    assert.deepEqual(n.lights, []);
});

test("normalizeSave clamps signal green times to the allowed range", () => {
    const app = loadApp();
    const n = plain(
        app.run("normalizeSave")({
            points: [],
            lines: [],
            lights: [
                ["1,1", 1],
                ["2,2", 999],
                ["3,3", 15],
            ],
        }),
    );
    assert.deepEqual(n.lights, [
        ["1,1", app.run("GREEN_MIN")],
        ["2,2", app.run("GREEN_MAX")],
        ["3,3", 15],
    ]);
});

test("normalizeSave rejects broken backups with a clear message", () => {
    const normalizeSave = loadApp().run("normalizeSave");
    const pts = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
    ];
    const cases = [
        [null, /not a valid/],
        [{ points: "x", lines: [] }, /not a valid/],
        [{ points: [{ x: "a", y: 0 }], lines: [] }, /invalid point/],
        [{ points: pts, lines: [[0, 5, 2]] }, /invalid road\./],
        [{ points: pts, lines: [[1, 1, 2]] }, /invalid road\./],
        [{ points: pts, lines: [[0, 1, 3]] }, /invalid road type/],
        [{ points: pts, lines: [], last: 7 }, /invalid road endpoint/],
        [
            { points: pts, lines: [], view: { x: 0, y: 0, scale: 0 } },
            /invalid view/,
        ],
        [{ points: pts, lines: [], lights: "x" }, /invalid traffic lights/],
        [
            { points: pts, lines: [], lights: [[1, 12]] },
            /invalid traffic light\./,
        ],
    ];
    cases.forEach(([data, msg]) =>
        assert.throws(() => normalizeSave(data), msg),
    );
});

test("applySave turns crossings in older saves into junctions", () => {
    const app = loadApp();
    app.run("applySave")({
        points: [
            { x: 0, y: 0 },
            { x: 600, y: 0 },
            { x: 300, y: -300 },
            { x: 300, y: 300 },
        ],
        lines: [
            [0, 1, 2],
            [2, 3, 1],
        ],
    });
    assert.equal(app.run("points.length"), 5);
    assert.equal(app.run("lines.length"), 4);
});

test("load reports whether there was a save, and survives a corrupt one", () => {
    assert.equal(loadApp().run("load()"), false); // nothing stored

    const app = loadApp({
        storage: save({
            points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            lines: [[0, 1, 1]],
        }),
    });
    // main.js already called load() on startup
    assert.deepEqual(plain(app.run("lines")), [[0, 1, 1]]);
    assert.equal(app.run("load()"), true);

    const broken = loadApp({ storage: { [KEY]: "{not json" }, quiet: true });
    assert.equal(broken.run("load()"), false);
    assert.equal(broken.run("points.length"), 0);
});

test("the Save button stores the current game", () => {
    const app = loadApp();
    app.road(2, [0, 0], [300, 0]);
    app.elements.save.click();
    assert.equal(app.elements.save.textContent, "Saved");
    const stored = JSON.parse(app.storage[KEY]);
    assert.deepEqual(stored.lines, [[0, 1, 2]]);
});

test("restoreSave stores and applies a backup", () => {
    const app = loadApp();
    app.run("restoreSave")({
        points: [
            { x: 5, y: 5 },
            { x: 50, y: 5 },
        ],
        lines: [[0, 1, 1]],
        view: { x: 1, y: 2, scale: 3 },
    });
    assert.deepEqual(plain(app.run("view")), { x: 1, y: 2, scale: 3 });
    assert.deepEqual(JSON.parse(app.storage[KEY]).lines, [[0, 1, 1]]);
});
