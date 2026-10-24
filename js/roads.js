// Drawing roads

function line(a, b, c = ctx) {
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
}

function polyline(pts, c, closed) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    if (closed) c.closePath();
    c.stroke();
}

// Groups segments ([p, q, lanes]) into chains: runs of segments joined end to
// end through points where exactly two roads of the same type meet, so a
// corner or bend is one road rather than two. Chains end at junctions (three
// or more roads), dead ends, and where the road type changes. Each chain is
// { pts, lanes, closed }, closed when it loops back to its start.
function chains(segs) {
    const key = (p) => p.x + "," + p.y;
    const at = new Map(); // point key -> indices of segments there
    segs.forEach(([p, q], i) =>
        [p, q].forEach((e) => {
            if (!at.has(key(e))) at.set(key(e), []);
            at.get(key(e)).push(i);
        }),
    );
    // The other segment through e, if e joins exactly two of the same type
    const next = (e, i) => {
        const here = at.get(key(e));
        if (here.length !== 2) return null;
        const j = here[0] === i ? here[1] : here[0];
        return j !== i && segs[j][2] === segs[i][2] ? j : null;
    };
    const used = new Set(),
        out = [];
    const walk = (start) => {
        // Back up to a chain end (or all the way round a loop)
        let i = start,
            e = segs[start][0];
        for (let j; (j = next(e, i)) !== null && j !== start;) {
            e =
                segs[j][0] === e || key(segs[j][0]) === key(e)
                    ? segs[j][1]
                    : segs[j][0];
            i = j;
        }
        // Walk forward from there, collecting points
        const first = i,
            pts = [e];
        let closed = false;
        for (;;) {
            used.add(i);
            const [p, q] = segs[i];
            e = key(p) === key(e) ? q : p;
            pts.push(e);
            const j = next(e, i);
            if (j === null) break;
            if (j === first) {
                closed = true;
                pts.pop();
                break;
            }
            if (used.has(j)) break;
            i = j;
        }
        out.push({ pts, lanes: segs[first][2], closed });
    };
    segs.forEach((_, i) => {
        if (!used.has(i)) walk(i);
    });
    return out;
}

// pts with distance t0 cut off the start and t1 off the end, or null if
// nothing is left
function cutPath(pts, t0, t1) {
    const len = [0];
    for (let i = 1; i < pts.length; i++)
        len.push(
            len[i - 1] +
                Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
        );
    const total = len[len.length - 1];
    if (t0 + t1 >= total) return null;
    const at = (d) => {
        let i = 1;
        while (i < pts.length - 1 && len[i] < d) i++;
        const f = (d - len[i - 1]) / (len[i] - len[i - 1] || 1);
        return {
            x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
            y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
        };
    };
    const inner = pts.filter((_, i) => len[i] > t0 && len[i] < total - t1);
    return [at(t0), ...inner, at(total - t1)];
}

// pts shifted sideways by off (along the normal (-dy, dx) for off > 0), with
// mitred corners so the shifted line stays parallel through bends. On the
// outside of turns sharper than a right angle the miter would poke out past
// the road's edge, so those corners are bevelled (two points) instead.
function offsetPath(pts, off, closed) {
    const n = pts.length;
    const unit = (a, b) => {
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    };
    return pts.flatMap((p, i) => {
        const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 1] : null;
        const nxt = i < n - 1 ? pts[i + 1] : closed ? pts[0] : null;
        const d1 = prev ? unit(prev, p) : unit(p, nxt);
        const d2 = nxt ? unit(p, nxt) : d1;
        const n1 = { x: -d1.y, y: d1.x },
            n2 = { x: -d2.y, y: d2.x };
        const at = (nv) => ({ x: p.x + nv.x * off, y: p.y + nv.y * off });
        // Miter: along the average normal, lengthened so both sides stay off away
        const m = { x: n1.x + n2.x, y: n1.y + n2.y };
        const ml = Math.hypot(m.x, m.y);
        if (ml < 1e-6) return [at(n1), at(n2)]; // U-turn
        const cosHalf = (m.x * n1.x + m.y * n1.y) / ml;
        // d2 - d1 points to the inside of the turn; the shifted point is on the
        // outside when its offset direction points away from that
        const outside = off * (m.x * (d2.x - d1.x) + m.y * (d2.y - d1.y)) < 0;
        if (outside && cosHalf < Math.SQRT1_2 - 1e-9) return [at(n1), at(n2)];
        const k = off / Math.max(0.25, cosHalf); // cap very sharp inside miters
        return [{ x: p.x + (m.x / ml) * k, y: p.y + (m.y / ml) * k }];
    });
}

// Draws segments ([p, q, lanes] triples, lanes each way) as roads on context
// c. Segments are joined into chains first, so bends and corners draw as one
// continuous road. Each pass is drawn for every road before the next, so
// overlapping roads merge into clean junctions instead of one road's edge
// cutting across another.
function roads(c, segs) {
    const runs = chains(segs);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.setLineDash([]);
    // Kerb, asphalt, then a thin white edge line inset from each side
    [
        [0, "#bdb8ab"],
        [3, "#2e3033"],
        [7, "#e6e6df"],
        [9, "#2e3033"],
    ].forEach(([inset, color]) => {
        c.strokeStyle = color;
        runs.forEach(({ pts, lanes, closed }) => {
            c.lineWidth = roadWidth(lanes) - inset;
            polyline(pts, c, closed);
        });
    });
    // Markings, each a copy of the chain's center line shifted sideways by off:
    // a double solid yellow line between the directions, and dashed white
    // lines between the lanes on each side. They stop short of each chain end
    // by half the widest road meeting there, so junctions (and dead ends) stay
    // clear; loops have no ends.
    const key = (p) => p.x + "," + p.y;
    const clear = new Map();
    segs.forEach(([p, q, lanes]) =>
        [p, q].forEach((e) => {
            clear.set(
                key(e),
                Math.max(clear.get(key(e)) || 0, roadWidth(lanes) / 2),
            );
        }),
    );
    c.lineCap = "butt";
    c.lineJoin = "miter";
    runs.forEach(({ pts, lanes, closed }) => {
        const center = closed
            ? pts
            : cutPath(
                  pts,
                  clear.get(key(pts[0])),
                  clear.get(key(pts[pts.length - 1])),
              );
        if (!center) return;
        const marking = (off, width, color, dash) => {
            c.lineWidth = width;
            c.strokeStyle = color;
            c.setLineDash(dash);
            polyline(offsetPath(center, off, closed), c, closed);
        };
        [-1.2, 1.2].forEach((off) => marking(off, 1, "#f2c230", []));
        for (let k = 1; k < lanes; k++) {
            [-1, 1].forEach((side) =>
                marking(
                    side * k * LANE_W,
                    1,
                    "rgba(240, 240, 232, 0.9)",
                    [6, 9],
                ),
            );
        }
    });
    c.setLineDash([]);
    c.lineCap = "butt";
    c.lineJoin = "miter";
}
