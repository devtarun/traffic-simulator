// Loads the app's scripts for unit tests, without a browser.
//
// The scripts in js/ are plain browser scripts sharing one global scope, so
// they can't be imported. loadApp() reads them in index.html order and runs
// them in a fresh vm context with minimal stand-ins for the DOM, canvas,
// localStorage and timers. Every call gives an independent copy of the app.
//
//   const app = loadApp();
//   app.run('points.length')            // evaluate an expression in the app
//   app.run('roadWidth')(2)             // or grab a function and call it
//
// Objects and arrays made inside the app belong to its context, so strict
// deep-equality checks treat them as a different type from the test's own;
// pass them through plain() before comparing.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");

// Script paths in the order index.html loads them
function scriptPaths() {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) =>
        path.join(ROOT, m[1]),
    );
}

// A 2D context that accepts any drawing call and any property
function fakeContext() {
    return new Proxy(
        {},
        {
            get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
            set: (t, k, v) => ((t[k] = v), true),
        },
    );
}

// An element with the properties and methods the scripts touch
function fakeElement(id) {
    const el = {
        id,
        hidden: false,
        disabled: false,
        value: "",
        textContent: "",
        innerHTML: "",
        dataset: {},
        style: {},
        files: [],
        width: 1400,
        height: 900,
        clientWidth: 1400,
        clientHeight: 900,
        listeners: {},
        classList: {
            set: new Set(),
            add(c) {
                this.set.add(c);
            },
            remove(c) {
                this.set.delete(c);
            },
            toggle(c, on = !this.set.has(c)) {
                on ? this.set.add(c) : this.set.delete(c);
                return on;
            },
            contains(c) {
                return this.set.has(c);
            },
        },
        attributes: {},
        setAttribute(k, v) {
            this.attributes[k] = String(v);
        },
        getAttribute(k) {
            return this.attributes[k] ?? null;
        },
        addEventListener(type, f) {
            (this.listeners[type] ||= []).push(f);
        },
        dispatch(type, event = {}) {
            (this.listeners[type] || []).forEach((f) => f(event));
        },
        getContext: () => fakeContext(),
        getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            width: 1400,
            height: 900,
        }),
        setPointerCapture() {},
        querySelector: (q) => fakeElement(id + " " + q),
        querySelectorAll: () => [],
        appendChild() {},
        remove() {},
        contains: () => false,
        click() {
            if (el.onclick) el.onclick();
        },
    };
    return el;
}

function loadApp({ storage = {} } = {}) {
    const elements = {};
    const document = {
        getElementById: (id) => (elements[id] ||= fakeElement(id)),
        createElement: (tag) => fakeElement(tag),
        querySelector: (q) => fakeElement(q),
        querySelectorAll: () => [],
        addEventListener() {},
    };
    const store = { ...storage };
    const sandbox = {
        console,
        document,
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => {
                store[k] = String(v);
            },
            removeItem: (k) => {
                delete store[k];
            },
        },
        requestAnimationFrame: () => 0, // the frame loop never runs; tests drive it
        setTimeout: () => 0,
        clearTimeout() {},
        performance: { now: () => 0 },
        confirm: () => true,
        devicePixelRatio: 1,
        innerWidth: 1400,
        innerHeight: 900,
        addEventListener() {},
        Blob: class {},
        URL: { createObjectURL: () => "", revokeObjectURL() {} },
    };
    sandbox.window = sandbox;
    const context = vm.createContext(sandbox);
    // One script per file, like the browser: they share the context's global
    // scope, and errors point at the real file and line
    for (const p of scriptPaths()) {
        vm.runInContext(fs.readFileSync(p, "utf8"), context, { filename: p });
    }
    // Builds a road through world points ([x, y] pairs), reusing a point
    // already at the same spot, then junctionizes like a click would
    vm.runInContext(
        `function __road(lanes, pts) {
            let prev = null;
            for (const [x, y] of pts) {
                let i = points.findIndex((p) => p.x === x && p.y === y);
                if (i < 0) { points.push({ x, y }); i = points.length - 1; }
                if (prev !== null) addLine(prev, i, lanes);
                prev = i;
            }
            junctionize();
            roadsChanged();
        }`,
        context,
    );
    const run = (code) => vm.runInContext(code, context);
    const canvas = elements.c;
    const pointer = (type, x, y, button) =>
        canvas.dispatch(type, {
            button,
            clientX: x,
            clientY: y,
            pointerId: 1,
            preventDefault() {},
        });
    return {
        run,
        elements,
        storage: store,
        // road(lanes, [x, y], [x, y], ...): lanes each way (1 = 2-lane, 2 = 4-lane)
        road: (lanes, ...pts) => run("__road")(lanes, pts),
        // A left click (press and release in place) or a right press on the
        // canvas at screen px (x, y), through the real pointer handlers
        click: (x, y) => {
            pointer("pointerdown", x, y, 0);
            pointer("pointerup", x, y, 0);
        },
        rightClick: (x, y) => pointer("pointerdown", x, y, 2),
    };
}

// A copy of an app value made of this context's plain objects and arrays
const plain = (v) => structuredClone(v);

module.exports = { loadApp, plain };
