// Unit tests for js/traffic.js: cars and their homes, routes through the
// road graph, lanes, curved turns, positions along a path, and the traffic
// level

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./helpers/app");

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

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

// A stand-in building on line k, `along` from its first point, on the side
// facing direction n, for routing tests
function building(app, k, along, side = 1) {
    return app.run(`(() => {
        const [a, b] = lines[${k}], p = points[a], q = points[b];
        const L = Math.hypot(q.x - p.x, q.y - p.y), u = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
        const n = { x: -u.y * ${side}, y: u.x * ${side} };
        const off = roadWidth(lines[${k}][2]) / 2 + 4 + 10;
        return { seg: ${k}, along: ${along}, n, hd: 10, hw: 20, u,
            c: { x: p.x + u.x * ${along} + n.x * off, y: p.y + u.y * ${along} + n.y * off } };
    })()`);
}

test("makeTraffic gives each house that can reach an office its cars", () => {
    const app = gridApp();
    const t = plain(
        app.run(`({ homes: game.traffic.homes.length, base: game.traffic.baseCount, cars: game.traffic.cars.length,
            unreachable: game.traffic.homes.filter((h) => !h.reach.length).length })`),
    );
    assert.equal(
        t.base,
        Math.min(
            app.run("MAX_CARS"),
            Math.ceil(t.homes * app.run("CARS_PER_HOUSE")),
        ),
    );
    assert.equal(t.cars, t.base); // traffic level 100%
    assert.equal(t.unreachable, 0);
});

test("cars only head for offices on their own connected network", () => {
    const app = gridApp();
    app.road(2, [2000, 0], [2000, 1500]); // a separate road far away
    app.run("getScene()");
    const k = app.run("lines.length - 1");
    // Both networks have houses with somewhere to go...
    assert.ok(app.run(`game.traffic.cars.some((c) => c.home.seg === ${k})`));
    assert.ok(app.run(`game.traffic.cars.some((c) => c.home.seg !== ${k})`));
    // ...but nobody is sent across to the other one
    const crossing = app.run(
        `game.traffic.cars.filter((c) => c.home.reach.some((o) => (o.seg === ${k}) !== (c.home.seg === ${k}))).length`,
    );
    assert.equal(crossing, 0);
});

test("route runs door to door, with matching path, pieces and speeds", () => {
    const app = gridApp();
    const from = building(app, 0, 60),
        to = building(app, 3, 300);
    const r = plain(app.run("route")(app.run("game.traffic"), from, to, 1));
    assert.equal(r.pieces.length, r.path.length - 1);
    assert.equal(r.speed.length, r.path.length - 1);
    assert.equal(r.pieces[0].kind, "drive");
    assert.equal(r.pieces[r.pieces.length - 1].kind, "drive");
    const door = (b) => ({ x: b.c.x - b.n.x * b.hd, y: b.c.y - b.n.y * b.hd });
    assert.ok(
        near(r.path[0].x, door(from).x) && near(r.path[0].y, door(from).y),
    );
    const end = r.path[r.path.length - 1];
    assert.ok(near(end.x, door(to).x) && near(end.y, door(to).y));
    // road pieces go at their road's speed, everything else at the base speed
    r.pieces.forEach((p, i) => {
        const want =
            p.kind === "road"
                ? app.run(`ROAD_SPEED[lines[${+p.key.split(":")[0]}][2]]`)
                : 1;
        assert.equal(r.speed[i], want);
    });
});

test("route keeps cars in their lane, clamped to 2-lane roads' single lane", () => {
    const app = gridApp();
    const LANE_W = app.run("LANE_W");
    for (const lane of [0, 1]) {
        const r = app.run("route")(
            app.run("game.traffic"),
            building(app, 0, 60),
            building(app, 4, 200),
            lane,
        );
        const offs = plain(
            app.run(`(r) => r.pieces.map((p, i) => p.kind !== 'road' ? null : (() => {
                const k = +p.key.split(':')[0], L = lines[k][2];
                const [a, b] = lines[k];
                const mid = { x: (r.path[i].x + r.path[i + 1].x) / 2, y: (r.path[i].y + r.path[i + 1].y) / 2 };
                return [L, Math.round(pointSegDist(mid, points[a], points[b]) * 1000) / 1000];
            })()).filter(Boolean)`)(r),
        );
        offs.forEach(([lanes, d]) => {
            const used = Math.min(lane, lanes - 1);
            assert.ok(
                near(d, (used + 0.5) * LANE_W, 1e-3),
                `lane ${lane} on ${lanes}-lane road: ${d}`,
            );
        });
    }
});

test("route takes the shortest way through the road graph", () => {
    const app = loadApp();
    // A square loop: the short way from the bottom-left corner's road to
    // the left side is straight up, not round the other three sides
    app.road(2, [0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]);
    app.run("getScene()");
    const bottom = app.run(
        "lines.findIndex(([a, b]) => points[a].y === 0 && points[b].y === 0)",
    );
    const left = app.run(
        "lines.findIndex(([a, b]) => points[a].x === 0 && points[b].x === 0)",
    );
    const r = plain(
        app.run("route")(
            app.run("game.traffic"),
            building(app, bottom, 100),
            building(app, left, 500),
            0,
        ),
    );
    const roadsUsed = [
        ...new Set(
            r.pieces
                .filter((p) => p.kind === "road")
                .map((p) => +p.key.split(":")[0]),
        ),
    ];
    assert.deepEqual(roadsUsed.sort(), [bottom, left].sort());
});

test("turns are curved: no sharp corners between path pieces", () => {
    const app = gridApp();
    let worst = 0;
    for (let n = 0; n < 40; n++) {
        const r = plain(
            app.run(
                `(() => { const h = game.traffic.homes[${n} % game.traffic.homes.length]; return route(game.traffic, h, h.reach[${n} % h.reach.length], ${n % 2}); })()`,
            ),
        );
        for (let i = 2; i < r.path.length - 2; i++) {
            const [a, b, c] = [r.path[i - 1], r.path[i], r.path[i + 1]];
            if (
                Math.hypot(b.x - a.x, b.y - a.y) < 1e-6 ||
                Math.hypot(c.x - b.x, c.y - b.y) < 1e-6
            )
                continue;
            let d = Math.abs(
                Math.atan2(c.y - b.y, c.x - b.x) -
                    Math.atan2(b.y - a.y, b.x - a.x),
            );
            if (d > Math.PI) d = 2 * Math.PI - d;
            worst = Math.max(worst, (d * 180) / Math.PI);
        }
    }
    assert.ok(worst < 30, `sharpest bend ${worst.toFixed(1)}°`);
});

test("at a junction the turn's curve starts after the stop line", () => {
    const app = gridApp();
    const bad = app.run(`(() => {
        let bad = 0;
        game.traffic.homes.forEach((h) => h.reach.forEach((o) => {
            const r = route(game.traffic, h, o, 1);
            r.pieces.forEach((p, i) => {
                const next = r.pieces[i + 1];
                const j = next && next.kind === 'turn' && game.traffic.junctions.get(next.node);
                if (p.kind === 'road' && j && (p.tail || 0) > j.clear - CAR_LEN / 2) bad++;
            });
        }));
        return bad;
    })()`);
    assert.equal(bad, 0);
});

test("laneKey and lanePoint: lanes sit to the right of travel", () => {
    const app = loadApp();
    app.run(
        "points.push({ x: 0, y: 0 }, { x: 100, y: 0 }); lines.push([0, 1, 2])",
    );
    assert.equal(app.run("laneKey(0, 1, 1)"), "0:1:1");
    const LANE_W = app.run("LANE_W");
    // Travelling +x with y pointing down, "right" is +y
    assert.deepEqual(plain(app.run("lanePoint('0:1:0', 30)")), {
        x: 30,
        y: 0.5 * LANE_W,
    });
    assert.deepEqual(plain(app.run("lanePoint('0:-1:1', 30)")), {
        x: 70,
        y: -1.5 * LANE_W,
    });
});

test("pieceAt and carPos follow a car's distance along its path", () => {
    const app = loadApp();
    const car = {
        path: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 20 },
        ],
        cum: [0, 10, 30],
        len: 30,
        s: 0,
    };
    const at = (s) => plain(app.run("carPos")({ ...car, s }));
    assert.equal(app.run("pieceAt")({ ...car, s: 5 }), 1);
    assert.equal(app.run("pieceAt")({ ...car, s: 15 }), 2);
    assert.deepEqual(at(5), { x: 5, y: 0 });
    assert.deepEqual(at(20), { x: 10, y: 10 });
    assert.deepEqual(at(99), { x: 10, y: 20 }); // clamped to the end
});

test("changeTraffic steps the level by 10% and adds or removes cars", () => {
    const app = gridApp();
    const base = app.run("game.traffic.baseCount");
    assert.equal(app.run("changeTraffic(game.traffic, 0.1)"), true);
    assert.equal(app.run("trafficLevel"), 1.1);
    assert.equal(app.run("game.traffic.cars.length"), Math.round(base * 1.1));
    app.run(
        "changeTraffic(game.traffic, -0.1); changeTraffic(game.traffic, -0.1)",
    );
    assert.equal(app.run("trafficLevel"), 0.9);
    assert.equal(app.run("game.traffic.cars.length"), Math.round(base * 0.9));
});

test("changeTraffic stops at its limits, and keeps the level when roads change", () => {
    const app = gridApp();
    app.run("for (let i = 0; i < 50; i++) changeTraffic(game.traffic, 0.1)");
    assert.equal(app.run("trafficLevel"), app.run("TRAFFIC_MAX"));
    assert.equal(app.run("changeTraffic(game.traffic, 0.1)"), false);
    app.road(1, [1100, 250], [1100, 600]);
    app.run("getScene()");
    assert.equal(
        app.run("game.traffic.cars.length"),
        Math.round(app.run("game.traffic.baseCount * TRAFFIC_MAX")),
    );
    app.run("for (let i = 0; i < 50; i++) changeTraffic(game.traffic, -0.1)");
    assert.equal(app.run("trafficLevel"), app.run("TRAFFIC_MIN"));
});

test("roadUnder and boxAt find what's under a point", () => {
    const app = gridApp();
    assert.equal(app.run("lines[roadUnder({ x: 700, y: 255 })][2]"), 2);
    assert.equal(app.run("roadUnder({ x: 700, y: 400 })"), null); // open ground
    const box = app.run("getScene().boxes[0]");
    assert.equal(app.run("boxAt")(box.c), box);
    assert.equal(app.run("boxAt({ x: -5000, y: -5000 })"), null);
});
