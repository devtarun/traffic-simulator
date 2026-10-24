// Editing roads with the pointer, the viewport, and the Snap and Reset buttons

function connect(a, b) {
    if (a !== null) addLine(a, b, roadLanes);
}

// Removes point i and its lines, shifting later indices down to match
function remove(i) {
    points.splice(i, 1);
    roadsChanged();
    const kept = lines
        .filter(([a, b]) => a !== i && b !== i)
        .map(([a, b, lanes]) => [a > i ? a - 1 : a, b > i ? b - 1 : b, lanes]);
    lines.length = 0;
    lines.push(...kept);
    if (last === i) last = null;
    else if (last > i) last--;
}

// Removes points with no roads, except last: a new chain's first point has
// none until the next click. Highest index first, so remove()'s shifting
// doesn't skip any.
function prune() {
    for (let i = points.length - 1; i >= 0; i--) {
        if (i !== last && !lines.some(([a, b]) => a === i || b === i))
            remove(i);
    }
}

// Where a click at p lands: an existing point within HIT px if there is one.
// Otherwise, with snapping on, p is moved onto the horizontal or vertical
// through last when the road from last is within SNAP_ANGLE of it. Then, if
// that lands on an existing road, it joins the road there: `split` is the
// line to split at the new point.
function target(p) {
    const i = hitTest(p);
    if (i !== null) return { p: points[i], i };
    let q = p,
        axis = null;
    if (snap && last !== null) {
        const o = points[last];
        const dx = Math.abs(p.x - o.x),
            dy = Math.abs(p.y - o.y);
        const off =
            (Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180) / Math.PI;
        if (off <= SNAP_ANGLE) {
            axis = dx > dy ? "x" : "y";
            q = axis === "x" ? { x: p.x, y: o.y } : { x: o.x, y: p.y };
            // Snapping can land on or near a point the raw position missed: reuse it,
            // rather than stacking a new point (and a duplicate road) on top of it
            const j = hitTest(q);
            if (j !== null) return { p: points[j], i: j };
        }
    }
    const road = roadAt(q, axis);
    if (road) {
        const j = hitTest(road.p);
        return j !== null
            ? { p: points[j], i: j }
            : { p: road.p, i: null, split: road.line };
    }
    return { p: q, i: null };
}

// Road type menu, opened by right clicking empty canvas. The chosen type
// (lanes each way) applies to roads drawn from then on.
const menu = document.getElementById("road-menu");
function openMenu(e) {
    menu.querySelectorAll("button").forEach((b) =>
        b.classList.toggle("current", +b.dataset.lanes === roadLanes),
    );
    menu.hidden = false;
    // Keep it on screen near the window edges
    menu.style.left =
        Math.min(e.clientX, innerWidth - menu.offsetWidth - 4) + "px";
    menu.style.top =
        Math.min(e.clientY, innerHeight - menu.offsetHeight - 4) + "px";
}
function closeMenu() {
    menu.hidden = true;
}
menu.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
        roadLanes = +b.dataset.lanes;
        closeMenu();
    };
});
menu.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointerdown", (e) => {
    // While the menu is open, a left or middle press only closes it (no point,
    // no drag); a right click carries on below and may reopen it elsewhere
    if (!menu.hidden) {
        closeMenu();
        if (e.button !== 2) return;
    }
    // With road building disabled, right-click never edits the road network.
    if (e.button === 2 && !roadEnabled) {
        clearSelection();
        return;
    }
    // Right click on a point removes it; elsewhere it ends the current chain
    // and opens the road type menu. Either way, points left with no roads go too.
    if (e.button === 2) {
        const i = hitTest(pos(e));
        if (i === null) {
            last = null;
            openMenu(e);
        } else {
            const n = lines.filter(([a, b]) => a === i || b === i).length;
            if (
                !confirm(
                    `Remove this point${n ? ` and its ${n} road${n > 1 ? "s" : ""}` : ""}?`,
                )
            )
                return;
            remove(i);
            pointer = pos(e);
        }
        prune();
        return;
    }
    // Left or middle press: a drag pans the view; a left click adds a point on release
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drag = {
        button: e.button,
        start: screenPos(e),
        view: { ...view },
        moved: false,
    };
});
canvas.addEventListener("pointermove", (e) => {
    if (drag) {
        const s = screenPos(e);
        const dx = s.x - drag.start.x,
            dy = s.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) > DRAG) {
            drag.moved = true;
            canvas.style.cursor = "grabbing";
        }
        if (drag.moved) {
            view.x = drag.view.x + dx;
            view.y = drag.view.y + dy;
        }
    } else {
        // Show an interactive cursor over objects available in the current toggles.
        const w = pos(e),
            k = hitTest(w);
        const canSelect = !roadEnabled && (carAt(w) || boxAt(w));
        const canSignal =
            trafficEnabled && k !== null && traffic.junctions.has(k);
        canvas.style.cursor = canSelect || canSignal ? "pointer" : "";
    }
    pointerScreen = screenPos(e);
    pointer = target(pos(e)).p;
});
canvas.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const click = drag.button === 0 && !drag.moved;
    drag = null;
    canvas.style.cursor = "";
    if (!click) return;
    const w = pos(e),
        junction = hitTest(w);
    // Traffic and Road are independent toggles. Signal placement takes priority
    // on junctions while Traffic is on; otherwise Road controls construction.
    if (
        trafficEnabled &&
        junction !== null &&
        traffic.junctions.has(junction)
    ) {
        clearSelection();
        toggleLight(junction);
        selectedJunction = junction;
        return;
    }
    // With Road off, allow inspection of cars and buildings without editing.
    if (!roadEnabled) {
        clearSelection();
        selectedCar = carAt(w);
        selectedBox = selectedCar ? null : boxAt(w);
        return;
    }
    let { p, i, split } = target(pos(e));
    if (i === null) {
        points.push(p);
        i = points.length - 1;
        roadsChanged();
        if (split != null) splitLine(split, i); // joined onto a road: T-junction
    }
    connect(last, i);
    junctionize(); // the new road may cross others
    last = i;
    pointer = points[i];
    if (autoSaveOnFirstRoad && lines.length) {
        try {
            storeSave();
            autoSaveOnFirstRoad = false;
            showToast(
                "New game saved",
                "Your first road is saved in this browser",
            );
        } catch (err) {
            console.warn("Could not auto-save the new game", err);
            showToast(
                "Could not save game",
                "Use Save in Settings to retry",
                "alert",
            );
            autoSaveOnFirstRoad = false;
        }
    }
});
canvas.addEventListener("pointercancel", () => {
    drag = null;
    canvas.style.cursor = "";
});

// Wheel zooms around the pointer: the world point under it stays put
canvas.addEventListener(
    "wheel",
    (e) => {
        e.preventDefault();
        closeMenu();
        const s = screenPos(e);
        const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1); // lines → px
        const scale = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, view.scale * Math.exp(-delta * 0.0015)),
        );
        view.x = s.x - ((s.x - view.x) * scale) / view.scale;
        view.y = s.y - ((s.y - view.y) * scale) / view.scale;
        view.scale = scale;
        pointer = target(pos(e)).p;
    },
    { passive: false },
);
canvas.addEventListener("pointerleave", () => {
    pointer = null;
    pointerScreen = null;
});

// WASD pans the view while held: W up, A left, S down, D right. Keys are
// tracked here and applied each frame by panKeys(), so movement is smooth.
// Combinations with Ctrl, Alt or Meta are left to the browser (Ctrl+S, Ctrl+W...).
const PAN_KEYS = { KeyW: [0, 1], KeyA: [1, 0], KeyS: [0, -1], KeyD: [-1, 0] };
const held = new Set();
window.addEventListener("keydown", (e) => {
    if (!(e.code in PAN_KEYS) || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    held.add(e.code);
});
window.addEventListener("keyup", (e) => held.delete(e.code));
window.addEventListener("blur", () => held.clear()); // keyup is lost if focus leaves mid-press

function panKeys(dt) {
    let dx = 0,
        dy = 0;
    held.forEach((k) => {
        dx += PAN_KEYS[k][0];
        dy += PAN_KEYS[k][1];
    });
    // Normalise so diagonals aren't faster; opposite keys cancel out
    const len = Math.hypot(dx, dy);
    if (!len) return;
    view.x += (dx / len) * PAN_SPEED * dt;
    view.y += (dy / len) * PAN_SPEED * dt;
    // The world under a still pointer has moved, so the preview follows it
    if (pointerScreen) pointer = target(screenToWorld(pointerScreen)).p;
}

function setPaused(p) {
    paused = p;
}

// Speed button (top right, left of the gear): cycles normal → 2× → 3×
const speedBtn = document.getElementById("speed");
const SPEED_NAMES = { 1: "Normal speed", 2: "2× speed", 3: "3× speed" };
speedBtn.onclick = () => {
    simSpeed = (simSpeed % 3) + 1;
    speedBtn.textContent = "❯".repeat(simSpeed);
    speedBtn.title = `${SPEED_NAMES[simSpeed]} (click for ${SPEED_NAMES[(simSpeed % 3) + 1].toLowerCase()})`;
    speedBtn.setAttribute(
        "aria-label",
        "Simulation speed: " + SPEED_NAMES[simSpeed].toLowerCase(),
    );
    speedBtn.classList.toggle("fast", simSpeed > 1);
};

// Settings popup, opened by the gear (top right): Snap, Save, Reset and
// Resume stacked in the middle of the screen over a blurred backdrop, which
// covers the canvas. The simulation pauses while it's open and resumes on
// close if it was running. It closes on Resume, Escape, Reset, or a click
// on the backdrop.
const settingsBtn = document.getElementById("settings");
const settingsMenu = document.getElementById("settings-menu");
let pausedBeforeSettings = false;
function openSettings() {
    pausedBeforeSettings = paused;
    setPaused(true);
    settingsMenu.hidden = false;
    settingsBtn.setAttribute("aria-expanded", "true");
}
function closeSettings() {
    if (settingsMenu.hidden) return;
    settingsMenu.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
    setPaused(pausedBeforeSettings);
}
settingsBtn.onclick = () =>
    settingsMenu.hidden ? openSettings() : closeSettings();
document.getElementById("resume").onclick = closeSettings;
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
});
settingsMenu.addEventListener("click", (e) => {
    if (e.target === settingsMenu) closeSettings();
}); // the backdrop

// Mode buttons at the bottom: Road builds roads, Traffic manages and
// inspects traffic. Switching ends any road being drawn and clears selections.
function clearSelection() {
    selectedCar = selectedBox = selectedJunction = selectedRoad = null;
}
function updateToolToggles() {
    const roadButton = document.getElementById("mode-road");
    const trafficButton = document.getElementById("mode-traffic");
    roadButton.classList.toggle("active", roadEnabled);
    trafficButton.classList.toggle("active", trafficEnabled);
    roadButton.setAttribute("aria-pressed", String(roadEnabled));
    trafficButton.setAttribute("aria-pressed", String(trafficEnabled));
    closeMenu();
    canvas.style.cursor = "";
}
// Traffic − / +: change the number of cars by 10% of normal, with a toast
function adjustTraffic(delta) {
    const more = delta > 0;
    if (changeTraffic(traffic, delta)) {
        showToast(
            `Traffic ${more ? "increased" : "decreased"} by 10%`,
            `Now ${Math.round(trafficLevel * 100)}% of normal · ${traffic.cars.length} cars`,
        );
    } else {
        showToast(
            `Traffic is already at its ${more ? "maximum" : "minimum"}`,
            `${Math.round(trafficLevel * 100)}% of normal`,
        );
    }
}
document.getElementById("traffic-less").onclick = () =>
    adjustTraffic(-TRAFFIC_STEP);
document.getElementById("traffic-more").onclick = () =>
    adjustTraffic(TRAFFIC_STEP);

document.getElementById("mode-road").onclick = () => {
    roadEnabled = !roadEnabled;
    if (!roadEnabled) last = null;
    updateToolToggles();
};
document.getElementById("mode-traffic").onclick = () => {
    trafficEnabled = !trafficEnabled;
    updateToolToggles();
};

const snapBtn = document.getElementById("snap");
snapBtn.onclick = () => {
    snap = !snap;
    snapBtn.textContent = `Snap: ${snap ? "on" : "off"}`;
};

document.getElementById("reset").onclick = () => {
    points.length = 0;
    lines.length = 0;
    last = null;
    roadsChanged();
    lights.clear();
    closeSettings();
};
