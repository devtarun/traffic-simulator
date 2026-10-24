// Unit tests for js/platform.js: the CrazyGames SDK (init, loading and
// gameplay events, saves in its data module), and the fallback to
// localStorage when the SDK is missing or unusable

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/app");

const KEY = "canvas-state";
const SAVE = JSON.stringify({
    points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
    ],
    lines: [[0, 1, 2]],
});

// Lets pending promises (the SDK's init) settle
const settle = () => new Promise((resolve) => setImmediate(resolve));

// A stand-in for window.CrazyGames.SDK that records its calls. data starts
// with `data`; environment "disabled" makes every call throw, like the real
// one; fail makes init() reject.
function fakeSdk({ environment = "crazygames", data = {}, fail = false } = {}) {
    const calls = [];
    const store = { ...data };
    const call =
        (name, f) =>
        (...args) => {
            if (environment === "disabled") throw new Error("SDK disabled");
            calls.push(name);
            return f?.(...args);
        };
    const SDK = {
        environment,
        init: async () => {
            calls.push("init");
            if (fail) throw new Error("init failed");
        },
        game: {
            loadingStart: call("loadingStart"),
            loadingStop: call("loadingStop"),
            gameplayStart: call("gameplayStart"),
            gameplayStop: call("gameplayStop"),
        },
        data: {
            getItem: call("getItem", (k) => (k in store ? store[k] : null)),
            setItem: call("setItem", (k, v) => {
                store[k] = String(v);
            }),
            removeItem: call("removeItem", (k) => {
                delete store[k];
            }),
        },
    };
    return { SDK, calls, store };
}

test("without the SDK the game starts at once, saving in localStorage", () => {
    const app = loadApp({ storage: { [KEY]: SAVE } });
    assert.equal(app.run("points.length"), 2);
    assert.equal(app.elements["resume-game"].disabled, false);
    app.elements.save.click();
    assert.ok(app.storage[KEY]);
});

test("with the SDK, the save loads from its data after init, while loading", async () => {
    const sdk = fakeSdk({ data: { [KEY]: SAVE } });
    const app = loadApp({ sdk: sdk.SDK });
    // nothing is loaded, or startable, before init finishes
    assert.equal(app.run("points.length"), 0);
    assert.equal(app.elements["fresh-game"].disabled, true);
    assert.equal(app.elements["resume-game"].disabled, true);
    await settle();
    assert.equal(app.run("points.length"), 2);
    assert.equal(app.elements["fresh-game"].disabled, false);
    assert.equal(app.elements["resume-game"].disabled, false);
    assert.deepEqual(sdk.calls, [
        "init",
        "loadingStart",
        "getItem",
        "loadingStop",
    ]);
});

test("with the SDK, Save, the first road and a fresh game use its data", async () => {
    const sdk = fakeSdk({ data: { [KEY]: SAVE } });
    const app = loadApp({ sdk: sdk.SDK });
    await settle();
    app.elements["fresh-game"].click();
    assert.equal(KEY in sdk.store, false);

    app.elements["mode-road"].click();
    app.click(100, 100);
    app.click(400, 100); // the first road of a fresh game saves itself
    assert.deepEqual(JSON.parse(sdk.store[KEY]).lines, [[0, 1, 2]]);
    app.click(400, 400);
    app.elements.save.click();
    assert.equal(JSON.parse(sdk.store[KEY]).lines.length, 2);
    assert.equal(KEY in app.storage, false); // nothing went to localStorage
});

test("gameplay starts with a game, and stops while the settings are open", async () => {
    const sdk = fakeSdk();
    const app = loadApp({ sdk: sdk.SDK });
    await settle();
    const gameplay = () => sdk.calls.filter((c) => c.startsWith("gameplay"));
    assert.deepEqual(gameplay(), []); // the start screen isn't gameplay
    app.elements["fresh-game"].click();
    assert.deepEqual(gameplay(), ["gameplayStart"]);
    app.elements.settings.click();
    assert.deepEqual(gameplay(), ["gameplayStart", "gameplayStop"]);
    app.elements.resume.click();
    assert.deepEqual(gameplay(), [
        "gameplayStart",
        "gameplayStop",
        "gameplayStart",
    ]);
    app.elements.resume.click(); // already closed: no repeat
    assert.equal(gameplay().length, 3);
});

test("a disabled SDK is left alone, and saves go to localStorage", async () => {
    const sdk = fakeSdk({ environment: "disabled" });
    const app = loadApp({ sdk: sdk.SDK, storage: { [KEY]: SAVE } });
    await settle();
    assert.equal(app.run("points.length"), 2);
    app.elements["resume-game"].click();
    app.elements.settings.click();
    app.elements.save.click();
    assert.ok(app.storage[KEY]);
    assert.deepEqual(sdk.calls, ["init"]);
});

test("if init fails the game still starts, saving in localStorage", async () => {
    const sdk = fakeSdk({ fail: true });
    const app = loadApp({
        sdk: sdk.SDK,
        storage: { [KEY]: SAVE },
        quiet: true,
    });
    await settle();
    assert.equal(app.run("points.length"), 2);
    assert.equal(app.elements["fresh-game"].disabled, false);
    app.elements.save.click();
    assert.deepEqual(sdk.calls, ["init"]);
});
