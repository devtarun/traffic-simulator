// Unit tests for js/layout.js: placing houses, offices and trees along roads,
// and the getScene() cache

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

// A grid with both road types and several junctions
function gridApp() {
    const app = loadApp();
    app.road(2, [100, 250], [1100, 250]);
    app.road(2, [100, 600], [1100, 600]);
    app.road(2, [350, 80], [350, 800]);
    app.road(1, [800, 80], [800, 800]);
    app.road(1, [575, 250], [575, 600]);
    return app;
}

test("boxes are BOX_MIN to 2 × BOX_MIN wide and clear of roads, points and each other", () => {
    const app = gridApp();
    const bad = app.run(`(() => {
        const { boxes } = layout(), bad = [];
        boxes.forEach((b, i) => {
            if (b.hw * 2 < BOX_MIN - 1e-9 || b.hw * 2 > 2 * BOX_MIN + 1e-9) bad.push('width ' + i);
            lines.forEach(([a, c, l]) => { if (segBoxDist(b, points[a], points[c]) < roadWidth(l) / 2) bad.push('on road ' + i); });
            points.forEach((p) => { if (segBoxDist(b, p, p) < ROAD_WIDTH / 2) bad.push('on point ' + i); });
            boxes.forEach((o, k) => { if (k > i && boxesOverlap(b, o, 0)) bad.push('overlap ' + i + ',' + k); });
        });
        return bad;
    })()`);
    assert.deepEqual(plain(bad), []);
    assert.ok(app.run("layout().boxes.length") > 40);
});

test("boxes along one side of a road are BOX_GAP apart", () => {
    const app = gridApp();
    const gaps = plain(
        app.run(`(() => {
            const bySide = new Map();
            layout().boxes.forEach((b) => {
                const k = b.seg + ':' + Math.sign(b.n.x * 7 + b.n.y * 13);
                if (!bySide.has(k)) bySide.set(k, []);
                bySide.get(k).push(b);
            });
            const out = [];
            bySide.forEach((list) => {
                list.sort((a, b) => a.along - b.along);
                for (let i = 1; i < list.length; i++)
                    out.push(list[i].along - list[i].hw - (list[i - 1].along + list[i - 1].hw));
            });
            return out;
        })()`),
    );
    assert.ok(gaps.length > 10);
    // A skipped box leaves a bigger gap, but never a smaller one
    gaps.forEach((g) => assert.ok(g >= 20 - 1e-9, `gap ${g}`));
});

test("trees sit in gaps, clear of roads, boxes and each other", () => {
    const app = gridApp();
    const bad = app.run(`(() => {
        const { boxes, trees } = layout(), bad = [];
        trees.forEach((t, i) => {
            boxes.forEach((b) => { if (segBoxDist(b, t.c, t.c) < t.r) bad.push('in box ' + i); });
            lines.forEach(([a, c, l]) => { if (pointSegDist(t.c, points[a], points[c]) < roadWidth(l) / 2 + t.r) bad.push('on road ' + i); });
            trees.forEach((o, k) => { if (k > i && Math.hypot(o.c.x - t.c.x, o.c.y - t.c.y) < o.r + t.r) bad.push('trees ' + i + ',' + k); });
        });
        return bad;
    })()`);
    assert.deepEqual(plain(bad), []);
    assert.ok(app.run("layout().trees.length") > 20);
});

test("layout is the same every time for the same roads", () => {
    const app = gridApp();
    assert.equal(
        app.run("JSON.stringify(layout())"),
        app.run("JSON.stringify(layout())"),
    );
});

test("some boxes are offices, always at least one", () => {
    const app = gridApp();
    const { boxes, offices } = plain(
        app.run(
            "(() => { const b = layout().boxes; return { boxes: b.length, offices: b.filter((x) => x.office).length }; })()",
        ),
    );
    assert.ok(offices >= 1 && offices < boxes);
    // a single short road still gets an office
    const small = loadApp();
    small.road(2, [0, 0], [400, 0]);
    assert.ok(small.run("layout().boxes.filter((b) => b.office).length") >= 1);
});

test("getScene caches until the roads change, then rebuilds traffic too", () => {
    const app = gridApp();
    const first = app.run("getScene()");
    const traffic1 = app.run("traffic");
    assert.equal(app.run("getScene()"), first); // same object: cached
    app.road(1, [1100, 250], [1100, 600]);
    assert.notEqual(app.run("getScene()"), first);
    assert.notEqual(app.run("traffic"), traffic1);
});

test("getScene drops signals whose junction is gone", () => {
    const app = gridApp();
    app.run("getScene()");
    app.run("toggleLight([...traffic.junctions.keys()][0])");
    app.run("lights.set('9999,9999', { green: 12, start: 0 })"); // no junction there
    app.run("roadsChanged(); getScene()");
    assert.equal(app.run("lights.size"), 1);
    assert.equal(app.run("lights.has('9999,9999')"), false);
});
