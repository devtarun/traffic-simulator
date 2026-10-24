// Browser saves and exported backups share this data shape.
let autoSaveOnFirstRoad = false;

function saveData() {
    return {
        points: points.map(({ x, y }) => ({ x, y })),
        lines: lines.map((line) => [...line]),
        last,
        view: { ...view },
        lights: [...lights].map(([key, light]) => [key, light.green]),
    };
}

function normalizeSave(data) {
    if (!data || !Array.isArray(data.points) || !Array.isArray(data.lines))
        throw new Error("This file is not a valid traffic simulator backup.");

    const savedPoints = data.points.map((p) => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
            throw new Error("The backup contains an invalid point.");
        return { x: p.x, y: p.y };
    });
    const savedLines = data.lines.map((line) => {
        if (
            !Array.isArray(line) ||
            !Number.isInteger(line[0]) ||
            !Number.isInteger(line[1]) ||
            line[0] < 0 ||
            line[1] < 0 ||
            line[0] >= savedPoints.length ||
            line[1] >= savedPoints.length ||
            line[0] === line[1]
        )
            throw new Error("The backup contains an invalid road.");
        const lanes = line[2] ?? MAX_LANES;
        if (lanes !== 1 && lanes !== 2)
            throw new Error("The backup contains an invalid road type.");
        return [line[0], line[1], lanes];
    });
    const savedLast = data.last ?? null;
    if (
        savedLast !== null &&
        (!Number.isInteger(savedLast) ||
            savedLast < 0 ||
            savedLast >= savedPoints.length)
    )
        throw new Error("The backup contains an invalid road endpoint.");

    const savedView = data.view ?? { x: 0, y: 0, scale: 1 };
    if (
        !Number.isFinite(savedView.x) ||
        !Number.isFinite(savedView.y) ||
        !Number.isFinite(savedView.scale) ||
        savedView.scale <= 0
    )
        throw new Error("The backup contains an invalid view.");

    const savedLights = data.lights ?? [];
    if (!Array.isArray(savedLights))
        throw new Error("The backup contains invalid traffic lights.");
    const normalizedLights = savedLights.map(([key, green]) => {
        if (typeof key !== "string" || !Number.isFinite(green))
            throw new Error("The backup contains an invalid traffic light.");
        return [key, Math.max(GREEN_MIN, Math.min(GREEN_MAX, green))];
    });

    return {
        points: savedPoints,
        lines: savedLines,
        last: savedLast,
        view: { x: savedView.x, y: savedView.y, scale: savedView.scale },
        lights: normalizedLights,
    };
}

function applySave(data) {
    const saved = normalizeSave(data);
    points.length = 0;
    points.push(...saved.points);
    lines.length = 0;
    lines.push(...saved.lines);
    roadsChanged();
    last = saved.last;
    Object.assign(view, saved.view);
    lights.clear();
    saved.lights.forEach(([key, green]) =>
        lights.set(key, { green, start: 0 }),
    );
    junctionize(); // Older saves may have crossings without a shared point.
}

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        applySave(JSON.parse(raw));
        return true;
    } catch (err) {
        console.warn("Could not load saved canvas", err);
        return false;
    }
}

function storeSave(data = saveData()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSave(data)));
}

function restoreSave(data) {
    const saved = normalizeSave(data);
    storeSave(saved);
    applySave(saved);
}

const saveBtn = document.getElementById("save");
saveBtn.onclick = () => {
    try {
        storeSave();
        saveBtn.textContent = "Saved";
    } catch (err) {
        console.warn("Could not save canvas", err);
        saveBtn.textContent = "Save failed";
    }
    setTimeout(() => {
        saveBtn.textContent = "Save";
    }, 1200);
};
