// Unit tests for the Vite build (vite.config.mjs): one HTML, one CSS and one
// JS file, minified, with the modules' names shortened, and a page that still
// starts

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadApp } = require("./helpers/app");
const { viteBuild } = require("./helpers/build");

const ROOT = path.join(__dirname, "..");
let out;

before(async () => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-build-"));
    await viteBuild(out);
});

const read = (f) => fs.readFileSync(path.join(out, f), "utf8");
const sourceSize = (files) =>
    files.reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
const sourceScripts = () =>
    fs.readdirSync(path.join(ROOT, "js")).map((f) => "js/" + f);

test("the build writes exactly index.html, app.css and app.js", () => {
    assert.deepEqual(fs.readdirSync(out).sort(), [
        "app.css",
        "app.js",
        "index.html",
    ]);
});

test("the HTML loads only the SDK and the built CSS and JS, and is minified", () => {
    const html = read("index.html");
    assert.match(html, /<link rel="stylesheet"[^>]*href="\.\/app\.css"/);
    assert.deepEqual(
        [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]),
        ["https://sdk.crazygames.com/crazygames-sdk-v3.js", "./app.js"], // the SDK first, as in the source
    );
    assert.doesNotMatch(html, /js\/|style\.css/);
    assert.doesNotMatch(html, /<!--/); // comments stripped
    assert.ok(
        html.length <
            fs.readFileSync(path.join(ROOT, "index.html"), "utf8").length * 0.8,
    );
    // the page's elements are all still there
    for (const id of [
        "c",
        "start-screen",
        "fresh-game",
        "settings-menu",
        "road-menu",
        "panel",
        "toasts",
        "mode-road",
        "speed",
    ])
        assert.match(html, new RegExp(`id="${id}"`));
});

test("the CSS is minified", () => {
    const css = read("app.css");
    assert.doesNotMatch(css, /\/\*/);
    assert.ok(css.length < sourceSize(["style.css"]) * 0.8);
    assert.match(css, /\.settings/);
});

test("the JS bundles every module, minified, with top-level names shortened", () => {
    const js = read("app.js");
    assert.ok(
        js.length < sourceSize(sourceScripts()) * 0.6,
        `${js.length} bytes`,
    );
    // Minified onto a handful of lines; the only line breaks left are inside
    // multi-line template strings, which can't be joined without changing them
    const sourceLines = sourceScripts().reduce(
        (n, f) =>
            n + fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").length,
        0,
    );
    assert.ok(
        js.split("\n").length < sourceLines / 50,
        `${js.split("\n").length} lines`,
    );
    // top-level functions and variables from across the modules are renamed
    for (const name of [
        "junctionize",
        "filletPath",
        "makeTraffic",
        "roadsChanged",
        "drawJunctionAlerts",
        "STORAGE_KEY",
    ])
        assert.doesNotMatch(
            js,
            new RegExp(`\\b${name}\\b`),
            `${name} still readable`,
        );
});

test("the built page starts without errors", () => {
    const app = loadApp({ root: out });
    // startup wired up the start screen and tool buttons
    assert.equal(typeof app.elements["fresh-game"].onclick, "function");
    assert.equal(typeof app.elements["mode-road"].onclick, "function");
    // and nothing leaked out as a global
    assert.equal(app.run("typeof junctionize"), "undefined");
});
