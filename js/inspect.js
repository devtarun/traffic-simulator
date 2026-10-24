// The inspection panel (bottom left) for a selected junction or road. Its
// layout is built when the selection changes; the live values in it are
// refreshed every frame by updatePanel().

const panel = document.getElementById("panel");
const panelTitle = panel.querySelector(".panel-title");
const panelBody = panel.querySelector(".panel-body");
panel.querySelector(".panel-close").onclick = () => {
    selectedJunction = selectedRoad = null;
};

let panelFor = undefined; // what the panel was last built for
const STATE_NAMES = { green: "Green", amber: "Amber", red: "All red" };
const LEVEL_CLASS = {
    Free: "ok",
    Busy: "warn",
    Congested: "warn",
    Jammed: "bad",
};

function junctionStatus(j) {
    return j.gridlock
        ? ["Gridlock", "bad"]
        : j.blocked
          ? ["Blocked", "warn"]
          : ["Flowing", "ok"];
}

// Compass name for travel along line k in direction dir (screen up is north)
function heading(k, dir) {
    const p = points[lines[k][0]],
        q = points[lines[k][1]];
    const a = Math.atan2((q.y - p.y) * dir, (q.x - p.x) * dir); // 0 = east, π/2 = south
    return (
        [
            "East",
            "Southeast",
            "South",
            "Southwest",
            "West",
            "Northwest",
            "North",
            "Northeast",
        ][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8] + "bound"
    );
}

// Builds the junction panel's layout for junction node
function buildJunctionPanel(node) {
    const light = lightAt(node);
    panelTitle.textContent = "Intersection";
    panelBody.innerHTML = light
        ? `
    <div class="row"><span>Signal</span><b>Timed</b></div>
    <div class="row"><span>Phase</span><b><i class="lamp"></i><span data-v="phase"></span></b></div>
    <label class="row slider"><span>Green time</span><input type="range" min="${GREEN_MIN}" max="${GREEN_MAX}" step="1" value="${light.green}"><b data-v="green"></b></label>
    <div class="row"><span>Waiting</span><b data-v="waiting"></b></div>
    <div class="row"><span>Status</span><b data-v="status"></b></div>
    <button data-a="toggle">Remove signal</button>`
        : `
    <div class="row"><span>Signal</span><b>None (give way)</b></div>
    <div class="row"><span>Waiting</span><b data-v="waiting"></b></div>
    <div class="row"><span>Status</span><b data-v="status"></b></div>
    <button data-a="toggle">Add timed signal</button>`;
    const slider = panelBody.querySelector("input[type=range]");
    if (slider)
        slider.oninput = () => {
            const l = lightAt(node);
            if (l) l.green = +slider.value;
        };
    panelBody.querySelector("[data-a=toggle]").onclick = () => {
        toggleLight(node);
        panelFor = undefined;
    };
}

// Builds the road panel's layout for line k: a column per direction
function buildRoadPanel(k) {
    panelTitle.textContent =
        (lines[k][2] === 1 ? "2-lane" : "4-lane") + " road";
    const rows = [
        ["cars", "Cars"],
        ["speed", "Avg speed"],
        ["flow", "Flow"],
        ["queue", "Queue"],
        ["wait", "Avg wait"],
        ["level", "Traffic"],
    ];
    panelBody.innerHTML = `
    <div class="grid">
      <span></span><b>${heading(k, 1)}</b><b>${heading(k, -1)}</b>
      ${rows.map(([id, name]) => `<span>${name}</span><b data-v="${id}1"></b><b data-v="${id}-1"></b>`).join("")}
    </div>`;
}

// Gridlock toasts, stacked at the bottom right, newest at the bottom. Each
// fades out after TOAST_TIME unless clicked; clicking one removes it and
// centres the view on its junction (keeping the zoom).
const TOAST_TIME = 3000; // ms
const toasts = document.getElementById("toasts");

function centerOn(p) {
    view.x = canvas.clientWidth / 2 - p.x * view.scale;
    view.y = canvas.clientHeight / 2 - p.y * view.scale;
}

// Shows a toast with a bold title and a smaller line under it. kind picks
// the colour ('alert' red, 'info' dark); onClick runs when it's clicked,
// and any click removes it.
function showToast(title, sub, kind = "info", onClick = null) {
    const el = document.createElement("button");
    el.className = "toast " + kind;
    el.innerHTML = "<b></b><span></span>";
    el.querySelector("b").textContent = title;
    el.querySelector("span").textContent = sub;
    const dismiss = () => {
        if (el.classList.contains("gone")) return;
        el.classList.add("gone");
        setTimeout(() => el.remove(), 300); // after the fade-out
    };
    el.onclick = () => {
        if (onClick) onClick();
        dismiss();
    };
    toasts.appendChild(el);
    setTimeout(dismiss, TOAST_TIME);
}

function showGridlockToast(p) {
    const at = { x: p.x, y: p.y }; // a copy, as points can change before it's clicked
    showToast("⚠ Gridlock", "Click to view the intersection", "alert", () =>
        centerOn(at),
    );
}

// Shows, hides, rebuilds or refreshes the panel to match the selection
function updatePanel(t) {
    const j =
        selectedJunction !== null ? t.junctions.get(selectedJunction) : null;
    const road =
        !j && selectedRoad !== null && lines[selectedRoad]
            ? selectedRoad
            : null;
    const want = j
        ? "j" + j.node + ":" + (lightAt(j.node) ? "timed" : "none")
        : road !== null
          ? "r" + road
          : null;
    if (want !== panelFor) {
        panelFor = want;
        panel.hidden = !want;
        panel.classList.toggle("wide", road !== null);
        if (j) buildJunctionPanel(j.node);
        else if (road !== null) buildRoadPanel(road);
    }
    const set = (k, text, cls) => {
        const el = panelBody.querySelector(`[data-v="${k}"]`);
        if (!el) return;
        if (el.textContent !== text) el.textContent = text;
        if (cls !== undefined) el.className = cls;
    };
    if (j) {
        const light = lightAt(j.node);
        if (light) {
            const cyc = lightCycle(light, j);
            set(
                "phase",
                `${cyc.phase + 1} of ${j.phases.length} · ${STATE_NAMES[cyc.state]} · ${Math.ceil(cyc.left)} s`,
            );
            panelBody.querySelector(".lamp").className = "lamp " + cyc.state;
            set("green", light.green + " s");
        }
        set(
            "waiting",
            String(
                t.cars.filter(
                    (c) => c.path && c.waitingAt === j.node && c.v < 1,
                ).length,
            ),
        );
        const [status, cls] = junctionStatus(j);
        set("status", status, cls);
    } else if (road !== null) {
        [1, -1].forEach((dir) => {
            const st = roadStats(t, road, dir);
            set("cars" + dir, String(st.cars));
            set(
                "speed" + dir,
                st.cars ? Math.round(st.speed * 100) + "%" : "–",
            );
            set("flow" + dir, st.flow.toFixed(0) + "/min");
            set(
                "queue" + dir,
                st.stopped ? `${st.stopped} (${Math.round(st.queue)} px)` : "0",
            );
            set("wait" + dir, st.stopped ? st.wait.toFixed(1) + " s" : "–");
            set("level" + dir, st.level, LEVEL_CLASS[st.level]);
        });
    }
}
